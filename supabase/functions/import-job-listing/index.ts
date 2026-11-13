import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Many job boards (LinkedIn, Indeed, Workday, ...) render their content with
// client-side JS, so a plain fetch of the target URL just gets an empty app
// shell. Route through Jina's free reader proxy instead, which renders the
// page with a real browser and returns clean text — no API key needed for
// this volume of use. It may reply as JSON ({ content: "..." }) or as plain
// text depending on request headers, so handle both.
async function fetchListingText(url: string, waitSeconds: number): Promise<string> {
  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      // Force real JS rendering and make Reader wait for the page to
      // actually settle instead of returning an early, half-rendered
      // snapshot — the default behaviour occasionally does the latter.
      'X-Engine': 'browser',
      'X-Timeout': String(waitSeconds),
      'X-Respond-Timing': 'network-idle',
    },
    signal: AbortSignal.timeout((waitSeconds + 10) * 1000),
  });

  if (!response.ok) {
    throw new Error(`Reader proxy responded ${response.status}`);
  }

  const raw = await response.text();
  let text: string;
  try {
    const parsed = JSON.parse(raw);
    text = parsed.content ?? parsed.data?.content ?? raw;
  } catch {
    text = raw;
  }

  return cleanReaderText(text).slice(0, MAX_PAGE_TEXT_CHARS);
}

// Job boards wrap the listing in heavy nav/footer chrome, which Reader
// returns as markdown links and images. On Jobgether that chrome pushed the
// real "Job description" section past the old 12,000-char cap, so the model
// only saw its first lines and invented the rest. Link URLs and images carry
// nothing the extraction needs, so keep just the visible link text, and
// allow more room overall.
const MAX_PAGE_TEXT_CHARS = 20000;

// Checkbox lines ("- [x] ...") are form controls, never listing content.
// Jobgether's "report this job" form renders as "- [x] This job is not
// fully remote - [x] Remote location is not correct ...", which the model
// read as a statement about the job and classified a remote role as hybrid.
const CHECKBOX_LINE = /^\s*[-*+]\s+\[[ xX]\]\s/;

function cleanReaderText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !CHECKBOX_LINE.test(line))
    .join('\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Even with the headers above, the free reader proxy occasionally still
// returns a half-rendered snapshot. Retry once with a longer wait before
// giving up, rather than silently extracting from near-empty content.
const MIN_USABLE_PAGE_TEXT_LENGTH = 500;

async function fetchListingTextWithRetry(url: string): Promise<string> {
  const first = await fetchListingText(url, 10);
  if (first.length >= MIN_USABLE_PAGE_TEXT_LENGTH) return first;

  console.log('[import-job-listing] first fetch too short, retrying:', first.length);
  return await fetchListingText(url, 20);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// HTML job-description markup to plain text, keeping paragraph and list
// breaks so the model sees the description's real structure.
function htmlToText(html: string): string {
  return decodeEntities(
    decodeEntities(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*(\n\s*)+/g, '\n\n')
    .trim();
}

const MAX_JSON_LD_DESCRIPTION_CHARS = 8000;

// Many ATS platforms (Ashby, Greenhouse, Lever, Workday, ...) embed a
// schema.org JobPosting block in the raw page HTML for SEO — server-rendered,
// no JS needed to see it. It carries exact, unambiguous fields (workplace/
// location type, employment type, salary, location) that Jina's readability
// extraction above silently drops, since it's metadata rather than visible
// "article" content — that's the actual reason location type/similar fields
// have gone missing, not the model failing to infer them from prose. This is
// a best-effort supplement to the scraped text, never a replacement: returns
// null on any failure (blocked fetch, no such tag, unparseable JSON, no
// JobPosting entry) rather than blocking the import.
//
// Its `description` is returned separately, as plain text. It was once
// dropped as a duplicate of the scraped text, but the reader proxy can pick
// the wrong "main content": on Teamtailor career sites it returns the
// privacy-policy modal and none of the job ad, so this is sometimes the
// only copy of the real description the model gets.
async function fetchJobPostingJsonLd(
  url: string,
): Promise<{ metadata: string; description: string | null } | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobSearch365/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;

    const html = await response.text();
    const scriptMatches = html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    );

    for (const match of scriptMatches) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(match[1].trim());
      } catch {
        continue;
      }

      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        if (candidate && typeof candidate === 'object' && candidate['@type'] === 'JobPosting') {
          const { description: rawDescription, ...metadata } = candidate as Record<string, unknown>;
          const description =
            typeof rawDescription === 'string'
              ? htmlToText(rawDescription).slice(0, MAX_JSON_LD_DESCRIPTION_CHARS)
              : '';
          return {
            metadata: JSON.stringify(metadata).slice(0, 4000),
            description: description || null,
          };
        }
      }
    }
    return null;
  } catch (err) {
    console.log('[import-job-listing] JSON-LD fetch failed (non-fatal):', err);
    return null;
  }
}

