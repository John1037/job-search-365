import { STATUS_ORDER } from './jobFormat';

export const SORT_FIELDS = [
  { value: 'status', label: 'Status' },
  { value: 'date_logged', label: 'Date logged' },
  { value: 'updated_at', label: 'Last updated' },
  { value: 'status_updated_at', label: 'Last status update' },
  { value: 'salary_min', label: 'Salary (min)' },
  { value: 'salary_max', label: 'Salary (max)' },
];

export const MAX_SORT_LEVELS = 3;

// Applied when the user hasn't picked any sort levels: favorite jobs float
// to the top (2 = Favorite, 1 = Preferred, null last), then newest first.
export const DEFAULT_SORT_LEVELS = [
  { field: 'favorite_level', direction: 'desc' },
  { field: 'date_logged', direction: 'desc' },
];

export function sortFieldLabel(field) {
  return SORT_FIELDS.find((f) => f.value === field)?.label ?? field;
}

function compareByField(a, b, field, direction) {
  const multiplier = direction === 'desc' ? -1 : 1;

  if (field === 'salary_min' || field === 'salary_max' || field === 'favorite_level') {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls always sort last, either direction
    if (bv == null) return -1;
    return (av - bv) * multiplier;
  }

  if (field === 'status') {
    const aRank = STATUS_ORDER.indexOf(a.status);
    const bRank = STATUS_ORDER.indexOf(b.status);
    const aSafe = aRank === -1 ? STATUS_ORDER.length : aRank;
    const bSafe = bRank === -1 ? STATUS_ORDER.length : bRank;
    return (aSafe - bSafe) * multiplier;
  }

  // date_logged, updated_at, status_updated_at — ISO date/timestamp
  // strings sort correctly with plain string comparison.
  const av = a[field] ?? '';
  const bv = b[field] ?? '';
  if (av < bv) return -1 * multiplier;
  if (av > bv) return 1 * multiplier;
  return 0;
}

// sortLevels: array of up to MAX_SORT_LEVELS { field, direction } objects,
// applied in order as tie-breakers. Falls back to DEFAULT_SORT_LEVELS when
// empty.
export function sortJobs(jobs, sortLevels) {
  const levels = sortLevels.length > 0 ? sortLevels : DEFAULT_SORT_LEVELS;

  return [...jobs].sort((a, b) => {
    for (const level of levels) {
      const cmp = compareByField(a, b, level.field, level.direction);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}
