import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import ConfirmDialog from '../components/ConfirmDialog';
import JobListItem from '../components/JobListItem';
import { JOB_LIST_COLUMNS } from '../jobFormat';

function ManageJobs({ closed = false }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobPendingDelete, setJobPendingDelete] = useState(null);

  useEffect(() => {
    async function loadJobs() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_LIST_COLUMNS)
        .eq('user_id', user.id)
        .eq('is_closed', closed)
        .order('date_logged', { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setJobs(data);
      }

      setLoading(false);
    }

    loadJobs();
  }, [closed]);

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
        {!closed && (
          <button type="button" onClick={() => navigate('/jobs/new')}>
            Add a job
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="field-hint">
          {closed ? 'No closed jobs.' : 'No jobs added yet.'}
        </p>
      ) : (
        <ul className="item-list">
          {jobs.map((job) => (
            <JobListItem key={job.id} job={job}>
              {closed ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => handleReopenJob(job)}
                >
                  Reopen
                </button>
              ) : (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => handleCloseJob(job)}
                >
                  Close job
                </button>
              )}
              <button
                type="button"
                className="link-button item-delete"
                onClick={() => setJobPendingDelete(job)}
              >
                Delete
              </button>
            </JobListItem>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="link-button"
        onClick={() => navigate('/')}
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
    </div>
  );
}

export default ManageJobs;
