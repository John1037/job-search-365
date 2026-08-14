export const JOB_LIST_COLUMNS =
  'id, job_title, employer, status, salary_min, salary_max, salary_type, salary_basis, location_type, location';

// Of the fixed event names, only these describe something still ahead —
// the rest ("Applied", "Interview completed", "Offer received") record
// something that already happened and shouldn't surface as an alert.
export const UPCOMING_EVENT_NAMES = ['Interview scheduled'];

const SALARY_TYPE_LABELS = {
  annual: '/yr',
  monthly: '/mo',
  weekly: '/wk',
  hourly: '/hr',
};

const LOCATION_TYPE_LABELS = {
  on_site: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

export function formatSalary(job) {
  if (job.salary_min == null && job.salary_max == null) return null;

  const min =
    job.salary_min != null ? Number(job.salary_min).toLocaleString() : null;
  const max =
    job.salary_max != null ? Number(job.salary_max).toLocaleString() : null;
  const range = min && max ? `${min}–${max}` : (min ?? max);
  const suffix = SALARY_TYPE_LABELS[job.salary_type] ?? '';
  const basis = job.salary_basis === 'ote' ? ' OTE' : '';

  return `${range}${suffix}${basis}`;
}

export function formatLocation(job) {
  const typeLabel = LOCATION_TYPE_LABELS[job.location_type];
  if (!typeLabel) return job.location || null;
  if (typeLabel === 'Remote' || !job.location) return typeLabel;
  return `${typeLabel} — ${job.location}`;
}
