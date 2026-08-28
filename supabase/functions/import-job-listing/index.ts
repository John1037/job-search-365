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
  try {
    console.log('[import-job-listing] fetching listing:', url);
    pageText = await fetchListingTextWithRetry(url);
    console.log('[import-job-listing] extracted page text length:', pageText.length);
  } catch (err) {
    console.log('[import-job-listing] listing fetch failed:', err);
    return jsonResponse({ error: 'Failed to fetch that job listing' }, 502);
  }

  if (pageText.length < MIN_USABLE_PAGE_TEXT_LENGTH) {
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
    "anything not clearly stated in the page — don't invent details. " +
    'Example json shape: {"job_title": "Software Engineer", "employer": ' +
    '"Acme Ltd", "salary_min": 45000, "salary_max": 55000, ' +
    '"salary_currency": "GBP", "salary_type": "annual", "employment_type": ' +
    '"full_time", "location_type": "hybrid", "location": "London", ' +
    '"description": "..."}';

  try {
    console.log('[import-job-listing] calling DeepSeek');
    const deepseekResponse = await fetch(
      'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-v4-pro',
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          max_tokens: 4096,
          // Keep extraction consistent run-to-run rather than creative.
          temperature: 0,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Webpage text:\n${pageText}` },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    console.log('[import-job-listing] DeepSeek responded:', deepseekResponse.status);

    if (!deepseekResponse.ok) {
      const detail = await deepseekResponse.text();
      console.log('[import-job-listing] DeepSeek call failed:', detail);
      return jsonResponse({ error: 'Failed to read that job listing' }, 502);
    }

    const result = await deepseekResponse.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      console.log('[import-job-listing] no content in DeepSeek response:', JSON.stringify(result));
      return jsonResponse({ error: 'Failed to read that job listing' }, 502);
    }

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(content);
    } catch (err) {
      console.log('[import-job-listing] failed to parse DeepSeek JSON:', content);
      return jsonResponse({ error: 'Failed to read that job listing' }, 502);
    }

    const job: Record<string, unknown> = {};
    for (const key of EXTRACTION_KEYS) {
      job[key] = extracted[key] ?? null;
    }

    console.log('[import-job-listing] extracted job:', JSON.stringify(job));

    return jsonResponse({ job }, 200);
  } catch (err) {
    console.log('[import-job-listing] DeepSeek call failed:', err);
    return jsonResponse({ error: 'Failed to read that job listing' }, 502);
  }
});
