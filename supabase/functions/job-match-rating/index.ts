// Fires when a database trigger (trg_job_description_changed) detects a
// job's description was set or changed. Scores how well the user's full CV
// component library fits that job, 0-100, and writes it to jobs.match_score.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqual } from 'jsr:@std/crypto/timing-safe-equal';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-webhook-secret',
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

  const providedSecret = req.headers.get('X-Webhook-Secret');
  const expectedSecret = Deno.env.get('JOB_MATCH_WEBHOOK_SECRET');

  // Constant-time comparison — a plain !== leaks a timing signal that
  // could in principle help an attacker recover the secret byte-by-byte.
  const encoder = new TextEncoder();
  const secretIsValid =
    !!expectedSecret &&
    !!providedSecret &&
    providedSecret.length === expectedSecret.length &&
    timingSafeEqual(encoder.encode(providedSecret), encoder.encode(expectedSecret));

  if (!secretIsValid) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let job_id: string | undefined;
  try {
    ({ job_id } = await req.json());
  } catch (err) {
    console.log('[job-match-rating] failed to parse request body:', err);
    return jsonResponse({ error: 'Invalid request' }, 400);
  }

  if (!job_id) {
    return jsonResponse({ error: 'Missing job_id' }, 400);
  }

  // No user JWT in this context — this is a DB-triggered webhook, not a
  // logged-in user action — so every query below uses the service-role
  // client and is scoped manually by the job's own user_id instead of RLS.
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('job_title, employer, description, user_id')
    .eq('id', job_id)
    .single();

  if (jobError || !job) {
    console.log('[job-match-rating] job not found:', job_id, jobError);
    return jsonResponse({ error: 'Job not found' }, 404);
  }

  if (!job.description) {
    // Shouldn't happen — the trigger only fires with a description set —
    // but defensive rather than erroring on a null-description race.
    console.log('[job-match-rating] job has no description, skipping:', job_id);
    return jsonResponse({ skipped: true }, 200);
  }

  const userId = job.user_id;

  // Full CV library, unfiltered — this is scoring overall fit, not
  // assembling a tailored CV, so there's no recent/earlier split or
  // per-section relevance selection the way build-cv does.
  const [
    profileResult,
    skillsResult,
    experienceResult,
    educationResult,
    certificationResult,
    sectionsResult,
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('cv_summary').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('cv_skills').select('id, skill_text').eq('user_id', userId),
    supabaseAdmin
      .from('cv_experience')
      .select('id, job_title, employer')
      .eq('user_id', userId),
    supabaseAdmin
      .from('cv_education')
      .select('id, establishment, level, subject')
      .eq('user_id', userId),
    supabaseAdmin
      .from('cv_certifications')
      .select('id, issuer, title')
      .eq('user_id', userId),
    supabaseAdmin
      .from('cv_custom_sections')
      .select('heading, content')
      .eq('user_id', userId),
  ]);

  if (profileResult.error) {
    console.log('[job-match-rating] profile query failed:', profileResult.error);
    return jsonResponse({ error: profileResult.error.message }, 500);
  }
  if (skillsResult.error) {
    console.log('[job-match-rating] skills query failed:', skillsResult.error);
    return jsonResponse({ error: skillsResult.error.message }, 500);
  }
  if (experienceResult.error) {
    console.log('[job-match-rating] experience query failed:', experienceResult.error);
    return jsonResponse({ error: experienceResult.error.message }, 500);
  }
  if (educationResult.error) {
    console.log('[job-match-rating] education query failed:', educationResult.error);
    return jsonResponse({ error: educationResult.error.message }, 500);
  }
  if (certificationResult.error) {
    console.log('[job-match-rating] certification query failed:', certificationResult.error);
    return jsonResponse({ error: certificationResult.error.message }, 500);
  }
  if (sectionsResult.error) {
    console.log('[job-match-rating] custom sections query failed:', sectionsResult.error);
    return jsonResponse({ error: sectionsResult.error.message }, 500);
  }

  const profile = profileResult.data;
  const skills = skillsResult.data ?? [];
  const experience = experienceResult.data ?? [];
  const education = educationResult.data ?? [];
  const certifications = certificationResult.data ?? [];
  const customSections = sectionsResult.data ?? [];

  const experienceIds = experience.map((e) => e.id);
  const educationIds = education.map((e) => e.id);
  const certificationIds = certifications.map((c) => c.id);

  const [bulletsResult, itemsResult, certItemsResult] = await Promise.all([
    experienceIds.length > 0
      ? supabaseAdmin
          .from('cv_experience_bullets')
          .select('experience_id, bullet_text')
          .in('experience_id', experienceIds)
      : Promise.resolve({ data: [], error: null }),
    educationIds.length > 0
      ? supabaseAdmin
          .from('cv_education_items')
          .select('education_id, detail_text')
          .in('education_id', educationIds)
      : Promise.resolve({ data: [], error: null }),
    certificationIds.length > 0
      ? supabaseAdmin
          .from('cv_certification_items')
          .select('certification_id, detail_text')
          .in('certification_id', certificationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (bulletsResult.error) {
    console.log('[job-match-rating] experience bullets query failed:', bulletsResult.error);
    return jsonResponse({ error: bulletsResult.error.message }, 500);
  }
  if (itemsResult.error) {
    console.log('[job-match-rating] education items query failed:', itemsResult.error);
    return jsonResponse({ error: itemsResult.error.message }, 500);
  }
  if (certItemsResult.error) {
    console.log('[job-match-rating] certification items query failed:', certItemsResult.error);
    return jsonResponse({ error: certItemsResult.error.message }, 500);
  }

  const bulletsByExperience = new Map<string, string[]>();
  for (const row of bulletsResult.data ?? []) {
    const list = bulletsByExperience.get(row.experience_id) ?? [];
    list.push(row.bullet_text);
    bulletsByExperience.set(row.experience_id, list);
  }

  const itemsByEducation = new Map<string, string[]>();
  for (const row of itemsResult.data ?? []) {
    const list = itemsByEducation.get(row.education_id) ?? [];
    list.push(row.detail_text);
    itemsByEducation.set(row.education_id, list);
  }

  const itemsByCertification = new Map<string, string[]>();
  for (const row of certItemsResult.data ?? []) {
    const list = itemsByCertification.get(row.certification_id) ?? [];
    list.push(row.detail_text);
    itemsByCertification.set(row.certification_id, list);
  }

  const cvOverview = {
    profile_summary: profile?.cv_summary ?? null,
    skills: skills.map((s) => s.skill_text),
    experience: experience.map((e) => ({
      title: e.job_title,
      employer: e.employer,
      bullets: bulletsByExperience.get(e.id) ?? [],
    })),
    education: education.map((e) => ({
      level: e.level,
      subject: e.subject,
      establishment: e.establishment,
      details: itemsByEducation.get(e.id) ?? [],
    })),
    certifications: certifications.map((c) => ({
      title: c.title,
      issuer: c.issuer,
      details: itemsByCertification.get(c.id) ?? [],
    })),
    custom_sections: customSections.map((s) => ({
      heading: s.heading,
      content: s.content,
    })),
  };

  // Calls Nemotron (NVIDIA) on AWS Bedrock in eu-west-2 (London), via
  // Bedrock's OpenAI-compatible Chat Completions endpoint — same pattern
  // used by every other LLM call in this app. `response_format: json_object`
  // support isn't confirmed for this model on this endpoint, so it's
  // deliberately omitted — the prompt asks for JSON in its own text, and
  // JSON.parse below fails safe if that's ever not honored.
  let matchScore: number | null = null;
  try {
    const bedrockResponse = await fetch(
      'https://bedrock-mantle.eu-west-2.api.aws/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('BEDROCK_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'nvidia.nemotron-super-3-120b',
          max_completion_tokens: 256,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                "Score how well a candidate's CV content fits a job, as a " +
                'single integer from 0 (no meaningful overlap) to 100 ' +
                "(an excellent match). Judge against the job description's " +
                'actual requirements and responsibilities — named skills, ' +
                'tools, experience level, domain — not just surface-level ' +
                'keyword overlap. A candidate missing some requirements but ' +
                "strong on the most important ones should score higher than " +
                'one matching many minor details but missing the core ' +
                'requirement. Respond with ONLY JSON: {"match_score": 0-100}',
            },
            {
              role: 'user',
              content:
                `Job title: ${job.job_title}\nEmployer: ${job.employer}\n\n` +
                `Job description:\n${job.description}\n\n` +
                `Candidate's CV content:\n${JSON.stringify(cvOverview)}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(60000),
      },
    );

    if (!bedrockResponse.ok) {
      const detail = await bedrockResponse.text();
      console.log('[job-match-rating] Bedrock call failed:', detail);
    } else {
      const result = await bedrockResponse.json();
      const content = result.choices?.[0]?.message?.content;
      const parsed = content ? JSON.parse(content) : null;
      const rawScore = Number(parsed?.match_score);
      if (Number.isFinite(rawScore)) {
        matchScore = Math.max(0, Math.min(100, Math.round(rawScore)));
      } else {
        console.log('[job-match-rating] no usable match_score in response:', content);
      }
    }
  } catch (err) {
    console.log('[job-match-rating] Bedrock call failed:', err);
  }

  if (matchScore === null) {
    // Leave match_score as whatever it already was (null on first attempt)
    // rather than writing a bad value.
    return jsonResponse({ error: 'Failed to compute match score' }, 502);
  }

  const { error: updateError } = await supabaseAdmin
    .from('jobs')
    .update({ match_score: matchScore })
    .eq('id', job_id);

  if (updateError) {
    console.log('[job-match-rating] failed to save match_score:', updateError);
    return jsonResponse({ error: updateError.message }, 500);
  }

  return jsonResponse({ match_score: matchScore }, 200);
});
