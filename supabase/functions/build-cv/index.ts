import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parsePhoneNumberFromString } from 'https://esm.sh/libphonenumber-js@1.11.1';

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

const DEFAULT_RECENT_ROLES = 3;

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface DateRange {
  start_year: number;
  start_month: number | null;
  end_year: number | null;
  end_month: number | null;
  is_current: boolean;
}

function formatDateRange(entry: DateRange): string {
  const start = entry.start_month
    ? `${MONTH_ABBR[entry.start_month - 1]} ${entry.start_year}`
    : `${entry.start_year}`;

  if (entry.is_current) return `${start} - Present`;

  const end = entry.end_month
    ? `${MONTH_ABBR[entry.end_month - 1]} ${entry.end_year}`
    : entry.end_year
      ? `${entry.end_year}`
      : 'Present';

  return `${start} - ${end}`;
}

// International E.164 format ("+447123456789") instead of "GB 07123456789"
// — no spaces, ready to use directly as a tel: link. Delegates to
// libphonenumber-js rather than a hand-rolled "strip the leading 0" regex:
// whether the national trunk prefix gets dropped is NOT a universal rule
// (most countries drop it, but e.g. Italian landline numbers keep their
// leading 0 even in +39 international format) — this is exactly the kind
// of per-country exception a real phone-number library knows and a regex
// can't. It also handles stripping hyphens/spaces/parens itself.
function formatInternationalPhone(
  phoneCountry: string | null,
  phoneNumber: string | null,
): string | null {
  const trimmed = phoneNumber?.trim();
  if (!trimmed) return null;

  try {
    const parsed = phoneCountry
      ? parsePhoneNumberFromString(trimmed, phoneCountry as never)
      : parsePhoneNumberFromString(trimmed);
    if (parsed?.number) return parsed.number;
  } catch (err) {
    console.log('[build-cv] phone parsing failed:', err);
  }

  // Couldn't confidently parse it (unrecognized country, garbled input,
  // etc.) — fall back to the digits as typed rather than dropping a phone
  // number the user did provide.
  const digits = trimmed.replace(/\D/g, '');
  return digits || null;
}

