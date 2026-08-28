import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf';

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

  const { job_id } = await req.json();
  if (!job_id) {
    return jsonResponse({ error: 'Missing job_id' }, 400);
  }

  const { data: job, error: jobError } = await supabaseUser
    .from('jobs')
    .select('description, job_title, employer, cv_document_id')
    .eq('id', job_id)
    .single();

  if (jobError || !job) {
    return jsonResponse({ error: 'Job not found' }, 404);
  }

  if (!job.description) {
    return jsonResponse(
      { error: 'This job has no description to draft a cover letter from.' },
      400,
    );
  }

  if (!job.cv_document_id) {
    return jsonResponse(
      { error: 'Connect a CV to this job before generating a cover letter.' },
      400,
    );
  }

  const { data: cvDoc, error: cvError } = await supabaseUser
    .from('documents')
    .select('file_name, storage_path')
    .eq('id', job.cv_document_id)
    .single();

  if (cvError || !cvDoc) {
    return jsonResponse({ error: 'Connected CV document not found' }, 404);
  }

  if (!cvDoc.file_name.toLowerCase().endsWith('.pdf')) {
    return jsonResponse(
      { error: 'Cover letter generation currently requires a PDF CV.' },
      400,
    );
  }

  console.log('[generate-cover-letter] downloading CV:', cvDoc.storage_path);

  const { data: cvBlob, error: downloadError } = await supabaseUser.storage
    .from('documents')
    .download(cvDoc.storage_path);

  if (downloadError || !cvBlob) {
    console.log('[generate-cover-letter] CV download failed:', downloadError);
    return jsonResponse({ error: 'Failed to read the connected CV' }, 502);
  }

  console.log('[generate-cover-letter] CV downloaded, bytes:', cvBlob.size);

  // DeepSeek only accepts plain text, unlike Claude's native PDF input, so
  // the CV has to be extracted to text server-side before it can be sent.
  let cvText: string;
  try {
    console.log('[generate-cover-letter] starting PDF text extraction');
    const pdf = await getDocumentProxy(
      new Uint8Array(await cvBlob.arrayBuffer()),
    );
    console.log('[generate-cover-letter] got document proxy, pages:', pdf.numPages);
    const { text } = await extractText(pdf, { mergePages: true });
    cvText = Array.isArray(text) ? text.join('\n') : text;
    console.log('[generate-cover-letter] extracted text length:', cvText.length);
  } catch (err) {
    console.log('[generate-cover-letter] PDF text extraction failed:', err);
    return jsonResponse({ error: 'Failed to read the connected CV' }, 502);
  }

  const systemPrompt =
    "You write cover letters for job applications. Given the applicant's " +
    'CV and a job description, write a tailored, professional cover ' +
    "letter in the applicant's voice. Output only the letter body as " +
    'plain text — no markdown, no subject line, no placeholder brackets ' +
    "left unfilled. If something essential isn't in the CV, write around " +
    "it rather than inventing details.";

  const userPrompt =
    `Job title: ${job.job_title}\n` +
    `Employer: ${job.employer}\n\n` +
    `Job description:\n${job.description}\n\n` +
    `Applicant's CV:\n${cvText}`;

  try {
    console.log('[generate-cover-letter] calling DeepSeek');
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
          // deepseek-v4-pro reasons by default, spending tokens on a hidden
          // pass before the real answer — not needed for a cover letter, so
          // turn it off rather than just budgeting around it.
          thinking: { type: 'disabled' },
          max_tokens: 2048,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    console.log('[generate-cover-letter] DeepSeek responded:', deepseekResponse.status);

    if (!deepseekResponse.ok) {
      const detail = await deepseekResponse.text();
      console.log('[generate-cover-letter] DeepSeek call failed:', detail);
      return jsonResponse({ error: 'Failed to generate cover letter' }, 502);
    }

    const result = await deepseekResponse.json();
    const draft = result.choices?.[0]?.message?.content;

    if (!draft) {
      console.log('[generate-cover-letter] no draft in DeepSeek response:', JSON.stringify(result));
      return jsonResponse({ error: 'Failed to generate cover letter' }, 502);
    }

    return jsonResponse({ draft }, 200);
  } catch (err) {
    console.log('[generate-cover-letter] DeepSeek call failed:', err);
    return jsonResponse({ error: 'Failed to generate cover letter' }, 502);
  }
});
