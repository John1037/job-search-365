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

// Must exactly match the fixed event vocabulary in src/jobFormat.js —
// duplicated here since Edge Functions (Deno) can't import frontend src/.
// 'Other' is deliberately excluded: it's a free-text catch-all, not
// something worth guessing at automatically. 'Applied' is also excluded
// from what the classifier may suggest — the user already knows when they
// applied, so it's never a useful inbox suggestion.
const SUGGESTABLE_EVENT_NAMES = [
  'Application acknowledged',
  'Interview scheduled',
  'Interview cancelled',
  'Interview completed',
  'Offer received',
  'Offer accepted',
  'Unsuccessful',
];

const INTERVIEW_EVENT_NAMES = ['Interview scheduled', 'Interview completed'];

const SEARCH_KEYWORDS =
  '(interview OR application OR applying OR position OR offer OR candidacy OR recruiting OR regret OR "not moving forward" OR "thank you for applying")';
const DEFAULT_LOOKBACK_DAYS = 90;
const MAX_RESULTS = 50;
const MAX_BODY_CHARS = 1500;

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Gmail's `snippet` field is only the first ~200 characters of a message —
// often just a generic opening line ("Thank you for your interest...")
// that reads the same whether the email is an acknowledgement, a
// rejection, or an interview invite. The real outcome is usually further
// into the body, so the classifier needs the actual message text, not
// just the snippet. This walks the MIME part tree generically (works for
// any provider's structure) rather than assuming a specific shape.
function findPart(payload: any, mimeType: string): any | null {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body?.data) return payload;
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const found = findPart(part, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function extractEmailText(payload: any): string {
  const plainPart = findPart(payload, 'text/plain');
  if (plainPart) return decodeBase64Url(plainPart.body.data);

  const htmlPart = findPart(payload, 'text/html');
  if (htmlPart) return stripHtml(decodeBase64Url(htmlPart.body.data));

  return '';
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.log('[scan-gmail-inbox] token refresh failed:', detail);
    return null;
  }

  return response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  // Client scoped to the caller's own token — RLS means every query below
  // only ever sees this user's own rows, so no manual ownership checks.
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

  const { data: connection, error: connectionError } = await supabaseUser
    .from('email_connections')
    .select('*')
    .eq('provider', 'gmail')
    .maybeSingle();

  if (connectionError) {
    return jsonResponse({ error: connectionError.message }, 500);
  }
  if (!connection) {
    return jsonResponse({ error: 'Gmail is not connected.' }, 400);
  }

  let accessToken = connection.access_token;
  const expiresAt = connection.access_token_expires_at
    ? new Date(connection.access_token_expires_at).getTime()
    : 0;

  if (!accessToken || expiresAt < Date.now() + 60_000) {
    const refreshed = await refreshAccessToken(connection.refresh_token);

    if (!refreshed) {
      return jsonResponse(
        { error: 'Your Gmail connection has expired. Please reconnect Gmail.' },
        401,
      );
    }

    accessToken = refreshed.access_token;
    const newExpiresAt = new Date(
      Date.now() + refreshed.expires_in * 1000,
    ).toISOString();

    await supabaseUser
      .from('email_connections')
      .update({ access_token: accessToken, access_token_expires_at: newExpiresAt })
      .eq('id', connection.id);
  }

  const { data: openJobs, error: jobsError } = await supabaseUser
    .from('jobs')
    .select('id, job_title, employer, status')
    .eq('is_closed', false);

  if (jobsError) {
    return jsonResponse({ error: jobsError.message }, 500);
  }

  if (!openJobs || openJobs.length === 0) {
    return jsonResponse(
      { matches_found: 0, message: 'No open jobs to match against.' },
      200,
    );
  }

  const jobsById = new Map(openJobs.map((j) => [j.id, j]));

  // Needed to enforce: don't suggest "Application acknowledged" for a job
  // that's already had an interview scheduled/completed — a generic-sounding
  // acknowledgement email arriving after that point is ambiguous, not a
  // real "acknowledged" event, so it should be left undetermined instead.
  const { data: interviewEvents } = await supabaseUser
    .from('events')
    .select('job_id')
    .in(
      'job_id',
      openJobs.map((j) => j.id),
    )
    .in('event_name', INTERVIEW_EVENT_NAMES);

  const jobsWithInterviewHistory = new Set(
    (interviewEvents ?? []).map((e) => e.job_id),
  );

  const lookbackDate = connection.last_synced_at
    ? new Date(connection.last_synced_at)
    : new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const afterEpochSeconds = Math.floor(lookbackDate.getTime() / 1000);

  const searchQuery = `${SEARCH_KEYWORDS} -category:promotions -category:social after:${afterEpochSeconds}`;

  const listUrl = new URL(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages',
  );
  listUrl.searchParams.set('q', searchQuery);
  listUrl.searchParams.set('maxResults', String(MAX_RESULTS));

  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listResponse.ok) {
    const detail = await listResponse.text();
    console.log('[scan-gmail-inbox] message list failed:', detail);
    return jsonResponse({ error: 'Failed to search Gmail' }, 502);
  }

  const listResult = await listResponse.json();
  const messageRefs: { id: string }[] = listResult.messages ?? [];

  const markSynced = () =>
    supabaseUser
      .from('email_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection.id);

  if (messageRefs.length === 0) {
    await markSynced();
    return jsonResponse({ matches_found: 0 }, 200);
  }

  const { data: alreadySeen } = await supabaseUser
    .from('email_matches')
    .select('provider_message_id')
    .eq('provider', 'gmail')
    .in(
      'provider_message_id',
      messageRefs.map((m) => m.id),
    );

  const seenIds = new Set(
    (alreadySeen ?? []).map((row) => row.provider_message_id),
  );
  const newRefs = messageRefs.filter((m) => !seenIds.has(m.id));

  const candidateEmails: {
    message_id: string;
    from: string | null;
    subject: string | null;
    date: string | null;
    snippet: string;
    body: string;
  }[] = [];

  for (const ref of newRefs) {
    const detailUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}`,
    );
    detailUrl.searchParams.set('format', 'full');

    const detailResponse = await fetch(detailUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!detailResponse.ok) continue;

    const detail = await detailResponse.json();
    const headers: { name: string; value: string }[] =
      detail.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name === name)?.value ?? null;

    const bodyText = extractEmailText(detail.payload).slice(0, MAX_BODY_CHARS);

    candidateEmails.push({
      message_id: ref.id,
      from: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: detail.snippet ?? '',
      body: bodyText || (detail.snippet ?? ''),
    });
  }

  if (candidateEmails.length === 0) {
    await markSynced();
    return jsonResponse({ matches_found: 0 }, 200);
  }

  const jobsForPrompt = openJobs.map((j) => ({
    id: j.id,
    job_title: j.job_title,
    employer: j.employer,
    current_status: j.status,
  }));

  const emailsForPrompt = candidateEmails.map((e) => ({
    message_id: e.message_id,
    from: e.from,
    subject: e.subject,
    date: e.date,
    body: e.body,
  }));

  const systemPrompt =
    'You match emails to job applications and identify what update they ' +
    'represent, for a review queue a human will check before anything is ' +
    'changed. Given a list of open job applications (id, title, employer, ' +
    "current_status) and a list of candidate emails (message_id, subject, " +
    'sender, date, body text), decide for each email:\n' +
    '- job_id: which job it is about, if any confident match exists — ' +
    'otherwise null. Only use a job_id that appears in the given job ' +
    'list, never invent one.\n' +
    '- confident: true only if you can clearly and unambiguously tell ' +
    "what update this email represents by actually reading its content — " +
    'not just its tone or opening line. Read past a generic-sounding ' +
    'opening ("thank you for applying...", "we appreciate your interest...") ' +
    'to find the actual outcome stated later in the email — a politely or ' +
    "softly worded email can still be a rejection, and a message that " +
    "only confirms receipt with no further outcome is just an " +
    'acknowledgement. If genuinely unclear, set confident to false rather ' +
    'than guessing.\n' +
    `- event_name: required when confident is true, one of exactly ${JSON.stringify(SUGGESTABLE_EVENT_NAMES)}. ` +
    'Never suggest a status the job is already at (check current_status). ' +
    'Set to null when confident is false.\n' +
    '- event_date (YYYY-MM-DD) and event_time (HH:MM, 24-hour): only if a ' +
    'specific date/time for the event is explicitly stated in the email ' +
    'text — otherwise null. Never infer or guess a date.\n' +
    'Ignore newsletters, job alerts/recommendations for new roles, ' +
    'marketing, and unrelated personal mail (return job_id null for these).\n' +
    'Respond with JSON: {"results": [{"message_id": "...", "job_id": ' +
    '"..." | null, "confident": true | false, "event_name": "..." | null, ' +
    '"event_date": "..." | null, "event_time": "..." | null}]}';

  const userPrompt = `Open jobs:\n${JSON.stringify(jobsForPrompt)}\n\nCandidate emails:\n${JSON.stringify(emailsForPrompt)}`;

  let classifications: {
    message_id?: string;
    job_id?: string | null;
    confident?: boolean;
    event_name?: string | null;
    event_date?: string | null;
    event_time?: string | null;
  }[] = [];

  try {
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
          temperature: 0,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(60000),
      },
    );

    if (!deepseekResponse.ok) {
      const detail = await deepseekResponse.text();
      console.log('[scan-gmail-inbox] DeepSeek call failed:', detail);
      return jsonResponse({ error: 'Failed to classify emails' }, 502);
    }

    const result = await deepseekResponse.json();
    const content = result.choices?.[0]?.message?.content;
    const parsed = content ? JSON.parse(content) : null;
    classifications = Array.isArray(parsed?.results) ? parsed.results : [];
  } catch (err) {
    console.log('[scan-gmail-inbox] DeepSeek call failed:', err);
    return jsonResponse({ error: 'Failed to classify emails' }, 502);
  }

  const emailsByMessageId = new Map(
    candidateEmails.map((e) => [e.message_id, e]),
  );

  const rowsToInsert = [];

  for (const classification of classifications) {
    const email = classification.message_id
      ? emailsByMessageId.get(classification.message_id)
      : null;
    if (!email) continue;

    const job = classification.job_id
      ? jobsById.get(classification.job_id)
      : null;
    if (!job) continue;

    let determined = false;
    let eventName: string | null = null;

    if (
      classification.confident === true &&
      classification.event_name &&
      SUGGESTABLE_EVENT_NAMES.includes(classification.event_name)
    ) {
      if (classification.event_name === job.status) {
        // The job is already at this status — nothing to review.
        continue;
      }

      if (
        classification.event_name === 'Application acknowledged' &&
        jobsWithInterviewHistory.has(job.id)
      ) {
        // An "acknowledged"-sounding email after an interview has already
        // happened doesn't fit the normal timeline — treat as undetermined
        // rather than trusting the label.
        determined = false;
      } else {
        determined = true;
        eventName = classification.event_name;
      }
    }

    rowsToInsert.push({
      user_id: user.id,
      job_id: job.id,
      provider: 'gmail',
      provider_message_id: email.message_id,
      email_from: email.from,
      email_subject: email.subject,
      email_received_at: email.date ? new Date(email.date).toISOString() : null,
      email_snippet: email.snippet,
      suggested_event_name: eventName,
      suggested_event_date: determined && isValidDate(classification.event_date)
        ? classification.event_date
        : null,
      suggested_event_time: determined && isValidTime(classification.event_time)
        ? classification.event_time
        : null,
    });
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabaseUser
      .from('email_matches')
      .insert(rowsToInsert);

    if (insertError) {
      console.log('[scan-gmail-inbox] insert matches failed:', insertError);
      return jsonResponse({ error: insertError.message }, 500);
    }
  }

  await markSynced();

  return jsonResponse({ matches_found: rowsToInsert.length }, 200);
});
