export const JOB_LIST_COLUMNS =
  'id, job_title, employer, status, salary_min, salary_max, salary_currency, salary_type, salary_basis, employment_type, location_type, location, date_logged, updated_at, status_updated_at, favorite_level';

// Of the fixed event names, only these describe something still ahead —
// the rest ("Applied", "Interview completed", "Offer received") record
// something that already happened and shouldn't surface as an alert.
export const UPCOMING_EVENT_NAMES = ['Interview scheduled'];

// Scheduled/cancelled/completed are treated as one interchangeable stage
// throughout the app — see getAvailableEventNames below.
export const INTERVIEW_EVENT_NAMES = [
  'Interview scheduled',
  'Interview cancelled',
  'Interview completed',
];

// Extra modifier class for a status/event name shown via .item-badge —
// '' keeps the default accent look. Kept in sync wherever a status or
// suggested event is badged: job cards/list items/detail page, and the
// Gmail inbox review queue.
export function statusBadgeClass(status) {
  if (status === 'Unsuccessful') return 'item-badge-error';
  if (
    status === 'Interview scheduled' ||
    status === 'Interview completed' ||
    status === 'Offer received' ||
    status === 'Offer accepted'
  ) {
    return 'item-badge-success';
  }
  return '';
}

const SALARY_TYPE_LABELS = {
  annual: '/yr',
  monthly: '/mo',
  weekly: '/wk',
  hourly: '/hr',
};

export const LOCATION_TYPE_LABELS = {
  on_site: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

export const EMPLOYMENT_TYPE_LABELS = {
  full_time: 'Full time',
  part_time: 'Part time',
};

// 'Online' is retained only so jobs logged before this list was split still
// have a matching option — new entries should use one of the specific ones.
export const APPLICATION_METHOD_OPTIONS = [
  'Online - job search site',
  'Online - direct',
  'LinkedIn',
  'Online - other',
  'Online',
];

export const STATUS_ORDER = [
  'Interested',
  'Applied',
  'Application acknowledged',
  'Interview scheduled',
  'Interview cancelled',
  'Interview completed',
  'Offer received',
  'Offer accepted',
  'Unsuccessful',
  'Other',
];

// Linear progression used to decide which events make sense to log next,
// given the job's current status. Doesn't include 'Interested' (the
// starting point, not something you log) or 'Other' (always offered
// separately, handled as a special case below).
const EVENT_PROGRESSION = [
  'Applied',
  'Application acknowledged',
  'Interview scheduled',
  'Interview cancelled',
  'Interview completed',
  'Offer received',
  'Offer accepted',
  'Unsuccessful',
];

// Which event names should appear in "Add event" for a job currently at
// the given status. Rules:
// - 'Other' is always offered.
// - From 'Interested', only 'Applied' (plus 'Other') makes sense.
// - From 'Other', the status is ambiguous, so every event is offered.
// - Otherwise, only events later in the progression than the current
//   status are offered — except the three interview events are treated
//   as a single stage: if any of them would be offered, all three are.
export function getAvailableEventNames(status) {
  if (status === 'Interested') return ['Applied', 'Other'];
  if (status === 'Other') return [...EVENT_PROGRESSION, 'Other'];

  const currentIndex = EVENT_PROGRESSION.indexOf(status);
  let options =
    currentIndex === -1
      ? [...EVENT_PROGRESSION]
      : EVENT_PROGRESSION.slice(currentIndex + 1);

  if (options.some((name) => INTERVIEW_EVENT_NAMES.includes(name))) {
    options = EVENT_PROGRESSION.filter(
      (name) => INTERVIEW_EVENT_NAMES.includes(name) || options.includes(name),
    );
  }

  return [...options, 'Other'];
}

const SALARY_BASIS_LABELS = {
  flat_estimated: ' (estimated)',
  ote_stated: ' OTE',
};

export function formatSalary(job) {
  if (job.salary_min == null && job.salary_max == null) return null;

  const min =
    job.salary_min != null ? Number(job.salary_min).toLocaleString() : null;
  const max =
    job.salary_max != null ? Number(job.salary_max).toLocaleString() : null;
  const range = min && max ? `${min}–${max}` : (min ?? max);
  const typeLabel = SALARY_TYPE_LABELS[job.salary_type];
  const suffix = typeLabel ? ` ${typeLabel}` : '';
  const basis = SALARY_BASIS_LABELS[job.salary_basis] ?? '';
  const currency = job.salary_currency ? `${job.salary_currency} ` : '';

  return `${currency}${range}${suffix}${basis}`;
}

export function formatLocation(job) {
  const typeLabel = LOCATION_TYPE_LABELS[job.location_type];
  if (!typeLabel) return job.location || null;
  if (typeLabel === 'Remote' || !job.location) return typeLabel;
  return `${typeLabel} — ${job.location}`;
}

export const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// For CV experience/education entries — year is required, month optional,
// end may be absent entirely (is_current) rather than a real date.
export function formatCvDateRange({
  start_year,
  start_month,
  end_year,
  end_month,
  is_current,
}) {
  const start = start_month
    ? `${MONTH_ABBR[start_month - 1]} ${start_year}`
    : `${start_year}`;

  if (is_current) return `${start} - Present`;

  const end = end_month
    ? `${MONTH_ABBR[end_month - 1]} ${end_year}`
    : end_year
      ? `${end_year}`
      : 'Present';

  return `${start} - ${end}`;
}

function formatTime12Hour(hh, mm) {
  const hourNum = Number(hh);
  const period = hourNum >= 12 ? 'PM' : 'AM';
  const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
  return `${hour12}:${mm} ${period}`;
}

// US: 12-hour clock with AM/PM. Everywhere else: 24-hour clock.
export function formatEventDateTime(dateStr, timeStr, isUS) {
  const [year, month, day] = dateStr.split('-');
  const monthAbbr = MONTH_ABBR[Number(month) - 1];
  const datePart = isUS
    ? `${monthAbbr} ${day} ${year}`
    : `${day} ${monthAbbr} ${year}`;

  if (!timeStr) return datePart;

  const [hh, mm] = timeStr.split(':');
  const timePart = isUS ? formatTime12Hour(hh, mm) : `${hh}:${mm}`;

  return `${datePart} ${timePart}`;
}

// Unlike event dates/times (fixed wall-clock values, never converted),
// this is a genuine instant in time — converting to the viewer's local
// timezone for display is the correct behaviour here.
export function formatStatusDate(isoTimestamp, isUS) {
  if (!isoTimestamp) return null;

  const date = new Date(isoTimestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const monthAbbr = MONTH_ABBR[date.getMonth()];
  const year = date.getFullYear();

  return isUS ? `${monthAbbr} ${day} ${year}` : `${day} ${monthAbbr} ${year}`;
}
