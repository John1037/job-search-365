import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import AddEventDialog from '../components/AddEventDialog';
import ConnectDocumentDialog from '../components/ConnectDocumentDialog';
import ManageDocumentsDialog from '../components/ManageDocumentsDialog';
import GenerateCoverLetterDialog from '../components/GenerateCoverLetterDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  formatEventDateTime,
  formatStatusDate,
  APPLICATION_METHOD_OPTIONS,
  getAvailableEventNames,
} from '../jobFormat';
import { sortedCurrencies } from '../data/currencies';

function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { country } = useOutletContext();
  const cvWord = country === 'US' ? 'resume' : 'CV';

  const [job, setJob] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [jobTitle, setJobTitle] = useState('');
  const [employer, setEmployer] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('GBP');
  const [salaryType, setSalaryType] = useState('annual');
  const [salaryBasis, setSalaryBasis] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [hoursPerWeek, setHoursPerWeek] = useState('');
  const [employmentDuration, setEmploymentDuration] = useState('Permanent');
  const [locationType, setLocationType] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [postingUrl, setPostingUrl] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [applicationMethod, setApplicationMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const [addEventOpen, setAddEventOpen] = useState(false);
  const [eventPendingDelete, setEventPendingDelete] = useState(null);
  const [jobDeletePending, setJobDeletePending] = useState(false);

  const [connectedDocs, setConnectedDocs] = useState({});
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [manageDocsOpen, setManageDocsOpen] = useState(false);
  const [coverLetterDialogOpen, setCoverLetterDialogOpen] = useState(false);
  const [docsError, setDocsError] = useState(null);

  const documentSlots = [
    { key: 'cv_document_id', category: 'cv', label: cvWord },
    { key: 'cover_letter_document_id', category: 'cover_letter', label: 'Cover letter' },
    { key: 'certificate_document_id', category: 'certificate', label: 'Certificate' },
    { key: 'other_document_1_id', category: 'other', label: 'Other document 1' },
    { key: 'other_document_2_id', category: 'other', label: 'Other document 2' },
    { key: 'other_document_3_id', category: 'other', label: 'Other document 3' },
  ];

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
      setJobTitle(jobData.job_title ?? '');
      setEmployer(jobData.employer ?? '');
      setSalaryMin(jobData.salary_min ?? '');
      setSalaryMax(jobData.salary_max ?? '');
      setSalaryCurrency(jobData.salary_currency ?? 'GBP');
      setSalaryType(jobData.salary_type ?? 'annual');
      setSalaryBasis(jobData.salary_basis ?? '');
      setEmploymentType(jobData.employment_type ?? '');
      setHoursPerWeek(jobData.hours_per_week ?? '');
      setEmploymentDuration(jobData.employment_duration ?? 'Permanent');
      setLocationType(jobData.location_type ?? '');
      setLocation(jobData.location ?? '');
      setDescription(jobData.description ?? '');
      setPostingUrl(jobData.posting_url ?? '');
      setContactPerson(jobData.contact_person ?? '');
      setApplicationMethod(jobData.application_method ?? '');
      setNotes(jobData.notes ?? '');

      const slotKeys = [
        'cv_document_id',
        'cover_letter_document_id',
        'certificate_document_id',
        'other_document_1_id',
        'other_document_2_id',
        'other_document_3_id',
      ];
      const docIds = slotKeys.map((key) => jobData[key]).filter(Boolean);

      if (docIds.length > 0) {
        const { data: docsData } = await supabase
          .from('documents')
          .select('id, file_name, storage_path')
          .in('id', docIds);

        const docsById = Object.fromEntries(
          (docsData ?? []).map((doc) => [doc.id, doc]),
        );

        const nextConnectedDocs = {};
        for (const key of slotKeys) {
          if (jobData[key] && docsById[jobData[key]]) {
            nextConnectedDocs[key] = docsById[jobData[key]];
          }
        }
        setConnectedDocs(nextConnectedDocs);
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

    const updates = {
      job_title: jobTitle,
      employer,
      salary_min: salaryMin === '' ? null : Number(salaryMin),
      salary_max: salaryMax === '' ? null : Number(salaryMax),
      salary_currency: salaryCurrency,
      salary_type: salaryType,
      salary_basis: salaryBasis === '' ? null : salaryBasis,
      employment_type: employmentType === '' ? null : employmentType,
      hours_per_week:
        employmentType === 'part_time' && hoursPerWeek !== ''
          ? Number(hoursPerWeek)
          : null,
      employment_duration:
        employmentType === '' ? null : employmentDuration || null,
      location_type: locationType === '' ? null : locationType,
      location: locationType === 'remote' ? null : location || null,
      description: description || null,
      posting_url: postingUrl || null,
      contact_person: contactPerson || null,
      application_method: applicationMethod || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setJob((j) => ({ ...j, ...updates }));
    setSaveMessage('Details saved.');
  }

  async function handleAddEvent(eventInput) {
    const {
      expected_response_date,
      application_method: newApplicationMethod,
      ...eventFields
    } = eventInput;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: 'Not signed in.' };

    const { data, error: insertError } = await supabase
      .from('events')
      .insert({
        job_id: id,
        user_id: user.id,
        ...eventFields,
      })
      .select('id, event_name, event_type, event_date, event_time, location')
      .single();

    if (insertError) return { error: insertError.message };

    const now = new Date().toISOString();

    const jobUpdates = {
      status: eventInput.event_name,
      status_updated_at: now,
      updated_at: now,
    };

    if (eventInput.event_name === 'Application acknowledged') {
      jobUpdates.expected_response_date = expected_response_date || null;
    }

    if (eventInput.event_name === 'Applied') {
      jobUpdates.application_method = newApplicationMethod || null;
    }

    if (eventInput.event_name === 'Unsuccessful') {
      jobUpdates.is_closed = true;
    }

    const { error: statusError } = await supabase
      .from('jobs')
      .update(jobUpdates)
      .eq('id', id);

    if (statusError) return { error: statusError.message };

    setJob((j) => ({ ...j, ...jobUpdates }));

    if (eventInput.event_name === 'Applied') {
      setApplicationMethod(newApplicationMethod || '');
    }

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

  async function handleConfirmDeleteEvent() {
    const eventToDelete = eventPendingDelete;
    if (!eventToDelete) return;

    setError(null);

    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('id', eventToDelete.id);

    if (deleteError) {
      setError(deleteError.message);
      setEventPendingDelete(null);
      return;
    }

    // events is sorted most-recent-first, so whatever remains at the front
    // (if anything) is the new "current" event driving the job's status.
    const remainingEvents = events.filter((e) => e.id !== eventToDelete.id);
    const latestEvent = remainingEvents[0];
    const newStatus = latestEvent ? latestEvent.event_name : 'Interested';
    const now = new Date().toISOString();

    const jobUpdates = {
      status: newStatus,
      status_updated_at: now,
      updated_at: now,
    };

    if (newStatus !== 'Application acknowledged') {
      jobUpdates.expected_response_date = null;
    }

    if (eventToDelete.event_name === 'Unsuccessful') {
      jobUpdates.is_closed = false;
    }

    const { error: statusError } = await supabase
      .from('jobs')
      .update(jobUpdates)
      .eq('id', id);

    if (statusError) {
      setError(statusError.message);
      setEventPendingDelete(null);
      return;
    }

    setJob((j) => ({ ...j, ...jobUpdates }));
    setEvents(remainingEvents);
    setEventPendingDelete(null);
  }

  async function handleConnectDocument(doc, category) {
    setDocsError(null);

    let slotKey;
    if (category === 'other') {
      const otherKeys = [
        'other_document_1_id',
        'other_document_2_id',
        'other_document_3_id',
      ];
      slotKey = otherKeys.find((key) => !connectedDocs[key]);
      if (!slotKey) {
        setDocsError(
          'All 3 "Other document" slots are full. Disconnect one first.',
        );
        return;
      }
    } else {
      slotKey = documentSlots.find((slot) => slot.category === category)?.key;
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ [slotKey]: doc.id, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      setDocsError(updateError.message);
      return;
    }

    setConnectedDocs((docs) => ({ ...docs, [slotKey]: doc }));
    setConnectDialogOpen(false);
  }

  async function handleDisconnectDocument(slotKey) {
    setDocsError(null);

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ [slotKey]: null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      setDocsError(updateError.message);
      return;
    }

    setConnectedDocs((docs) => {
      const next = { ...docs };
      delete next[slotKey];
      return next;
    });
  }

  async function handleViewDocument(doc) {
    setDocsError(null);

    const { data, error: signError } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 60);

    if (signError) {
      setDocsError(signError.message);
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleSetFavorite(level) {
    setError(null);

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ favorite_level: level, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setJob((j) => ({ ...j, favorite_level: level }));
  }

  async function handleCloseJob() {
    setError(null);
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ is_closed: true, updated_at: now })
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setJob((j) => ({ ...j, is_closed: true, updated_at: now }));
  }

  async function handleReopenJob() {
    setError(null);
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ is_closed: false, updated_at: now })
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setJob((j) => ({ ...j, is_closed: false, updated_at: now }));
  }

  async function handleConfirmDeleteJob() {
    setError(null);

    const { error: deleteError } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id);

    if (deleteError) {
      setError(deleteError.message);
      setJobDeletePending(false);
      return;
    }

    navigate('/jobs');
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
          className="button-outline"
          onClick={() => navigate('/jobs')}
        >
          Back to jobs
        </button>
      </div>
    );
  }

  const eventNameOptions = getAvailableEventNames(job.status);

  const connectedCv = connectedDocs.cv_document_id;
  const canGenerateCoverLetter =
    !!description && !!connectedCv?.file_name?.toLowerCase().endsWith('.pdf');
  const coverLetterHint = !description
    ? 'Add a job description to enable this.'
    : !connectedCv
      ? 'Connect a CV to enable this.'
      : !canGenerateCoverLetter
        ? 'Connect a PDF CV to enable this.'
        : null;

  return (
    <div className="job-detail-page">
      <div className="list-header job-detail-header-grid">
        <div className="job-detail-title-row">
          <h1>
            {job.job_title} — {job.employer}
          </h1>
          <span
            className="job-detail-favorite-stars"
            aria-label={
              job.favorite_level
                ? `Marked ${job.favorite_level === 2 ? 'Favorite' : 'Preferred'}`
                : undefined
            }
          >
            {'★'.repeat(job.favorite_level ?? 0)}
          </span>
        </div>
        <div className="status-with-date">
          <span className="item-badge">{job.status}</span>
          <span className="status-updated-label">
            Status updated {formatStatusDate(job.status_updated_at, country === 'US')}
          </span>
        </div>
      </div>

      <div className="job-detail-layout">
        {job.application_closing_date && (
          <dl className="job-detail-summary">
            <div>
              <dt>Application closes</dt>
              <dd>{job.application_closing_date}</dd>
            </div>
          </dl>
        )}

        <div className="job-detail-main">
          <form
            className="profile-form job-detail-form"
            onSubmit={handleSaveDetails}
          >
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="jobTitle">Job title</label>
                <input
                  id="jobTitle"
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="employer">Employer</label>
                <input
                  id="employer"
                  type="text"
                  value={employer}
                  onChange={(e) => setEmployer(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-row-pair">
                <div className="form-field">
                  <label htmlFor="salaryMin">Salary (min)</label>
                  <div className="salary-field">
                    <input
                      id="salaryMin"
                      type="number"
                      min="0"
                      step="0.01"
                      value={salaryMin}
                      onChange={(e) => setSalaryMin(e.target.value)}
                    />
                    <select
                      aria-label="Currency"
                      value={salaryCurrency}
                      onChange={(e) => setSalaryCurrency(e.target.value)}
                    >
                      {sortedCurrencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="salaryMax">Salary (max)</label>
                  <div className="salary-field">
                    <input
                      id="salaryMax"
                      type="number"
                      min="0"
                      step="0.01"
                      value={salaryMax}
                      onChange={(e) => setSalaryMax(e.target.value)}
                    />
                    <select
                      aria-label="Currency"
                      value={salaryCurrency}
                      onChange={(e) => setSalaryCurrency(e.target.value)}
                    >
                      {sortedCurrencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-row-pair">
                <div className="form-field">
                  <label htmlFor="salaryType">Salary type</label>
                  <select
                    id="salaryType"
                    className="profile-select"
                    value={salaryType}
                    onChange={(e) => setSalaryType(e.target.value)}
                  >
                    <option value="annual">Annual</option>
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="hourly">Hourly</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="salaryBasis">Salary basis</label>
                  <select
                    id="salaryBasis"
                    className="profile-select"
                    value={salaryBasis}
                    onChange={(e) => setSalaryBasis(e.target.value)}
                  >
                    <option value="">Not specified</option>
                    <option value="flat_stated">Flat - stated</option>
                    <option value="flat_estimated">Flat - estimated</option>
                    <option value="ote_stated">OTE - stated</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-row-pair">
                <div className="form-field">
                  <label htmlFor="employmentType">Employment type</label>
                  <select
                    id="employmentType"
                    className="profile-select"
                    value={employmentType}
                    onChange={(e) => {
                      setEmploymentType(e.target.value);
                      if (e.target.value !== 'part_time') setHoursPerWeek('');
                    }}
                  >
                    <option value="">Not specified</option>
                    <option value="full_time">Full time</option>
                    <option value="part_time">Part time</option>
                  </select>
                </div>

                {employmentType === 'part_time' && (
                  <div className="form-field">
                    <label htmlFor="hoursPerWeek">Hours per week</label>
                    <input
                      id="hoursPerWeek"
                      type="number"
                      min="0"
                      step="0.5"
                      value={hoursPerWeek}
                      onChange={(e) => setHoursPerWeek(e.target.value)}
                    />
                  </div>
                )}

                {employmentType !== '' && (
                  <div className="form-field">
                    <label htmlFor="employmentDuration">
                      Employment duration
                    </label>
                    <input
                      id="employmentDuration"
                      type="text"
                      value={employmentDuration}
                      onChange={(e) => setEmploymentDuration(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="form-row-pair">
                <div className="form-field">
                  <label htmlFor="locationType">Location type</label>
                  <select
                    id="locationType"
                    className="profile-select"
                    value={locationType}
                    onChange={(e) => setLocationType(e.target.value)}
                  >
                    <option value="">Not specified</option>
                    <option value="on_site">On-site</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="remote">Remote</option>
                  </select>
                </div>

                {locationType && locationType !== 'remote' && (
                  <div className="form-field">
                    <label htmlFor="location">Location</label>
                    <input
                      id="location"
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <label htmlFor="description">Job description</label>
            <textarea
              id="description"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <label htmlFor="postingUrl">Job posting URL</label>
            <div className="url-field">
              <input
                id="postingUrl"
                type="url"
                value={postingUrl}
                onChange={(e) => setPostingUrl(e.target.value)}
              />
              {postingUrl && (
                <a
                  href={postingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="url-field-open"
                >
                  Open
                </a>
              )}
            </div>

            <label htmlFor="contactPerson">Contact person</label>
            <input
              id="contactPerson"
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />

            <label htmlFor="applicationMethod">Application method</label>
            <select
              id="applicationMethod"
              className="profile-select"
              value={applicationMethod}
              onChange={(e) => setApplicationMethod(e.target.value)}
            >
              <option value="">Not specified</option>
              {APPLICATION_METHOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'Online' ? 'Online (legacy)' : option}
                </option>
              ))}
            </select>

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

              <div className="job-detail-danger-actions">
                {job.is_closed ? (
                  <button
                    type="button"
                    className="button-outline"
                    onClick={handleReopenJob}
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-outline"
                    onClick={handleCloseJob}
                  >
                    Close
                  </button>
                )}
                <button
                  type="button"
                  className="button-outline item-delete"
                  onClick={() => setJobDeletePending(true)}
                >
                  Delete
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="job-detail-actions-column">
          <div className="job-detail-actions">
            <div className="job-detail-date-logged">
              <span className="job-detail-date-logged-label">Date logged</span>
              <span>{job.date_logged}</span>
            </div>

            <button
              type="button"
              className="button-positive"
              onClick={() => setAddEventOpen(true)}
            >
              Add event
            </button>

            {docsError && <p className="form-error">{docsError}</p>}

            {job.status === 'Interested' &&
              documentSlots.some((slot) => !connectedDocs[slot.key]) && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setConnectDialogOpen(true)}
                >
                  Connect document
                </button>
              )}

            {Object.keys(connectedDocs).length > 0 && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => setManageDocsOpen(true)}
              >
                Manage documents
              </button>
            )}

            {job.status === 'Interested' && (
              <>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={!canGenerateCoverLetter}
                  onClick={() => setCoverLetterDialogOpen(true)}
                >
                  Suggest cover letter
                </button>
                {coverLetterHint && (
                  <p className="field-hint">{coverLetterHint}</p>
                )}
              </>
            )}
          </div>

          <div className="job-detail-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={job.favorite_level == null}
              onClick={() => handleSetFavorite(null)}
            >
              Clear Favorite
            </button>
            <button
              type="button"
              className="button-preferred"
              disabled={job.favorite_level === 1}
              onClick={() => handleSetFavorite(1)}
            >
              Mark Preferred
            </button>
            <button
              type="button"
              className="button-positive"
              disabled={job.favorite_level === 2}
              onClick={() => handleSetFavorite(2)}
            >
              Mark Favorite
            </button>
          </div>
        </div>
      </div>

      <div className="list-header">
        <h2>Events</h2>
      </div>

      {events.length === 0 ? (
        <p className="empty-list-hint">No events logged yet.</p>
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
                {formatEventDateTime(event.event_date, event.event_time, country === 'US')}
              </span>
              <div className="item-actions">
                <button
                  type="button"
                  className="button-outline item-delete"
                  onClick={() => setEventPendingDelete(event)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="button-outline"
        onClick={() => navigate('/jobs')}
      >
        Back to jobs
      </button>

      <AddEventDialog
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        onSubmit={handleAddEvent}
        eventNameOptions={eventNameOptions}
        currentApplicationMethod={applicationMethod}
      />

      <ConnectDocumentDialog
        open={connectDialogOpen}
        onClose={() => setConnectDialogOpen(false)}
        onSelect={handleConnectDocument}
        connectedDocs={connectedDocs}
        cvWord={cvWord}
      />

      <ManageDocumentsDialog
        open={manageDocsOpen}
        onClose={() => setManageDocsOpen(false)}
        slots={documentSlots}
        connectedDocs={connectedDocs}
        onView={handleViewDocument}
        onDisconnect={handleDisconnectDocument}
        canDisconnect={job.status === 'Interested'}
      />

      <GenerateCoverLetterDialog
        open={coverLetterDialogOpen}
        onClose={() => setCoverLetterDialogOpen(false)}
        jobId={id}
        employer={employer}
        onSave={(doc) => {
          handleConnectDocument(doc, 'cover_letter');
          setCoverLetterDialogOpen(false);
        }}
      />

      <ConfirmDialog
        open={!!eventPendingDelete}
        title="Delete event?"
        message={`Delete "${eventPendingDelete?.event_name}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteEvent}
        onCancel={() => setEventPendingDelete(null)}
      />

      <ConfirmDialog
        open={jobDeletePending}
        title="Delete job?"
        message={`Delete "${job.job_title}" at "${job.employer}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteJob}
        onCancel={() => setJobDeletePending(false)}
      />
    </div>
  );
}

export default JobDetail;
