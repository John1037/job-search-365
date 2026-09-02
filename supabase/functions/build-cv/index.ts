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

  let job_id: string | undefined;
  let recent_mode: string | undefined;
  let recent_count: number | undefined;

  try {
    ({ job_id, recent_mode, recent_count } = await req.json());
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
    sectionsResult,
  ] = await Promise.all([
    supabaseUser
      .from('profiles')
      .select(
        'cv_summary, full_name, phone_country, phone_number, location, linkedin_url, github_url, avatar_url',
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
      .select(
        'id, institution, qualification_title, location, start_year, start_month, end_year, end_month, is_current',
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
  if (sectionsResult.error) {
    console.log('[build-cv] custom sections query failed:', sectionsResult.error);
    return jsonResponse({ error: sectionsResult.error.message }, 500);
  }

  const profile = profileResult.data;
  const skills = skillsResult.data ?? [];
  const experience = [...(experienceResult.data ?? [])].sort(
    (a, b) => dateSortKey(b) - dateSortKey(a),
  );
  const education = educationResult.data ?? [];
  const customSections = sectionsResult.data ?? [];

  if (
    skills.length === 0 &&
    experience.length === 0 &&
    education.length === 0 &&
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
  const earlierExperienceIds = earlierExperience.map((e) => e.id);

  const [bulletsResult, itemsResult, earlierBulletsResult] = await Promise.all([
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

  const earlierBulletsByExperience = new Map<string, string[]>();
  for (const row of earlierBulletsResult.data ?? []) {
    const list = earlierBulletsByExperience.get(row.experience_id) ?? [];
    list.push(row.bullet_text);
    earlierBulletsByExperience.set(row.experience_id, list);
  }

  // A single call covering the whole library (skills + every role's
  // bullets + education + custom sections + two prose fields) proved slow
  // enough to time out — the same lesson learned building the old
  // CV-optimization feature: keep each DeepSeek call small and scoped to
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
  const deepseekSemaphore = createSemaphore(4);

  async function callDeepSeek(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<any> {
    await deepseekSemaphore.acquire();
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-v4-pro',
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          max_tokens: 2048,
          temperature: 0,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!response.ok) {
        const detail = await response.text();
        console.log('[build-cv] DeepSeek call failed:', detail);
        return null;
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      return content ? JSON.parse(content) : null;
    } catch (err) {
      console.log('[build-cv] DeepSeek call failed:', err);
      return null;
    } finally {
      deepseekSemaphore.release();
    }
  }

  const jobContext =
    `Job title: ${job.job_title}\nEmployer: ${job.employer}\n\n` +
    `Job description:\n${job.description}`;

  // Defensive fallbacks (include-everything) if a given call fails or
  // returns nothing usable — a build should still produce something
  // sensible rather than silently dropping a whole section.
  let selectedSkillIds = skills.map((s) => s.id);
  let profileSummary = (profile?.cv_summary ?? '').trim();
  let selectedCustomSectionIds = customSections.map((s) => s.id);
  const bulletSelectionByExperience = new Map<string, string[]>();
  const summaryByExperience = new Map<string, string>();
  const itemSelectionByEducation = new Map<string, string[]>();

  const tasks: Promise<void>[] = [];

  if (skills.length > 0) {
    tasks.push(
      (async () => {
        const res = await callDeepSeek(
          'Given a job and a candidate\'s list of skills (id, text), choose ' +
            'which skills are relevant to this job and order them by ' +
            'relevance — required/most important first. Omit skills that ' +
            "clearly don't fit; this is a curated CV, not everything the " +
            'candidate has ever listed. Never invent an id. Respond with ' +
            'JSON: {"skill_ids": ["..."]}',
          `${jobContext}\n\nSkills:\n${JSON.stringify(
            skills.map((s) => ({ id: s.id, text: s.skill_text })),
          )}`,
        );
        const ids = Array.isArray(res?.skill_ids) ? res.skill_ids : null;
        if (ids) {
          const validIds = new Set(skills.map((s) => s.id));
          const filtered = ids.filter((id: string) => validIds.has(id));
          if (filtered.length > 0) selectedSkillIds = filtered;
        }
      })(),
    );
  }

  if (customSections.length > 0) {
    tasks.push(
      (async () => {
        const res = await callDeepSeek(
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
          if (filtered.length > 0) selectedCustomSectionIds = filtered;
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
      const res = await callDeepSeek(
        'Write a tailored CV profile paragraph (2-4 sentences) for this ' +
          "specific job, based on the candidate's seed paragraph and real " +
          'skills/roles given. Do not claim skills or experience not ' +
          'evidenced in what was given. If the seed is empty, write a ' +
          'plain factual paragraph from the skills/roles alone. Respond ' +
          'with JSON: {"profile_summary": "..."}',
        `${jobContext}\n\nCandidate overview:\n${JSON.stringify(overview)}`,
      );
      if (typeof res?.profile_summary === 'string' && res.profile_summary.trim()) {
        profileSummary = res.profile_summary.trim();
      }
    })(),
  );

  for (const entry of recentExperience) {
    const bullets = bulletsByExperience.get(entry.id) ?? [];
    if (bullets.length === 0) continue;

    tasks.push(
      (async () => {
        const res = await callDeepSeek(
          'Given a job and a list of achievement/responsibility bullets ' +
            '(id, text) for one role on a candidate\'s CV, choose which are ' +
            'relevant to this job and order them by relevance. Keep enough ' +
            "to represent the role well; omit ones that clearly don't fit. " +
            'Never invent an id or bullet text. Respond with JSON: ' +
            '{"bullet_ids": ["..."]}',
          `${jobContext}\n\nRole: ${entry.job_title} at ${entry.employer}\n` +
            `Bullets:\n${JSON.stringify(bullets.map((b) => ({ id: b.id, text: b.bullet_text })))}`,
        );
        const ids = Array.isArray(res?.bullet_ids) ? res.bullet_ids : null;
        const validIds = new Set(bullets.map((b) => b.id));
        const filtered = ids ? ids.filter((id: string) => validIds.has(id)) : [];
        bulletSelectionByExperience.set(
          entry.id,
          filtered.length > 0 ? filtered : bullets.map((b) => b.id),
        );
      })(),
    );
  }

  for (const entry of earlierExperience) {
    const bullets = earlierBulletsByExperience.get(entry.id) ?? [];
    if (bullets.length === 0) continue;

    tasks.push(
      (async () => {
        const res = await callDeepSeek(
          'Summarize this role in one dense sentence for a CV\'s compacted ' +
            '"earlier career" section, grounded only in the bullets given — ' +
            'no invented detail. Respond with JSON: {"summary": "..."}',
          `${jobContext}\n\nRole: ${entry.job_title} at ${entry.employer}\n` +
            `Bullets:\n${JSON.stringify(bullets)}`,
        );
        if (typeof res?.summary === 'string' && res.summary.trim()) {
          summaryByExperience.set(entry.id, res.summary.trim());
        }
      })(),
    );
  }

  for (const entry of education) {
    const items = itemsByEducation.get(entry.id) ?? [];
    if (items.length === 0) continue;

    tasks.push(
      (async () => {
        const res = await callDeepSeek(
          'Given a job and a list of qualification detail lines (id, text) ' +
            'for one education entry, choose which are relevant to this job ' +
            'and order them by relevance. Never invent an id. Respond with ' +
            'JSON: {"item_ids": ["..."]}',
          `${jobContext}\n\nQualification: ${entry.qualification_title} at ` +
            `${entry.institution}\nDetails:\n${JSON.stringify(items.map((it) => ({ id: it.id, text: it.detail_text })))}`,
        );
        const ids = Array.isArray(res?.item_ids) ? res.item_ids : null;
        const validIds = new Set(items.map((it) => it.id));
        const filtered = ids ? ids.filter((id: string) => validIds.has(id)) : [];
        itemSelectionByEducation.set(
          entry.id,
          filtered.length > 0 ? filtered : items.map((it) => it.id),
        );
      })(),
    );
  }

  await Promise.all(tasks);

  // --- Assemble the structured result, defensively, from OUR stored text
  // only — sections/entries below reference selected ids but always
  // render our own stored text for them, never anything the model
  // returned directly, and only appear if they end up with content. ---

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
        return {
          id: entry.id,
          title: entry.job_title,
          employer: entry.employer,
          location: entry.location,
          date_range: formatDateRange(entry),
          bullets: (bulletSelectionByExperience.get(entry.id) ?? [])
            .map((id) => bulletTextById.get(id))
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

  if (education.length > 0) {
    sections.push({
      id: 'education',
      type: 'education',
      heading: 'Education',
      entries: education.map((entry) => {
        const available = itemsByEducation.get(entry.id) ?? [];
        const itemTextById = new Map(available.map((it) => [it.id, it.detail_text]));
        return {
          id: entry.id,
          title: entry.qualification_title,
          institution: entry.institution,
          date_range: entry.start_year ? formatDateRange(entry) : null,
          items: (itemSelectionByEducation.get(entry.id) ?? [])
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

  const cv = {
    name: profile?.full_name ?? null,
    contact: {
      email: user.email ?? null,
      phone: [profile?.phone_country, profile?.phone_number].filter(Boolean).join(' ') || null,
      location: profile?.location ?? null,
      linkedin_url: profile?.linkedin_url ?? null,
      github_url: profile?.github_url ?? null,
    },
    avatar_url: profile?.avatar_url ?? null,
    sections,
  };

  return jsonResponse({ cv }, 200);
});