// Some ATS platforms don't render their job content server-side at all —
// notably Greenhouse's embeddable "job board" widget
// (<script src="https://boards.greenhouse.io/embed/job_board/js?for=TOKEN">
// alongside <div id="grnhse_app">), which renders a single job into that
// div entirely client-side, keyed off the page's own ?gh_jid= query param,
// by making its own API call. Neither a plain fetch nor Jina's reader proxy
// (even with browser rendering) sees that content: the proxy renders the
// surrounding host page but doesn't execute/wait for this specific widget's
// own async fetch, so "readable" text extracted from pages using it comes
// back as just site chrome (nav/footer) with no job content — and
// Greenhouse's own canonical board URL for the job typically redirects
// straight back to this same embedding page, so there's no alternate
// server-rendered page to fall back to either. Greenhouse's job data is
// public via its own Boards API though, keyed by the same token + job id
// used by the embed, so detect this pattern and go straight to the source.
async function fetchGreenhouseEmbedJob(url: string): Promise<string | null> {
  try {
    const jobId = new URL(url).searchParams.get('gh_jid');
    if (!jobId) return null;

    const pageResponse = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobSearch365/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!pageResponse.ok) return null;

    const html = await pageResponse.text();
    const tokenMatch = html.match(
      /boards\.greenhouse\.io\/embed\/job_board\/js\?for=([a-zA-Z0-9_-]+)/,
    );
    if (!tokenMatch) return null;

    const apiResponse = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${tokenMatch[1]}/jobs/${jobId}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!apiResponse.ok) return null;

    const job = await apiResponse.json();
    if (!job?.title) return null;

    // The API's `content` field is itself HTML, but the whole thing comes
    // back entity-encoded on top of that (e.g. "&lt;div&gt;" rather than
    // "<div>") — decode once to get real HTML, strip tags, then decode
    // again for entities that were part of the actual text (e.g. "&amp;").
    let description = decodeEntities(String(job.content ?? ''));
    description = description.replace(/<[^>]+>/g, ' ');
    description = decodeEntities(description).replace(/\s+/g, ' ').trim();

    return JSON.stringify({
      job_title: job.title,
      employer: job.company_name,
      location: job.location?.name ?? null,
      description,
    }).slice(0, 8000);
  } catch (err) {
    console.log('[import-job-listing] Greenhouse embed fetch failed (non-fatal):', err);
    return null;
  }
}

// Nano over-picks "hybrid" from incidental wording (e.g. a remote role whose
// team "may be working remotely or based on site"), and prompting alone
// didn't stop it. Hybrid has to be stated, so require evidence for it in
// the text the model was given; when there's none and the listing clearly
// says remote, the model's hybrid is overridden to remote.
const HYBRID_EVIDENCE = [
  /\bhybrid\b/i,
  /\b(?:\d|one|two|three|four)\s*(?:\+\s*)?days?\s+(?:a|per|each)\s+week\b/i,
  /\bdays?\s+(?:in|at)\s+(?:the\s+|our\s+)?office\b/i,
  /\boffice[^.\n]{0,40}\b(?:\d|one|two|three|four)\s+days?\b/i,
];
const REMOTE_EVIDENCE = [
  /\bremote\s+from\b/i,
  /\bfully[\s-]remote\b/i,
  /\b100%\s*remote\b/i,
  /\bremote[\s-]first\b/i,
  /\bwork(?:ing)?\s+(?:\w+\s+)?from\s+home\b/i,
  /\b(?:workplace|work\s+type|location\s+type|work\s+model)\s*(?:type)?\s*[:-]\s*remote\b/i,
  /"(?:workplaceType|workplace_type)"\s*:\s*"remote"/i,
];

function correctLocationType(modelValue: unknown, sourceText: string): unknown {
  if (modelValue !== 'hybrid') return modelValue;
  if (HYBRID_EVIDENCE.some((re) => re.test(sourceText))) return modelValue;
  if (!REMOTE_EVIDENCE.some((re) => re.test(sourceText))) return modelValue;
  console.log('[import-job-listing] location_type hybrid -> remote: no hybrid wording, explicit remote wording');
  return 'remote';
}

