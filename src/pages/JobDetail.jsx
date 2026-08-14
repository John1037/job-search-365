import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import AddEventDialog from '../components/AddEventDialog';
import ConnectCvDialog from '../components/ConnectCvDialog';
import { formatSalary, formatLocation } from '../jobFormat';

function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { country } = useOutletContext();
  const cvWord = country === 'US' ? 'resume' : 'CV';

  const [job, setJob] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [description, setDescription] = useState('');
  const [postingUrl, setPostingUrl] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [applicationMethod, setApplicationMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const [addEventOpen, setAddEventOpen] = useState(false);

  const [connectedCv, setConnectedCv] = useState(null);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [cvError, setCvError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (jobError) {
        setError(jobError.message);
        setLoading(false);
        return;
      }

      if (!jobData) {
        setError('Job not found.');
        setLoading(false);
        return;
      }

      setJob(jobData);
      setDescription(jobData.description ?? '');
      setPostingUrl(jobData.posting_url ?? '');
      setContactPerson(jobData.contact_person ?? '');
      setApplicationMethod(jobData.application_method ?? '');
      setNotes(jobData.notes ?? '');

      if (jobData.cv_document_id) {
        const { data: cvData } = await supabase
          .from('documents')
          .select('id, file_name, storage_path')
          .eq('id', jobData.cv_document_id)
          .maybeSingle();

        setConnectedCv(cvData ?? null);
      }

      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, event_name, event_type, event_date, event_time, location')
        .eq('job_id', id)
        .order('event_date', { ascending: false })
        .order('event_time', { ascending: false });

      if (eventsError) {
        setError(eventsError.message);
      } else {
        setEvents(eventsData);
      }

      setLoading(false);
    }

    load();
  }, [id]);

  async function handleSaveDetails(e) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        description: description || null,
        posting_url: postingUrl || null,
        contact_person: contactPerson || null,
        application_method: applicationMethod || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSaveMessage('Details saved.');
  }

  async function handleAddEvent(eventInput) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: 'Not signed in.' };

    const { data, error: insertError } = await supabase
      .from('events')
      .insert({
        job_id: id,
        user_id: user.id,
        ...eventInput,
      })
      .select('id, event_name, event_type, event_date, event_time, location')
      .single();

    if (insertError) return { error: insertError.message };

    setEvents((evts) =>
      [...evts, data].sort((a, b) => {
        if (a.event_date !== b.event_date) {
          return b.event_date.localeCompare(a.event_date);
        }
        return (b.event_time ?? '').localeCompare(a.event_time ?? '');
      }),
    );

    setAddEventOpen(false);
    return {};
  }

  async function handleSelectCv(doc) {
    setCvError(null);

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ cv_document_id: doc.id, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      setCvError(updateError.message);
      return;
    }

    setConnectedCv(doc);
    setConnectDialogOpen(false);
  }

  async function handleDisconnectCv() {
    setCvError(null);

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ cv_document_id: null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      setCvError(updateError.message);
      return;
    }

    setConnectedCv(null);
  }

  async function handleViewCv() {
    if (!connectedCv) return;
    setCvError(null);

    const { data, error: signError } = await supabase.storage
      .from('documents')
      .createSignedUrl(connectedCv.storage_path, 60);

    if (signError) {
      setCvError(signError.message);
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  if (loading) {
    return <div className="page-content">Loading…</div>;
  }

  if (!job) {
    return (
      <div className="page-content">
        {error && <p className="form-error">{error}</p>}
        <button
          type="button"
          className="link-button"
          onClick={() => navigate('/jobs')}
        >
          Back to jobs
        </button>
      </div>
    );
  }

  const salary = formatSalary(job);
  const location = formatLocation(job);

  return (
    <div className="job-detail-page">
      <div className="list-header">
        <h1>
          {job.job_title} — {job.employer}
        </h1>
        <span className="item-badge">{job.status}</span>
      </div>

      <div className="job-detail-layout">
        <div className="job-detail-main">
          <dl className="job-detail-summary">
            <div>
              <dt>Date logged</dt>
              <dd>{job.date_logged}</dd>
            </div>
            {job.application_closing_date && (
              <div>
                <dt>Application closes</dt>
                <dd>{job.application_closing_date}</dd>
              </div>
            )}
            {salary && (
              <div>
                <dt>Salary</dt>
                <dd>{salary}</dd>
              </div>
            )}
            {job.hours_per_week != null && (
              <div>
                <dt>Hours per week</dt>
                <dd>{job.hours_per_week}</dd>
              </div>
            )}
            {location && (
              <div>
                <dt>Location</dt>
                <dd>{location}</dd>
              </div>
            )}
          </dl>

          <form
            className="profile-form job-detail-form"
            onSubmit={handleSaveDetails}
          >
            <label htmlFor="description">Job description</label>
            <textarea
              id="description"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <label htmlFor="postingUrl">Job posting URL</label>
            <input
              id="postingUrl"
              type="url"
              value={postingUrl}
              onChange={(e) => setPostingUrl(e.target.value)}
            />

            <label htmlFor="contactPerson">Contact person</label>
            <input
              id="contactPerson"
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />

            <label htmlFor="applicationMethod">Application method</label>
            <input
              id="applicationMethod"
              type="text"
              value={applicationMethod}
              onChange={(e) => setApplicationMethod(e.target.value)}
            />

            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            {error && <p className="form-error">{error}</p>}
            {saveMessage && <p className="form-message">{saveMessage}</p>}

            <div className="profile-form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </form>
        </div>

        <div className="job-detail-actions">
          <button
            type="button"
            className="button-positive"
            onClick={() => setAddEventOpen(true)}
          >
            Add event
          </button>

          {cvError && <p className="form-error">{cvError}</p>}

          {connectedCv ? (
            <>
              <button
                type="button"
                className="button-secondary"
                onClick={handleViewCv}
              >
                View {cvWord}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={handleDisconnectCv}
              >
                Disconnect {cvWord}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled
                title="Coming soon"
              >
                Tweak {cvWord}
              </button>
            </>
          ) : (
            job.status === 'Interested' && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => setConnectDialogOpen(true)}
              >
                Connect a {cvWord}
              </button>
            )
          )}
        </div>
      </div>

      <div className="list-header">
        <h2>Events</h2>
      </div>

      {events.length === 0 ? (
        <p className="field-hint">No events logged yet.</p>
      ) : (
        <ul className="item-list">
          {events.map((event) => (
            <li key={event.id} className="item-row">
              <span className="item-name">
                <span className="item-name-primary">
                  {event.event_name}
                  {event.event_type ? ` — ${event.event_type}` : ''}
                </span>
                {event.location && (
                  <span className="item-subtext">{event.location}</span>
                )}
              </span>
              <span className="item-meta">
                {event.event_date}
                {event.event_time ? ` ${event.event_time}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="link-button"
        onClick={() => navigate('/jobs')}
      >
        Back to jobs
      </button>

      <AddEventDialog
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        onSubmit={handleAddEvent}
      />

      <ConnectCvDialog
        open={connectDialogOpen}
        onClose={() => setConnectDialogOpen(false)}
        onSelect={handleSelectCv}
        cvWord={cvWord}
      />
    </div>
  );
}

export default JobDetail;
