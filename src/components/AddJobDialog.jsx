import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import LoadingBar from './LoadingBar';
import { supabase } from '../supabaseClient';

const SALARY_TYPES = ['annual', 'monthly', 'weekly', 'hourly'];
const EMPLOYMENT_TYPES = ['full_time', 'part_time'];
const LOCATION_TYPES = ['on_site', 'hybrid', 'remote'];

function AddJobDialog({ open, onClose }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('choice');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleClose() {
    setStep('choice');
    setUrl('');
    setError(null);
    onClose();
  }

  function handleManual() {
    handleClose();
    navigate('/jobs/new');
  }

  async function handleImport(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError('Not signed in.');
      setLoading(false);
      return;
    }

    const { data, error: fnError } = await supabase.functions.invoke(
      'import-job-listing',
      {
        body: { url },
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );

    if (fnError) {
      setError(fnError.message);
      setLoading(false);
      return;
    }

    const extracted = data.job;
    const locationType = LOCATION_TYPES.includes(extracted.location_type)
      ? extracted.location_type
      : null;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: inserted, error: insertError } = await supabase
      .from('jobs')
      .insert({
        user_id: user.id,
        job_title: extracted.job_title || 'Untitled position',
        employer: extracted.employer || 'Unknown employer',
        salary_min: extracted.salary_min ?? null,
        salary_max: extracted.salary_max ?? null,
        salary_currency: /^[A-Za-z]{3}$/.test(extracted.salary_currency ?? '')
          ? extracted.salary_currency.toUpperCase()
          : 'GBP',
        salary_type: SALARY_TYPES.includes(extracted.salary_type)
          ? extracted.salary_type
          : null,
        salary_basis: null,
        employment_type: EMPLOYMENT_TYPES.includes(extracted.employment_type)
          ? extracted.employment_type
          : null,
        hours_per_week: null,
        location_type: locationType,
        location:
          locationType === 'remote' ? null : extracted.location || null,
        description: extracted.description || null,
        posting_url: url,
        status: 'Interested',
      })
      .select('id')
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    handleClose();
    navigate(`/jobs/${inserted.id}`);
  }

  return (
    <Modal open={open} onClose={handleClose}>
      {step === 'choice' ? (
        <div
          className="confirm-dialog profile-form event-dialog"
          role="dialog"
          aria-modal="true"
        >
          <h2>Add a job</h2>
          <p className="field-hint">How would you like to add this job?</p>

          <div className="confirm-dialog-actions">
            <button
              type="button"
              className="button-outline"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-outline"
              onClick={handleManual}
            >
              Add manually
            </button>
            <button
              type="button"
              className="button-positive"
              onClick={() => setStep('url')}
            >
              Import from a URL
            </button>
          </div>
        </div>
      ) : (
        <form
          className="confirm-dialog profile-form event-dialog"
          onSubmit={handleImport}
        >
          <h2>Import from a URL</h2>

          <label htmlFor="listingUrl">Job posting URL</label>
          <input
            id="listingUrl"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />

          {error && <p className="form-error">{error}</p>}

          {loading && <LoadingBar />}

          <div className="confirm-dialog-actions">
            <button
              type="button"
              className="button-outline"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-outline"
              onClick={() => setStep('choice')}
            >
              Back
            </button>
            <button
              type="submit"
              className="button-positive"
              disabled={loading}
            >
              {loading ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default AddJobDialog;