const EXTRACTION_KEYS = [
  'job_title',
  'employer',
  'salary_min',
  'salary_max',
  'salary_currency',
  'salary_type',
  'employment_type',
  'location_type',
  'location',
  'description',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  const { url } = await req.json();
  if (!url) {
    return jsonResponse({ error: 'Missing url' }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return jsonResponse({ error: 'That URL is not valid' }, 400);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return jsonResponse({ error: 'Only http/https URLs are supported' }, 400);
  }

  let pageText: string;
  let jobPostingJsonLd: Awaited<ReturnType<typeof fetchJobPostingJsonLd>>;
  let greenhouseEmbedJob: string | null;
  try {
    console.log('[import-job-listing] fetching listing:', url);
    [pageText, jobPostingJsonLd, greenhouseEmbedJob] = await Promise.all([
      fetchListingTextWithRetry(url),
      fetchJobPostingJsonLd(url),
      fetchGreenhouseEmbedJob(url),
    ]);
    console.log('[import-job-listing] extracted page text length:', pageText.length);
    console.log(
      '[import-job-listing] JobPosting JSON-LD found:',
      !!jobPostingJsonLd,
      'description length:',
      jobPostingJsonLd?.description?.length ?? 0,
    );
    console.log('[import-job-listing] Greenhouse embed job found:', !!greenhouseEmbedJob);
  } catch (err) {
    console.log('[import-job-listing] listing fetch failed:', err);
    return jsonResponse({ error: 'Failed to fetch that job listing' }, 502);
  }

  // A Greenhouse embed hit is the real job content straight from the
  // source, even when the page itself rendered as near-empty chrome — only
  // bail out for unreadable pages when neither source came through.
  const jsonLdDescription = jobPostingJsonLd?.description ?? null;
  if (
    pageText.length < MIN_USABLE_PAGE_TEXT_LENGTH &&
    !greenhouseEmbedJob &&
    (jsonLdDescription?.length ?? 0) < MIN_USABLE_PAGE_TEXT_LENGTH
  ) {
    console.log('[import-job-listing] page text too short, likely unreadable:', pageText);
    return jsonResponse(
      { error: "Couldn't read enough from that listing to extract details." },
      502,
    );
  }

  const systemPrompt =
    'You extract structured job posting data from webpage text. Respond ' +
    'with ONLY a json object, no markdown, using exactly these keys: ' +
    'job_title, employer, salary_min, salary_max, salary_currency ' +
    '(3-letter code), salary_type (one of annual, monthly, weekly, hourly), ' +
    'employment_type (one of full_time, part_time), location_type (one of ' +
    'on_site, hybrid, remote), location (city/region text), description ' +
    '(the full job description as plain text: copy the listing\'s own ' +
    'wording, never summarise, paraphrase or add anything. If the page has ' +
    'both a short overview/summary and a full job description section, use ' +
    'the full section. If the text stops partway through, end the ' +
    'description where the text ends rather than continuing it). Use null for ' +
    "anything not clearly stated in the page — don't invent details. If a " +
    "block of structured JobPosting data is included, it came straight from " +
    "the page's own SEO metadata — prefer its explicit fields (employmentType, " +
    'baseSalary, jobLocation) over inferring the same thing from prose. For ' +
    'location_type specifically: if a workplaceType-style field spells out ' +
    '"Hybrid"/"Remote"/"On-site" (or similar) in plain words, use that — it is ' +
    "the reliable signal. Schema.org's own jobLocationType is NOT reliable for " +
    'this: a value of "TELECOMMUTE" only means some remote work is allowed, ' +
    "it does NOT mean fully remote, and many hybrid roles are tagged that way " +
    "too — never map TELECOMMUTE to remote by itself; fall back to it only " +
    'when nothing clearer is available, and prefer hybrid over remote in that ' +
    'case if the page mentions any office/on-site presence at all. That ' +
    'hybrid preference applies ONLY to the TELECOMMUTE fallback. Otherwise ' +
    'use what the listing states: "Remote", "fully remote", "work from home" ' +
    'or "Remote from <country/region>" means remote; choose hybrid only when ' +
    'the listing says hybrid or describes a regular office/home split (e.g. ' +
    '"2 days a week in the office"). A passing mention that some colleagues ' +
    'work on site does not make a remote role hybrid. Judge only from the ' +
    "listing itself, never from the site's forms, feedback options or other " +
    'jobs shown on the page. If a ' +
    "block of structured job data from Greenhouse's job board API is " +
    'included, it is the authoritative source for this listing (the page ' +
    "itself is a client-side embed with no visible job content) — use its " +
    'job_title, employer, and location fields directly, and extract ' +
    'salary/employment_type/location_type from its description text. If a ' +
    "block headed \"Job description (from the page's JobPosting data)\" is " +
    "included, it is the employer's own text for this job: base the " +
    'description on it. The webpage text can contain unrelated site content ' +
    '(privacy policies, cookie notices, navigation, other vacancies) and ' +
    'sometimes none of the job ad at all. Never use that unrelated content ' +
    'as the description; the description must describe this job only. ' +
    'Example json shape: {"job_title": "Software Engineer", "employer": ' +
    '"Acme Ltd", "salary_min": 45000, "salary_max": 55000, ' +
    '"salary_currency": "GBP", "salary_type": "annual", "employment_type": ' +
    '"full_time", "location_type": "hybrid", "location": "London", ' +
    '"description": "..."}';

  const jsonLdBlocks = jobPostingJsonLd
    ? `Structured JobPosting data (from the page's own SEO metadata):\n${jobPostingJsonLd.metadata}` +
      (jsonLdDescription
        ? `\n\nJob description (from the page's JobPosting data):\n${jsonLdDescription}`
        : '')
    : '';

  const userContent = greenhouseEmbedJob
    ? `Structured job data (from Greenhouse's job board API, authoritative):\n${greenhouseEmbedJob}` +
      (jsonLdBlocks ? `\n\n${jsonLdBlocks}` : '')
    : jsonLdBlocks
      ? `${jsonLdBlocks}\n\nWebpage text:\n${pageText}`
      : `Webpage text:\n${pageText}`;

  try {
    // Nemotron (NVIDIA) on AWS Bedrock, eu-west-2 (London), via Bedrock's
    // OpenAI-compatible Chat Completions endpoint — same messages-in/
    // choices-out shape DeepSeek used, just a different host and a
    // long-term Bedrock API key as a bearer token (no AWS request signing
    // needed). `response_format: json_object` support isn't confirmed for
    // this model on this endpoint, so it's deliberately omitted rather than
    // risking a hard error on every call — the prompt already explicitly
    // asks for JSON in its own text, and the JSON.parse below already
    // fails safe if that's ever not honored, same as it always has.
    console.log('[import-job-listing] calling Bedrock');
    const bedrockResponse = await fetch(
      'https://bedrock-mantle.eu-west-2.api.aws/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('BEDROCK_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Nano rather than Super here specifically: this call's large
          // page-text context pushed Super past a 30s budget. Nano trades
          // some extraction nuance (e.g. the TELECOMMUTE/hybrid/remote
          // judgment call below) for materially lower latency — worth
          // keeping an eye on actual extraction quality, not just speed.
          model: 'nvidia.nemotron-nano-3-30b',
          // The description is copied out in full, so a long listing needs
          // room: at 4096 a long description was cut off mid-string,
          // leaving JSON that couldn't be parsed.
          max_completion_tokens: 8192,
          // Keep extraction consistent run-to-run rather than creative.
          temperature: 0,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        // Kept at 60s as a safety margin until Nano's real-world latency
        // on this call is observed — tighten once that's known.
        signal: AbortSignal.timeout(60000),
      },
    );

    console.log('[import-job-listing] Bedrock responded:', bedrockResponse.status);

    if (!bedrockResponse.ok) {
      const detail = await bedrockResponse.text();
      console.log('[import-job-listing] Bedrock call failed:', detail);
      return jsonResponse({ error: 'Failed to read that job listing' }, 502);
    }

    const result = await bedrockResponse.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      console.log('[import-job-listing] no content in Bedrock response:', JSON.stringify(result));
      return jsonResponse({ error: 'Failed to read that job listing' }, 502);
    }

    // The prompt asks for bare JSON, but tolerate ```json fences or a
    // stray sentence around it: parse from the first "{" to the last "}".
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(start >= 0 && end > start ? content.slice(start, end + 1) : content);
    } catch {
      console.log(
        '[import-job-listing] failed to parse Bedrock JSON (finish_reason:',
        result.choices?.[0]?.finish_reason,
        '):',
        content,
      );
      return jsonResponse({ error: 'Failed to read that job listing' }, 502);
    }

    const job: Record<string, unknown> = {};
    for (const key of EXTRACTION_KEYS) {
      job[key] = extracted[key] ?? null;
    }
    job.location_type = correctLocationType(job.location_type, userContent);

    console.log('[import-job-listing] extracted job:', JSON.stringify(job));

    return jsonResponse({ job }, 200);
  } catch (err) {
    console.log('[import-job-listing] Bedrock call failed:', err);
    return jsonResponse({ error: 'Failed to read that job listing' }, 502);
  }
});
