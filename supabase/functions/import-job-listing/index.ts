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

  return text.trim().slice(0, 12000);
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
async function fetchJobPostingJsonLd(url: string): Promise<string | null> {
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
          // Drop `description` — it's a large HTML-formatted duplicate of
          // what the scraped page text already provides; keeping only the
          // structured metadata fields keeps this compact and non-redundant.
          const { description: _description, ...metadata } = candidate as Record<string, unknown>;
          return JSON.stringify(metadata).slice(0, 4000);
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
    const decodeEntities = (s: string) =>
      s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
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
  let jobPostingJsonLd: string | null;
  let greenhouseEmbedJob: string | null;
  try {
    console.log('[import-job-listing] fetching listing:', url);
    [pageText, jobPostingJsonLd, greenhouseEmbedJob] = await Promise.all([
      fetchListingTextWithRetry(url),
      fetchJobPostingJsonLd(url),
      fetchGreenhouseEmbedJob(url),
    ]);
    console.log('[import-job-listing] extracted page text length:', pageText.length);
    console.log('[import-job-listing] JobPosting JSON-LD found:', !!jobPostingJsonLd);
    console.log('[import-job-listing] Greenhouse embed job found:', !!greenhouseEmbedJob);
  } catch (err) {
    console.log('[import-job-listing] listing fetch failed:', err);
    return jsonResponse({ error: 'Failed to fetch that job listing' }, 502);
  }

  // A Greenhouse embed hit is the real job content straight from the
  // source, even when the page itself rendered as near-empty chrome — only
  // bail out for unreadable pages when neither source came through.
  if (pageText.length < MIN_USABLE_PAGE_TEXT_LENGTH && !greenhouseEmbedJob) {
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
    "(the full job description, cleaned up as plain text). Use null for " +
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
    'case if the page mentions any office/on-site presence at all. If a ' +
    "block of structured job data from Greenhouse's job board API is " +
    'included, it is the authoritative source for this listing (the page ' +
    "itself is a client-side embed with no visible job content) — use its " +
    'job_title, employer, and location fields directly, and extract ' +
    'salary/employment_type/location_type from its description text. ' +
    'Example json shape: {"job_title": "Software Engineer", "employer": ' +
    '"Acme Ltd", "salary_min": 45000, "salary_max": 55000, ' +
    '"salary_currency": "GBP", "salary_type": "annual", "employment_type": ' +
    '"full_time", "location_type": "hybrid", "location": "London", ' +
    '"description": "..."}';

  const userContent = greenhouseEmbedJob
    ? `Structured job data (from Greenhouse's job board API, authoritative):\n${greenhouseEmbedJob}` +
      (jobPostingJsonLd
        ? `\n\nStructured JobPosting data (from the page's own SEO metadata):\n${jobPostingJsonLd}`
        : '')
    : jobPostingJsonLd
      ? `Structured JobPosting data (from the page's own SEO metadata):\n${jobPostingJsonLd}\n\nWebpage text:\n${pageText}`
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
      'https://bedrock-runtime.eu-west-2.amazonaws.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('BEDROCK_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'nvidia.nemotron-super-3-120b',
          max_completion_tokens: 4096,
          // Keep extraction consistent run-to-run rather than creative.
          temperature: 0,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(30000),
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

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(content);
    } catch (err) {
      console.log('[import-job-listing] failed to parse Bedrock JSON:', content);
      return jsonResponse({ error: 'Failed to read that job listing' }, 502);
    }

    const job: Record<string, unknown> = {};
    for (const key of EXTRACTION_KEYS) {
      job[key] = extracted[key] ?? null;
    }

    console.log('[import-job-listing] extracted job:', JSON.stringify(job));

    return jsonResponse({ job }, 200);
  } catch (err) {
    console.log('[import-job-listing] Bedrock call failed:', err);
    return jsonResponse({ error: 'Failed to read that job listing' }, 502);
  }
});
