import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import ConfirmDialog from '../components/ConfirmDialog';
import FilterJobsDialog from '../components/FilterJobsDialog';
import SortJobsDialog from '../components/SortJobsDialog';
import JobCard from '../components/JobCard';
import { JOB_LIST_COLUMNS } from '../jobFormat';
import {
  EMPTY_FILTERS,
  buildFilterOptions,
  countActiveFilters,
  describeActiveFilters,
  clearFilterCategory,
  jobMatchesFilters,
} from '../jobFilters';
import { MAX_SORT_LEVELS, sortFieldLabel, sortJobs } from '../jobSort';

function ManageJobs({ closed = false }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobPendingDelete, setJobPendingDelete] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [sortLevels, setSortLevels] = useState([]);
  const [sortDialogOpen, setSortDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') ?? '');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  const [crossScopeCount, setCrossScopeCount] = useState(0);

  // Wait for typing to pause before actually querying the database.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearchTerm(searchTerm), 350);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  // Keep the URL in sync so a search is shareable/bookmarkable and survives
  // a page reload, without spamming browser history on every keystroke.
  useEffect(() => {
    const trimmed = debouncedSearchTerm.trim();
    setSearchParams(trimmed === '' ? {} : { q: trimmed }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm]);

  useEffect(() => {
    async function loadJobs() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      let query = supabase
        .from('jobs')
        .select(JOB_LIST_COLUMNS)
        .eq('user_id', user.id)
        .eq('is_closed', closed);

      const trimmed = debouncedSearchTerm.trim();
      if (trimmed !== '') {
        query = query.textSearch('search_vector', trimmed, {
          type: 'websearch',
          config: 'english',
        });
      }

      const { data, error } = await query.order('date_logged', {
        ascending: false,
      });

      if (error) {
        setError(error.message);
      } else {
        setJobs(data);
      }

      setLoading(false);
    }

    loadJobs();
  }, [closed, debouncedSearchTerm]);

  // How many matches exist on the *other* (open/closed) page, so a search
  // here doesn't silently hide a job that's just sitting in the other list.
  useEffect(() => {
    async function loadCrossScopeCount() {
      const trimmed = debouncedSearchTerm.trim();
      if (trimmed === '') {
        setCrossScopeCount(0);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { count, error } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_closed', !closed)
        .textSearch('search_vector', trimmed, {
          type: 'websearch',
          config: 'english',
        });

      if (!error) setCrossScopeCount(count ?? 0);
    }

    loadCrossScopeCount();
  }, [closed, debouncedSearchTerm]);

  const filterOptions = useMemo(() => buildFilterOptions(jobs), [jobs]);
  const filteredJobs = useMemo(
    () => jobs.filter((job) => jobMatchesFilters(job, filters)),
    [jobs, filters],
  );
  const sortedJobs = useMemo(
    () => sortJobs(filteredJobs, sortLevels),
    [filteredJobs, sortLevels],
  );
  const activeFilterCount = countActiveFilters(filters);
  const filterChips = describeActiveFilters(filters, filterOptions);
  const sortChips = sortLevels.map((level, index) => ({
    id: index,
    label: `${index + 1}. ${sortFieldLabel(level.field)} ${
      level.direction === 'asc' ? '▲' : '▼'
    }`,
  }));

  function handleRemoveFilterChip(id) {
    setFilters((f) => clearFilterCategory(f, id));
  }

  function handleRemoveSortChip(index) {
    setSortLevels((levels) => levels.filter((_, i) => i !== index));
  }

  function handleAddSortLevel(level) {
    setSortLevels((levels) => [...levels, level]);
  }

  async function handleCloseJob(job) {
    setError(null);

    const { error } = await supabase
      .from('jobs')
      .update({ is_closed: true, updated_at: new Date().toISOString() })
      .eq('id', job.id);

    if (error) {
      setError(error.message);
      return;
    }

    setJobs((js) => js.filter((j) => j.id !== job.id));
  }

  async function handleReopenJob(job) {
    setError(null);

    const { error } = await supabase
      .from('jobs')
      .update({ is_closed: false, updated_at: new Date().toISOString() })
      .eq('id', job.id);

    if (error) {
      setError(error.message);
      return;
    }

    setJobs((js) => js.filter((j) => j.id !== job.id));
  }

  async function handleConfirmDelete() {
    const job = jobPendingDelete;
    if (!job) return;

    setError(null);

    const { error: deleteError } = await supabase
      .from('jobs')
      .delete()
      .eq('id', job.id);

    if (deleteError) {
      setError(deleteError.message);
      setJobPendingDelete(null);
      return;
    }

    setJobs((js) => js.filter((j) => j.id !== job.id));
    setJobPendingDelete(null);
  }

  return (
    <div className="list-page list-page-wide">
      <div className="list-header">
        <h1>{closed ? 'Closed jobs' : 'Manage jobs'}</h1>
        <div className="list-header-actions">
          <button
            type="button"
            className="button-outline filter-by-button"
            onClick={() => setFilterDialogOpen(true)}
          >
            Filter by{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          <button
            type="button"
            className="button-outline sort-by-button"
            disabled={sortLevels.length >= MAX_SORT_LEVELS}
            title={
              sortLevels.length >= MAX_SORT_LEVELS
                ? `Maximum ${MAX_SORT_LEVELS} sort levels reached`
                : undefined
            }
            onClick={() => setSortDialogOpen(true)}
          >
            Sort by{sortLevels.length > 0 ? ` (${sortLevels.length})` : ''}
          </button>
          {!closed && (
            <button type="button" onClick={() => navigate('/jobs/new')}>
              Add a job
            </button>
          )}
        </div>
      </div>

      <div className="search-row">
        <div className="search-field">
          <input
            type="search"
            className="search-input"
            placeholder="Search title, employer, location, description, notes…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search jobs"
          />
          {searchTerm !== '' && (
            <button
              type="button"
              className="search-clear-button"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {!loading && debouncedSearchTerm.trim() !== '' && jobs.length === 0 && (
        <p className="search-no-match">
          No {closed ? 'closed' : 'open'} jobs match your search.
        </p>
      )}

      {debouncedSearchTerm.trim() !== '' && crossScopeCount > 0 && (
        <div className="search-cross-scope-hint">
          <Link
            to={`${closed ? '/jobs' : '/jobs/closed'}?q=${encodeURIComponent(
              debouncedSearchTerm.trim(),
            )}`}
            className="button-outline search-cross-scope-button"
          >
            {crossScopeCount} more match{crossScopeCount === 1 ? '' : 'es'} in{' '}
            {closed ? 'open' : 'closed'} jobs
          </Link>
        </div>
      )}

      {filterChips.length > 0 && (
        <div className="active-chips-row">
          <span className="active-chips-label">Applied filters:</span>
          <div className="active-chips-list">
            {filterChips.map((chip) => (
              <span key={chip.id} className="active-chip">
                {chip.label}
                <button
                  type="button"
                  className="active-chip-remove"
                  onClick={() => handleRemoveFilterChip(chip.id)}
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {sortChips.length > 0 && (
        <div className="active-chips-row">
          <span className="active-chips-label">Applied sorts:</span>
          <div className="active-chips-list">
            {sortChips.map((chip) => (
              <span
                key={`sort-${chip.id}`}
                className="active-chip active-chip-sort"
              >
                {chip.label}
                <button
                  type="button"
                  className="active-chip-remove"
                  onClick={() => handleRemoveSortChip(chip.id)}
                  aria-label={`Remove sort: ${chip.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : jobs.length === 0 ? (
        debouncedSearchTerm.trim() === '' && (
          <p className="empty-list-hint">
            {closed ? 'No closed jobs.' : 'No jobs added yet.'}
          </p>
        )
      ) : filteredJobs.length === 0 ? (
        <p className="empty-list-hint">No jobs match your filters.</p>
      ) : (
        <ul className="job-card-grid">
          {sortedJobs.map((job) => (
            <JobCard key={job.id} job={job}>
              {closed ? (
                <button
                  type="button"
                  className="button-outline"
                  onClick={() => handleReopenJob(job)}
                >
                  Reopen
                </button>
              ) : (
                <button
                  type="button"
                  className="button-outline"
                  onClick={() => handleCloseJob(job)}
                >
                  Close
                </button>
              )}
              <button
                type="button"
                className="button-outline item-delete"
                onClick={() => setJobPendingDelete(job)}
              >
                Delete
              </button>
            </JobCard>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="button-outline"
        onClick={() => navigate('/main')}
      >
        Back to home
      </button>

      <ConfirmDialog
        open={!!jobPendingDelete}
        title="Delete job?"
        message={`Delete "${jobPendingDelete?.job_title}" at "${jobPendingDelete?.employer}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setJobPendingDelete(null)}
      />

      <FilterJobsDialog
        open={filterDialogOpen}
        onClose={() => setFilterDialogOpen(false)}
        filters={filters}
        onApply={setFilters}
        options={filterOptions}
      />

      <SortJobsDialog
        open={sortDialogOpen}
        onClose={() => setSortDialogOpen(false)}
        onAdd={handleAddSortLevel}
        usedFields={sortLevels.map((l) => l.field)}
        levelNumber={sortLevels.length + 1}
      />
    </div>
  );
}

export default ManageJobs;
