import { supabase } from './supabaseClient';

// "Session" here means an authenticated session, not a browser tab — the
// flag lives in sessionStorage so a plain page refresh doesn't re-trigger
// it, but App.jsx clears it on every genuine SIGNED_IN/PASSWORD_RECOVERY
// event so switching accounts (or retrying a login) in the same tab is
// still treated as a new session, not a continuation of the last one.
export const ONBOARDING_CHECKED_KEY = 'js365_onboarding_checked';

export function resetOnboardingCheck() {
  sessionStorage.removeItem(ONBOARDING_CHECKED_KEY);
}

// Each card's "complete" rule lives here, not in the pages that display
// them, since both Home (session-start redirect) and Welcome (checkmarks)
// need the exact same definition of "done" to stay in sync.
export async function getOnboardingStatus() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profileResult, skillsResult, experienceResult, educationResult, customResult] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(
          'full_name, short_name, location, country, cv_summary, has_created_job, welcome_dismissed',
        )
        .eq('id', user.id)
        .maybeSingle(),
      supabase.from('cv_skills').select('id').limit(1),
      supabase.from('cv_experience').select('id').limit(1),
      supabase.from('cv_education').select('id').limit(1),
      supabase.from('cv_custom_sections').select('id').limit(1),
    ]);

  const profile = profileResult.data;

  const profileComplete = !!(
    profile?.full_name &&
    profile?.short_name &&
    profile?.location &&
    profile?.country
  );

  const hasSkill = (skillsResult.data?.length ?? 0) > 0;
  const hasExperienceEducationOrCustom =
    (experienceResult.data?.length ?? 0) > 0 ||
    (educationResult.data?.length ?? 0) > 0 ||
    (customResult.data?.length ?? 0) > 0;
  const cvComplete = !!(profile?.cv_summary?.trim() && hasSkill && hasExperienceEducationOrCustom);

  // Sourced from profiles.has_created_job, set permanently true the first
  // time a job is ever created (via a DB trigger on jobs) — deliberately
  // NOT a live "do you currently have any jobs" count, since deleting every
  // job afterward shouldn't un-complete this card.
  const jobComplete = !!profile?.has_created_job;

  // Set only via the welcome screen's "Do not show this screen again"
  // checkbox — an explicit opt-out, independent of how complete the three
  // cards are.
  const dismissed = !!profile?.welcome_dismissed;

  return { profileComplete, cvComplete, jobComplete, dismissed, userId: user.id };
}
