import {
  STATUS_ORDER,
  LOCATION_TYPE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
} from './jobFormat';

// Sentinel used inside multiselect option lists/selections to represent
// "this column is null on the job" — never sent to Supabase, just compared
// against locally.
export const NULL_VALUE = '__not_specified__';

export const EMPTY_FILTERS = {
  status: [],
  locationType: [],
  location: [],
  employmentType: [],
  salaryMin: '',
  salaryMinIncludeNull: false,
  salaryMax: '',
  salaryMaxIncludeNull: false,
};

export function hasActiveFilters(filters) {
  return (
    filters.status.length > 0 ||
    filters.locationType.length > 0 ||
    filters.location.length > 0 ||
    filters.employmentType.length > 0 ||
    filters.salaryMin !== '' ||
    filters.salaryMax !== ''
  );
}

export function countActiveFilters(filters) {
  let count = 0;
  if (filters.status.length > 0) count += 1;
  if (filters.locationType.length > 0) count += 1;
  if (filters.location.length > 0) count += 1;
  if (filters.employmentType.length > 0) count += 1;
  if (filters.salaryMin !== '') count += 1;
  if (filters.salaryMax !== '') count += 1;
  return count;
}

// Builds the option list for one multiselect from whatever values actually
// appear across the given jobs, rather than a fixed vocabulary — so filter
// options never point at a value that would return zero results. `order`
// (if given) sorts known values into a logical sequence; anything else
// falls back to alphabetical. A "Not specified" option is appended whenever
// at least one job has a null/empty value for that column.
function collectOptions(jobs, key, { order, labels } = {}) {
  const present = new Set();
  let hasNull = false;

  for (const job of jobs) {
    const value = job[key];
    if (value == null || value === '') {
      hasNull = true;
    } else {
      present.add(value);
    }
  }

  const known = order ? order.filter((value) => present.has(value)) : [];
  const rest = [...present]
    .filter((value) => !known.includes(value))
    .sort((a, b) => a.localeCompare(b));

  const options = [...known, ...rest].map((value) => ({
    value,
    label: labels?.[value] ?? value,
  }));

  if (hasNull) {
    options.push({ value: NULL_VALUE, label: 'Not specified' });
  }

  return options;
}

export function buildFilterOptions(jobs) {
  return {
    status: collectOptions(jobs, 'status', { order: STATUS_ORDER }),
    locationType: collectOptions(jobs, 'location_type', {
      order: ['on_site', 'hybrid', 'remote'],
      labels: LOCATION_TYPE_LABELS,
    }),
    location: collectOptions(jobs, 'location'),
    employmentType: collectOptions(jobs, 'employment_type', {
      order: ['full_time', 'part_time'],
      labels: EMPLOYMENT_TYPE_LABELS,
    }),
  };
}

function matchesMultiselect(jobValue, selected) {
  if (selected.length === 0) return true;
  const normalized = jobValue == null || jobValue === '' ? NULL_VALUE : jobValue;
  return selected.includes(normalized);
}

function matchesSalaryFloor(jobValue, thresholdStr, includeNull) {
  if (thresholdStr === '') return true;
  if (jobValue == null) return includeNull;
  return jobValue >= Number(thresholdStr);
}

function labelsFor(options, selectedValues) {
  return selectedValues
    .map((value) => options.find((opt) => opt.value === value)?.label ?? value)
    .join(', ');
}

// Builds one chip per active filter category, for the active-filters summary
// line. `id` identifies the category so a chip's "x" can clear just that one.
export function describeActiveFilters(filters, options) {
  const chips = [];

  if (filters.status.length > 0) {
    chips.push({
      id: 'status',
      label: `Status: ${labelsFor(options.status, filters.status)}`,
    });
  }
  if (filters.locationType.length > 0) {
    chips.push({
      id: 'locationType',
      label: `Location type: ${labelsFor(options.locationType, filters.locationType)}`,
    });
  }
  if (filters.location.length > 0) {
    chips.push({
      id: 'location',
      label: `Location: ${labelsFor(options.location, filters.location)}`,
    });
  }
  if (filters.employmentType.length > 0) {
    chips.push({
      id: 'employmentType',
      label: `Employment type: ${labelsFor(options.employmentType, filters.employmentType)}`,
    });
  }
  if (filters.salaryMin !== '') {
    chips.push({
      id: 'salaryMin',
      label: `Salary min ≥ ${filters.salaryMin}${
        filters.salaryMinIncludeNull ? ' (or unspecified)' : ''
      }`,
    });
  }
  if (filters.salaryMax !== '') {
    chips.push({
      id: 'salaryMax',
      label: `Salary max ≥ ${filters.salaryMax}${
        filters.salaryMaxIncludeNull ? ' (or unspecified)' : ''
      }`,
    });
  }

  return chips;
}

// Resets a single filter category back to "no filter", leaving the rest
// of the current filter state untouched.
export function clearFilterCategory(filters, id) {
  const next = { ...filters };

  if (id === 'status') next.status = [];
  else if (id === 'locationType') next.locationType = [];
  else if (id === 'location') next.location = [];
  else if (id === 'employmentType') next.employmentType = [];
  else if (id === 'salaryMin') {
    next.salaryMin = '';
    next.salaryMinIncludeNull = false;
  } else if (id === 'salaryMax') {
    next.salaryMax = '';
    next.salaryMaxIncludeNull = false;
  }

  return next;
}

export function jobMatchesFilters(job, filters) {
  if (filters.status.length > 0 && !filters.status.includes(job.status)) {
    return false;
  }
  if (!matchesMultiselect(job.location_type, filters.locationType)) return false;
  if (!matchesMultiselect(job.location, filters.location)) return false;
  if (!matchesMultiselect(job.employment_type, filters.employmentType)) return false;
  if (
    !matchesSalaryFloor(job.salary_min, filters.salaryMin, filters.salaryMinIncludeNull)
  ) {
    return false;
  }
  if (
    !matchesSalaryFloor(job.salary_max, filters.salaryMax, filters.salaryMaxIncludeNull)
  ) {
    return false;
  }
  return true;
}