function dateSortKey(entry: DateRange): number {
  if (entry.is_current) return Infinity;
  if (entry.end_year) return entry.end_year * 12 + (entry.end_month || 12);
  return entry.start_year * 12 + (entry.start_month || 1);
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

  // Admin client using the service role key, used only for the activity
  // log entry at the end — never for anything that should go through RLS.
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let job_id: string | undefined;
  let recent_mode: string | undefined;
  let recent_count: number | undefined;
  let reword_for_match: boolean | undefined;

  try {
    ({ job_id, recent_mode, recent_count, reword_for_match } = await req.json());
  } catch (err) {
    console.log('[build-cv] failed to parse request body:', err);
    return jsonResponse({ error: 'Invalid request' }, 400);
  }

  if (!job_id) {
    return jsonResponse({ error: 'Missing job_id' }, 400);
  }

  const recentMode = recent_mode === 'years' ? 'years' : 'roles';
  const recentCount =
    Number.isFinite(recent_count) && recent_count >= 0
      ? recent_count
      : DEFAULT_RECENT_ROLES;
  // Opt-in and off by default — when on, allows the profile paragraph and
  // experience/earlier-career wording to be lightly reworded toward the job
  // description's own terms. Every prompt this touches carries an explicit
  // "same facts, different words only" constraint; when this is false, none
  // of that instruction text is added at all, so default behavior (already
  // reviewed and trusted) is byte-for-byte unchanged.
  const rewordForMatch = reword_for_match === true;

  const { data: job, error: jobError } = await supabaseUser
    .from('jobs')
    .select('job_title, employer, description')
    .eq('id', job_id)
    .single();

  if (jobError || !job) {
    return jsonResponse({ error: 'Job not found' }, 404);
  }

  if (!job.description) {
    return jsonResponse(
      { error: 'This job has no description to build a CV from.' },
      400,
    );
  }

  const [
    profileResult,
    skillsResult,
    experienceResult,
    educationResult,
    certificationResult,
    sectionsResult,
  ] = await Promise.all([
    supabaseUser
      .from('profiles')
      .select(
        'cv_summary, full_name, phone_country, phone_number, location, linkedin_url, github_url, portfolio_url, website_url, avatar_url, application_email',
      )
      .eq('id', user.id)
      .maybeSingle(),
    supabaseUser.from('cv_skills').select('id, skill_text'),
    supabaseUser
      .from('cv_experience')
      .select(
        'id, job_title, employer, location, start_year, start_month, end_year, end_month, is_current',
      ),
    supabaseUser
      .from('cv_education')
      .select('id, establishment, level, subject, grade, qualification_year'),
    supabaseUser
      .from('cv_certifications')
      .select(
        'id, issuer, title, location, start_year, start_month, end_year, end_month, is_current',
      ),
    supabaseUser
      .from('cv_custom_sections')
      .select('id, heading, content, format, intro_text')
      .order('sort_order', { ascending: true }),
  ]);

  if (profileResult.error) {
    console.log('[build-cv] profile query failed:', profileResult.error);
    return jsonResponse({ error: profileResult.error.message }, 500);
  }
  if (skillsResult.error) {
    console.log('[build-cv] skills query failed:', skillsResult.error);
    return jsonResponse({ error: skillsResult.error.message }, 500);
  }
  if (experienceResult.error) {
    console.log('[build-cv] experience query failed:', experienceResult.error);
    return jsonResponse({ error: experienceResult.error.message }, 500);
  }
  if (educationResult.error) {
    console.log('[build-cv] education query failed:', educationResult.error);
    return jsonResponse({ error: educationResult.error.message }, 500);
  }
  if (certificationResult.error) {
    console.log('[build-cv] certification query failed:', certificationResult.error);
    return jsonResponse({ error: certificationResult.error.message }, 500);
  }
  if (sectionsResult.error) {
    console.log('[build-cv] custom sections query failed:', sectionsResult.error);
    return jsonResponse({ error: sectionsResult.error.message }, 500);
  }

  const profile = profileResult.data;
  const skills = skillsResult.data ?? [];
  const experience = [...(experienceResult.data ?? [])].sort(
    (a, b) => dateSortKey(b) - dateSortKey(a),
  );
  const education = [...(educationResult.data ?? [])].sort(
    (a, b) => (b.qualification_year ?? 0) - (a.qualification_year ?? 0),
  );
  const certifications = [...(certificationResult.data ?? [])].sort(
    (a, b) => dateSortKey(b) - dateSortKey(a),
  );
  const customSections = sectionsResult.data ?? [];

  if (
    skills.length === 0 &&
    experience.length === 0 &&
    education.length === 0 &&
    certifications.length === 0 &&
    customSections.length === 0
  ) {
    return jsonResponse(
      {
        error:
          'Add some skills or experience in Manage CV components first.',
      },
      400,
    );
  }

  // "roles" mode keeps a fixed count of the most recent entries; "years"
  // mode keeps whichever entries are still within the window, however
  // many that is — experience is already sorted most-recent-first, so
  // filtering preserves that order in both the recent and earlier sets.
  let recentExperience: typeof experience;
  let earlierExperience: typeof experience;

  if (recentMode === 'years') {
    const now = new Date();
    const cutoffMonthIndex = (now.getFullYear() - recentCount) * 12 + (now.getMonth() + 1);
    recentExperience = experience.filter((e) => dateSortKey(e) >= cutoffMonthIndex);
    earlierExperience = experience.filter((e) => dateSortKey(e) < cutoffMonthIndex);
  } else {
    recentExperience = experience.slice(0, recentCount);
    earlierExperience = experience.slice(recentCount);
  }

  const experienceIds = recentExperience.map((e) => e.id);
  const educationIds = education.map((e) => e.id);
  const certificationIds = certifications.map((c) => c.id);
  const earlierExperienceIds = earlierExperience.map((e) => e.id);

  const [bulletsResult, itemsResult, certItemsResult, earlierBulletsResult] = await Promise.all([
    experienceIds.length > 0
      ? supabaseUser
          .from('cv_experience_bullets')
          .select('id, experience_id, bullet_text')
          .in('experience_id', experienceIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    educationIds.length > 0
      ? supabaseUser
          .from('cv_education_items')
          .select('id, education_id, detail_text')
          .in('education_id', educationIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    certificationIds.length > 0
      ? supabaseUser
          .from('cv_certification_items')
          .select('id, certification_id, detail_text')
          .in('certification_id', certificationIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    earlierExperienceIds.length > 0
      ? supabaseUser
          .from('cv_experience_bullets')
          .select('experience_id, bullet_text')
          .in('experience_id', earlierExperienceIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (bulletsResult.error) {
    console.log('[build-cv] experience bullets query failed:', bulletsResult.error);
    return jsonResponse({ error: bulletsResult.error.message }, 500);
  }
  if (itemsResult.error) {
    console.log('[build-cv] education items query failed:', itemsResult.error);
    return jsonResponse({ error: itemsResult.error.message }, 500);
  }
  if (certItemsResult.error) {
    console.log('[build-cv] certification items query failed:', certItemsResult.error);
    return jsonResponse({ error: certItemsResult.error.message }, 500);
  }
  if (earlierBulletsResult.error) {
    console.log('[build-cv] earlier bullets query failed:', earlierBulletsResult.error);
    return jsonResponse({ error: earlierBulletsResult.error.message }, 500);
  }

  const bulletsByExperience = new Map<string, { id: string; bullet_text: string }[]>();
  for (const row of bulletsResult.data ?? []) {
    const list = bulletsByExperience.get(row.experience_id) ?? [];
    list.push({ id: row.id, bullet_text: row.bullet_text });
    bulletsByExperience.set(row.experience_id, list);
  }

  const itemsByEducation = new Map<string, { id: string; detail_text: string }[]>();
  for (const row of itemsResult.data ?? []) {
    const list = itemsByEducation.get(row.education_id) ?? [];
    list.push({ id: row.id, detail_text: row.detail_text });
    itemsByEducation.set(row.education_id, list);
  }

  const itemsByCertification = new Map<string, { id: string; detail_text: string }[]>();
  for (const row of certItemsResult.data ?? []) {
    const list = itemsByCertification.get(row.certification_id) ?? [];
    list.push({ id: row.id, detail_text: row.detail_text });
    itemsByCertification.set(row.certification_id, list);
  }

  const earlierBulletsByExperience = new Map<string, string[]>();
  for (const row of earlierBulletsResult.data ?? []) {
    const list = earlierBulletsByExperience.get(row.experience_id) ?? [];
    list.push(row.bullet_text);
    earlierBulletsByExperience.set(row.experience_id, list);
  }

  // A single call covering the whole library (skills + every role's
  // bullets + education + custom sections + two prose fields) proved slow
  // enough to time out — the same lesson learned building the old
  // CV-optimization feature: keep each Bedrock call small and scoped to
  // one decision, and run them in parallel under a concurrency limit
  // rather than queuing them one at a time (a flat unlimited Promise.all
  // risks tripping a soft per-key concurrency ceiling on the API).
  function createSemaphore(limit: number) {
    let active = 0;
    const waiting: (() => void)[] = [];
    async function acquire() {
      if (active < limit) {
        active++;
        return;
      }
      await new Promise<void>((resolve) => waiting.push(resolve));
      active++;
    }
    function release() {
      active--;
      waiting.shift()?.();
    }
    return { acquire, release };
  }
  const bedrockSemaphore = createSemaphore(4);

  // Calls Nemotron (NVIDIA) on AWS Bedrock in eu-west-2 (London), via
  // Bedrock's OpenAI-compatible Chat Completions endpoint — same
  // messages-in/choices-out shape as the DeepSeek call this replaced, just
  // a different host and a long-term Bedrock API key as a bearer token
  // (no AWS request signing needed). `response_format: json_object`
  // support isn't confirmed for this model on this endpoint, so it's
  // deliberately omitted rather than risking a hard error on every call —
  // every prompt already explicitly asks for JSON in its own text, and the
  // JSON.parse below already fails safe (returns null) if that's ever not
  // honored, same as it always has.
  async function callBedrock(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<any> {
    await bedrockSemaphore.acquire();
    try {
      const response = await fetch(
        'https://bedrock-mantle.eu-west-2.api.aws/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('BEDROCK_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'nvidia.nemotron-super-3-120b',
            max_completion_tokens: 2048,
            temperature: 0,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
          // 45s wasn't enough under real concurrent load (4 calls at a
          // time via the semaphore below) — raised to match the 60s
          // already used by import-cv/scan-gmail-inbox/import-job-listing.
          signal: AbortSignal.timeout(60000),
        },
      );

      if (!response.ok) {
        const detail = await response.text();
        console.log('[build-cv] Bedrock call failed:', detail);
        return null;
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      return content ? JSON.parse(content) : null;
    } catch (err) {
      console.log('[build-cv] Bedrock call failed:', err);
      return null;
    } finally {
      bedrockSemaphore.release();
    }
  }

  const jobContext =
    `Job title: ${job.job_title}\nEmployer: ${job.employer}\n\n` +
    `Job description:\n${job.description}`;

  // Appended to a prompt only when rewordForMatch is on — kept as one
  // shared string so every task that offers rewording states the same
  // constraint the same way, rather than each drifting slightly.
  const rewordInstruction =
    ' You may lightly reword for alignment with the job description\'s own ' +
    'terminology and phrasing, but ONLY the wording — never add, remove, ' +
    'exaggerate, or change a single fact, claim, tool, responsibility, ' +
    'metric, or outcome. The reworded text must describe exactly the same ' +
    'reality as the original, in different words, not a better-sounding or ' +
    'more-impressive version of it. If a genuinely honest wording match ' +
    "isn't there, leave the original wording as-is rather than forcing one.";

  // Defensive fallbacks (include-everything) if a given call fails or
  // returns nothing usable — a build should still produce something
  // sensible rather than silently dropping a whole section.
  let selectedSkillIds = skills.map((s) => s.id);
  let suggestedNewSkills: string[] = [];
  let profileSummary = (profile?.cv_summary ?? '').trim();
  let selectedCustomSectionIds = customSections.map((s) => s.id);
  const bulletSelectionByExperience = new Map<string, string[]>();
  // Only populated when rewordForMatch is on — a selected bullet with no
  // entry here (rewording skipped, failed to parse, or not offered one)
  // simply falls back to its original stored text, same as always.
  const bulletRewordByExperience = new Map<string, Map<string, string>>();
  const summaryByExperience = new Map<string, string>();
  const itemSelectionByEducation = new Map<string, string[]>();
  const itemSelectionByCertification = new Map<string, string[]>();
  // User-facing counterpart to the console.log calls below — short,
  // plain-language notices surfaced in the response so the review step can
  // flag "this part may need a manual check or a retry" rather than the
  // fallback happening invisibly.
  const fallbackWarnings: string[] = [];

  const tasks: Promise<void>[] = [];

  if (skills.length > 0) {
    tasks.push(
      (async () => {
        const res = await callBedrock(
          'Given a job and a candidate\'s list of skills (id, text), decide ' +
            'which to include on a tailored CV for this job and in what order. ' +
            'Include a skill only if it has a genuine, meaningful connection ' +
            'to something the job DESCRIPTION actually says: a named ' +
            'responsibility, requirement, tool, technology, or a theme the ' +
            'description specifically emphasizes. A connection that could ' +
            'merely be argued for is not enough — ask whether someone reading ' +
            'this specific job description would recognize the skill as ' +
            'actually relevant to what the role needs, not just loosely ' +
            'compatible with it. Be especially skeptical of skills worded ' +
            'broadly enough that they would pass that test for almost any ' +
            'job (e.g. generic phrases like "teamwork", "communication", or ' +
            '"problem-solving" with no specific context) — include one of ' +
            'those only if the description itself specifically calls out ' +
            'that kind of ability, not by default just because it could ' +
            'apply. Being in the same general field or profession as the job ' +
            "is NOT by itself enough to include a skill that doesn't connect " +
            "to anything the description specifically says; conversely, " +
            "don't reason from the job title/field in the abstract — judge " +
            "every skill against the description's actual content. " +
            'Separately, order by relevance — put first whichever skills most ' +
            'directly match something the job title or description ' +
            'specifically calls out (a named tool, technology, domain, or ' +
            'capability — e.g. "automation" or "AI" when the role is ' +
            'explicitly about automation/AI), with more loosely-connected ' +
            '(but still genuinely relevant) skills following after. Never ' +
            'invent an id. Respond with JSON: {"skill_ids": ["..."]}',
          `${jobContext}\n\nSkills:\n${JSON.stringify(
            skills.map((s) => ({ id: s.id, text: s.skill_text })),
          )}`,
        );
        const ids = Array.isArray(res?.skill_ids) ? res.skill_ids : null;
        if (ids) {
          const validIds = new Set(skills.map((s) => s.id));
          const filtered = ids.filter((id: string) => validIds.has(id));
          if (filtered.length > 0) {
            selectedSkillIds = filtered;
          } else {
            console.log(
              '[build-cv] skill selection fell back to all skills: ' +
                'no returned id matched the library. Raw response:',
              JSON.stringify(res),
            );
            fallbackWarnings.push(
              "Skill selection didn't come through — all skills were " +
                'included instead of a tailored subset.',
            );
          }
        } else {
          console.log(
            '[build-cv] skill selection fell back to all skills: ' +
              'no usable skill_ids array in response. Raw response:',
            JSON.stringify(res),
          );
          fallbackWarnings.push(
            "Skill selection didn't come through — all skills were " +
              'included instead of a tailored subset.',
          );
        }
      })(),
    );
  }

  // Separate from skill selection above (that prompt stays untouched) —
  // this one looks the other direction: specific skills the job description
  // names or clearly requires that the candidate's library doesn't already
  // cover, even loosely, so the review step can offer to add them rather
  // than silently building a CV that under-represents a real match.
  tasks.push(
    (async () => {
      const res = await callBedrock(
        'Given a job description and a candidate\'s existing list of ' +
          'skills, identify specific, concrete skills the job description ' +
          'explicitly names or clearly requires (named tools, technologies, ' +
          'methodologies, certifications, or capabilities) that are NOT ' +
          'already covered by an existing skill — not even loosely or under ' +
          'a different name/phrasing (e.g. skip "JavaScript" if "JS" is ' +
          'already listed, skip "project management" if "managing projects" ' +
          'is already listed). Do not suggest vague soft skills (e.g. ' +
          '"communication", "teamwork") unless the description names them ' +
          'as a specific, distinct requirement. Only suggest something a ' +
          'candidate applying to this kind of role could plausibly already ' +
          'have — this is a shortlist for the candidate to confirm they ' +
          'genuinely have, not a wishlist to pad a CV with. Respond with ' +
          'JSON: {"missing_skills": ["..."]} (empty array if none; at most ' +
          '8 entries, ordered by how central each is to the job).',
        `${jobContext}\n\nExisting skills:\n${JSON.stringify(
          skills.map((s) => s.skill_text),
        )}`,
      );
      const missing = Array.isArray(res?.missing_skills) ? res.missing_skills : null;
      if (missing) {
        suggestedNewSkills = missing
          .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s: string) => s.trim())
          .slice(0, 8);
      } else {
        console.log(
          '[build-cv] missing-skills check got no usable missing_skills ' +
            'array, skipping suggestions. Raw response:',
          JSON.stringify(res),
        );
      }
    })(),
  );

  if (customSections.length > 0) {
    tasks.push(
      (async () => {
        const res = await callBedrock(
          'Given a job and a list of CV custom sections (id, heading), ' +
            'choose which are relevant to this job and order them by ' +
            'relevance. Never invent an id. Respond with JSON: ' +
            '{"section_ids": ["..."]}',
          `${jobContext}\n\nCustom sections:\n${JSON.stringify(
            customSections.map((s) => ({ id: s.id, heading: s.heading })),
          )}`,
        );
        const ids = Array.isArray(res?.section_ids) ? res.section_ids : null;
        if (ids) {
          const validIds = new Set(customSections.map((s) => s.id));
          const filtered = ids.filter((id: string) => validIds.has(id));
          if (filtered.length > 0) {
            selectedCustomSectionIds = filtered;
          } else {
            console.log(
              '[build-cv] custom section selection fell back to all ' +
                'sections: no returned id matched. Raw response:',
              JSON.stringify(res),
            );
            fallbackWarnings.push(
              "Custom section selection didn't come through — all " +
                'custom sections were included instead of a tailored subset.',
            );
          }
        } else {
          console.log(
            '[build-cv] custom section selection fell back to all ' +
              'sections: no usable section_ids array in response. Raw response:',
            JSON.stringify(res),
          );
          fallbackWarnings.push(
            "Custom section selection didn't come through — all " +
              'custom sections were included instead of a tailored subset.',
          );
        }
      })(),
    );
  }

  tasks.push(
    (async () => {
      const overview = {
        seed_profile_summary: profile?.cv_summary ?? '',
        skills: skills.map((s) => s.skill_text),
        recent_roles: recentExperience.map((e) => ({
          title: e.job_title,
          employer: e.employer,
        })),
      };
      const res = await callBedrock(
        'Write a tailored CV profile paragraph (2-4 sentences) for this ' +
          "specific job, based on the candidate's seed paragraph and real " +
          'skills/roles given. Do not claim skills or experience not ' +
          'evidenced in what was given. If the seed is empty, write a ' +
          'plain factual paragraph from the skills/roles alone.' +
          (rewordForMatch ? rewordInstruction : '') +
          ' Respond with JSON: {"profile_summary": "..."}',
        `${jobContext}\n\nCandidate overview:\n${JSON.stringify(overview)}`,
      );
      if (typeof res?.profile_summary === 'string' && res.profile_summary.trim()) {
        profileSummary = res.profile_summary.trim();
      } else {
        console.log(
          '[build-cv] profile summary generation fell back to the seed ' +
            'paragraph: no usable profile_summary in response. Raw response:',
          JSON.stringify(res),
        );
        fallbackWarnings.push(
          "Profile paragraph couldn't be tailored for this job — your " +
            'saved summary was used instead, unchanged.',
        );
      }
    })(),
  );

  for (const entry of recentExperience) {
    const bullets = bulletsByExperience.get(entry.id) ?? [];
    if (bullets.length === 0) continue;

    tasks.push(
      (async () => {
        const validIds = new Set(bullets.map((b) => b.id));
        const bulletsPayload = JSON.stringify(
          bullets.map((b) => ({ id: b.id, text: b.bullet_text })),
        );

        if (!rewordForMatch) {
          const res = await callBedrock(
            'Given a job and a list of achievement/responsibility bullets ' +
              '(id, text) for one role on a candidate\'s CV, choose which are ' +
              'relevant to this job and order them by relevance. Keep enough ' +
              "to represent the role well; omit ones that clearly don't fit. " +
              'Never invent an id or bullet text. Respond with JSON: ' +
              '{"bullet_ids": ["..."]}',
            `${jobContext}\n\nRole: ${entry.job_title} at ${entry.employer}\n` +
              `Bullets:\n${bulletsPayload}`,
          );
          const ids = Array.isArray(res?.bullet_ids) ? res.bullet_ids : null;
          const filtered = ids ? ids.filter((id: string) => validIds.has(id)) : [];
          if (filtered.length === 0) {
            console.log(
              `[build-cv] bullet selection for "${entry.job_title}" fell ` +
                'back to all bullets: no usable bullet_ids in response. Raw response:',
              JSON.stringify(res),
            );
            fallbackWarnings.push(
              `Bullet selection for "${entry.job_title}" didn't come ` +
                'through — all bullets for that role were included instead ' +
                'of a tailored subset.',
            );
          }
          bulletSelectionByExperience.set(
            entry.id,
            filtered.length > 0 ? filtered : bullets.map((b) => b.id),
          );
          return;
        }

        // Reword variant: same selection/ordering task, but for each
        // selected bullet also returns its text — copied unchanged unless a
        // light wording tweak genuinely aligns it with the job description.
        const res = await callBedrock(
          'Given a job and a list of achievement/responsibility bullets ' +
            '(id, text) for one role on a candidate\'s CV, choose which are ' +
            'relevant to this job and order them by relevance. Keep enough ' +
            "to represent the role well; omit ones that clearly don't fit. " +
            'For each selected bullet, return its id and its text: copy the ' +
            'text unchanged unless a light wording tweak would align it ' +
            "closer to the job description's own terminology, in which case " +
            'return that reworded version instead.' +
            rewordInstruction +
            ' Never invent an id, and never return a bullet for an id that ' +
            "wasn't given. Respond with JSON: " +
            '{"bullets": [{"id": "...", "text": "..."}]}',
          `${jobContext}\n\nRole: ${entry.job_title} at ${entry.employer}\n` +
            `Bullets:\n${bulletsPayload}`,
        );
        const items = Array.isArray(res?.bullets) ? res.bullets : null;
        const filteredItems = (items ?? []).filter(
          (it: unknown): it is { id: string; text: string } =>
            !!it &&
            typeof (it as { id?: unknown }).id === 'string' &&
            validIds.has((it as { id: string }).id) &&
            typeof (it as { text?: unknown }).text === 'string' &&
            (it as { text: string }).text.trim().length > 0,
        );

        if (filteredItems.length > 0) {
          bulletSelectionByExperience.set(
            entry.id,
            filteredItems.map((it) => it.id),
          );
          bulletRewordByExperience.set(
            entry.id,
            new Map(filteredItems.map((it) => [it.id, it.text.trim()])),
          );
        } else {
          console.log(
            `[build-cv] reworded bullet selection for "${entry.job_title}" ` +
              'fell back to all bullets, unreworded: no usable bullets in ' +
              'response. Raw response:',
            JSON.stringify(res),
          );
          fallbackWarnings.push(
            `Bullet selection/rewording for "${entry.job_title}" didn't ` +
              'come through — all original bullets for that role were ' +
              'included instead.',
          );
          bulletSelectionByExperience.set(entry.id, bullets.map((b) => b.id));
        }
      })(),
    );
  }

  for (const entry of earlierExperience) {
    const bullets = earlierBulletsByExperience.get(entry.id) ?? [];
    if (bullets.length === 0) continue;

    tasks.push(
      (async () => {
        const res = await callBedrock(
          'Summarize this role in one dense sentence for a CV\'s compacted ' +
            '"earlier career" section, grounded only in the bullets given — ' +
            'no invented detail.' +
            (rewordForMatch ? rewordInstruction : '') +
            ' Respond with JSON: {"summary": "..."}',
          `${jobContext}\n\nRole: ${entry.job_title} at ${entry.employer}\n` +
            `Bullets:\n${JSON.stringify(bullets)}`,
        );
        if (typeof res?.summary === 'string' && res.summary.trim()) {
          summaryByExperience.set(entry.id, res.summary.trim());
        } else {
          console.log(
            `[build-cv] earlier-career summary for "${entry.job_title}" ` +
              'got no usable summary in response. Raw response:',
            JSON.stringify(res),
          );
          fallbackWarnings.push(
            `Earlier-career summary for "${entry.job_title}" couldn't be ` +
              'generated — its bullets were joined as plain text instead ' +
              'of a condensed sentence.',
          );
        }
      })(),
    );
  }

  for (const entry of education) {
    const items = itemsByEducation.get(entry.id) ?? [];
    if (items.length === 0) continue;

    tasks.push(
      (async () => {
        const res = await callBedrock(
          'Given a job and a list of qualification detail lines (id, text) ' +
            'for one education entry, choose which are relevant to this job ' +
            'and order them by relevance. Never invent an id. Respond with ' +
            'JSON: {"item_ids": ["..."]}',
          `${jobContext}\n\nQualification: ${entry.level}` +
            `${entry.subject ? ` in ${entry.subject}` : ''} at ${entry.establishment}\n` +
            `Details:\n${JSON.stringify(items.map((it) => ({ id: it.id, text: it.detail_text })))}`,
        );
        const ids = Array.isArray(res?.item_ids) ? res.item_ids : null;
        const validIds = new Set(items.map((it) => it.id));
        const filtered = ids ? ids.filter((id: string) => validIds.has(id)) : [];
        if (filtered.length === 0) {
          console.log(
            `[build-cv] education item selection for "${entry.establishment}" ` +
              'fell back to all items: no usable item_ids in response. Raw response:',
            JSON.stringify(res),
          );
          fallbackWarnings.push(
            `Detail selection for "${entry.establishment}" didn't come ` +
              'through — all details for that entry were included instead ' +
              'of a tailored subset.',
          );
        }
        itemSelectionByEducation.set(
          entry.id,
          filtered.length > 0 ? filtered : items.map((it) => it.id),
        );
      })(),
    );
  }

  for (const entry of certifications) {
    const items = itemsByCertification.get(entry.id) ?? [];
    if (items.length === 0) continue;

    tasks.push(
      (async () => {
        const res = await callBedrock(
          'Given a job and a list of detail lines (id, text) for one ' +
            'certification, choose which are relevant to this job and order ' +
            'them by relevance. Never invent an id. Respond with JSON: ' +
            '{"item_ids": ["..."]}',
          `${jobContext}\n\nCertification: ${entry.title} from ${entry.issuer}\n` +
            `Details:\n${JSON.stringify(items.map((it) => ({ id: it.id, text: it.detail_text })))}`,
        );
        const ids = Array.isArray(res?.item_ids) ? res.item_ids : null;
        const validIds = new Set(items.map((it) => it.id));
        const filtered = ids ? ids.filter((id: string) => validIds.has(id)) : [];
        if (filtered.length === 0) {
          console.log(
            `[build-cv] certification item selection for "${entry.title}" ` +
              'fell back to all items: no usable item_ids in response. Raw response:',
            JSON.stringify(res),
          );
          fallbackWarnings.push(
            `Detail selection for "${entry.title}" didn't come through — ` +
              'all details for that entry were included instead of a ' +
              'tailored subset.',
          );
        }
        itemSelectionByCertification.set(
          entry.id,
          filtered.length > 0 ? filtered : items.map((it) => it.id),
        );
      })(),
    );
  }

  await Promise.all(tasks);

  // --- Assemble the structured result, defensively, from OUR stored text
  // by default — sections/entries below reference selected ids and render
  // our own stored text for them, not the model's own text, EXCEPT: the
  // profile paragraph and earlier-career summaries are always model-drafted
  // (from real, given skills/bullets only), and experience bullets render a
  // reworded version instead of the stored one only when rewordForMatch was
  // requested AND the model actually returned one — otherwise stored text,
  // as always. Sections only appear if they end up with content. ---

  const skillTextById = new Map(skills.map((s) => [s.id, s.skill_text]));
  const sections: Record<string, unknown>[] = [];

  if (profileSummary) {
    sections.push({ id: 'profile', type: 'profile', heading: 'Profile', text: profileSummary });
  }

  if (selectedSkillIds.length > 0) {
    sections.push({
      id: 'skills',
      type: 'skills',
      heading: 'Skills',
      items: selectedSkillIds.map((id) => skillTextById.get(id)).filter(Boolean),
    });
  }

  if (recentExperience.length > 0) {
    sections.push({
      id: 'experience',
      type: 'experience',
      heading: 'Experience',
      entries: recentExperience.map((entry) => {
        const available = bulletsByExperience.get(entry.id) ?? [];
        const bulletTextById = new Map(available.map((b) => [b.id, b.bullet_text]));
        const rewordedById = bulletRewordByExperience.get(entry.id);
        return {
          id: entry.id,
          title: entry.job_title,
          employer: entry.employer,
          location: entry.location,
          date_range: formatDateRange(entry),
          bullets: (bulletSelectionByExperience.get(entry.id) ?? [])
            .map((id) => rewordedById?.get(id) ?? bulletTextById.get(id))
            .filter(Boolean),
        };
      }),
    });
  }

  if (earlierExperience.length > 0) {
    sections.push({
      id: 'earlier-experience',
      type: 'earlier_experience',
      heading: 'Earlier Career',
      entries: earlierExperience.map((entry) => ({
        id: entry.id,
        employer: entry.employer,
        title: entry.job_title,
        summary:
          summaryByExperience.get(entry.id) ||
          (earlierBulletsByExperience.get(entry.id) ?? []).join('; '),
      })),
    });
  }

  // Grouped by level (BSc/A-level/GCSE/etc.), then within each level by
  // establishment+year (multiple qualifications from the same sitting share
  // one sub-subsection, headed "level, establishment, year" all on one
  // line) — `education` is already sorted most-recent-first, so grouping by
  // first-seen level/establishment+year preserves that order at every tier
  // without a separate sort. `level` still lives on the outer group (used
  // to decide spacing: no gap within a level, a full gap between levels)
  // even though it no longer gets its own rendered line.
  if (education.length > 0) {
    interface EducationSubgroup {
      id: string;
      header: string;
      qualifications: Record<string, unknown>[];
    }
    interface EducationLevelGroup {
      id: string;
      level: string;
      subgroupOrder: string[];
      subgroupsByKey: Map<string, EducationSubgroup>;
    }

    const levelGroups = new Map<string, EducationLevelGroup>();
    const levelOrder: string[] = [];

    for (const entry of education) {
      const available = itemsByEducation.get(entry.id) ?? [];
      const itemTextById = new Map(available.map((it) => [it.id, it.detail_text]));
      const qualification = {
        id: entry.id,
        detail: [entry.subject, entry.grade].filter(Boolean).join(', '),
        items: (itemSelectionByEducation.get(entry.id) ?? [])
          .map((id) => itemTextById.get(id))
          .filter(Boolean),
      };

      let levelGroup = levelGroups.get(entry.level);
      if (!levelGroup) {
        levelGroup = { id: entry.level, level: entry.level, subgroupOrder: [], subgroupsByKey: new Map() };
        levelGroups.set(entry.level, levelGroup);
        levelOrder.push(entry.level);
      }

      const subgroupKey = `${entry.establishment}|${entry.qualification_year ?? ''}`;
      let subgroup = levelGroup.subgroupsByKey.get(subgroupKey);
      if (!subgroup) {
        subgroup = {
          id: subgroupKey,
          header: [
            entry.level,
            entry.establishment,
            entry.qualification_year ? String(entry.qualification_year) : null,
          ]
            .filter(Boolean)
            .join(', '),
          qualifications: [],
        };
        levelGroup.subgroupsByKey.set(subgroupKey, subgroup);
        levelGroup.subgroupOrder.push(subgroupKey);
      }
      subgroup.qualifications.push(qualification);
    }

    const groups: Record<string, unknown>[] = [];
    for (const level of levelOrder) {
      const levelGroup = levelGroups.get(level);
      if (!levelGroup) continue;
      const subgroups: EducationSubgroup[] = [];
      for (const key of levelGroup.subgroupOrder) {
        const subgroup = levelGroup.subgroupsByKey.get(key);
        if (subgroup) subgroups.push(subgroup);
      }
      groups.push({ id: levelGroup.id, level: levelGroup.level, subgroups });
    }

    sections.push({
      id: 'education',
      type: 'education',
      heading: 'Education',
      groups,
    });
  }

  if (certifications.length > 0) {
    sections.push({
      id: 'certifications',
      type: 'certification',
      heading: 'Certifications',
      entries: certifications.map((entry) => {
        const available = itemsByCertification.get(entry.id) ?? [];
        const itemTextById = new Map(available.map((it) => [it.id, it.detail_text]));
        return {
          id: entry.id,
          title: entry.title,
          institution: entry.issuer,
          date_range: entry.start_year ? formatDateRange(entry) : null,
          items: (itemSelectionByCertification.get(entry.id) ?? [])
            .map((id) => itemTextById.get(id))
            .filter(Boolean),
        };
      }),
    });
  }

  const sectionById = new Map(customSections.map((s) => [s.id, s]));
  for (const id of selectedCustomSectionIds) {
    const section = sectionById.get(id);
    if (!section) continue;

    sections.push({
      id: section.id,
      type: 'custom',
      heading: section.heading,
      format: section.format,
      intro: section.intro_text ?? '',
      content: section.content,
    });
  }

  // "Links" is a plain derived list (no AI selection involved) so it's built
  // here alongside the other sections, always last — the renderer places
  // main-column sections in array order, so appending it here is what makes
  // it the CV's final section.
  const linkItems: { label: string; url: string }[] = [];
  if (profile?.linkedin_url) linkItems.push({ label: 'LinkedIn', url: profile.linkedin_url });
  if (profile?.github_url) linkItems.push({ label: 'GitHub', url: profile.github_url });
  if (profile?.portfolio_url) linkItems.push({ label: 'Portfolio', url: profile.portfolio_url });
  if (profile?.website_url) linkItems.push({ label: 'Website', url: profile.website_url });
  if (linkItems.length > 0) {
    sections.push({ id: 'links', type: 'links', heading: 'Links', items: linkItems });
  }

  const cv = {
    name: profile?.full_name ?? null,
    contact: {
      // application_email is a separate, user-editable address for
      // job-application contact purposes — distinct from the account's
      // login email, which is never used for this. Falls back to the
      // account email for any profile saved before this field existed.
      email: profile?.application_email || user.email || null,
      phone: formatInternationalPhone(profile?.phone_country ?? null, profile?.phone_number ?? null),
      location: profile?.location ?? null,
      linkedin_url: profile?.linkedin_url ?? null,
      github_url: profile?.github_url ?? null,
      portfolio_url: profile?.portfolio_url ?? null,
      website_url: profile?.website_url ?? null,
    },
    avatar_url: profile?.avatar_url ?? null,
    sections,
  };

  await supabaseAdmin.from('activity_log').insert({
    user_id: user.id,
    action: 'cv_built',
    details: { job_id },
  });

  return jsonResponse(
    {
      cv,
      suggested_new_skills: suggestedNewSkills,
      fallback_warnings: fallbackWarnings,
    },
    200,
  );
});
