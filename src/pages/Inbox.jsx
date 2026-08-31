import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getAvailableEventNames } from '../jobFormat';
import { addJobEvent } from '../jobEvents';
import AddEventDialog from '../components/AddEventDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingBar from '../components/LoadingBar';

const GMAIL_OAUTH_STATE_KEY = 'gmail_oauth_state';

function buildRedirectUri() {
  return `${window.location.origin}/inbox/callback`;
}

function Inbox() {
  const navigate = useNavigate();

  const [connection, setConnection] = useState(undefined);
  const [openJobs, setOpenJobs] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedJobByMatch, setSelectedJobByMatch] = useState({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [disconnectPending, setDisconnectPending] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError(null);

    const [connectionResult, jobsResult, matchesResult] = await Promise.all([
      supabase
        .from('email_connections')
        .select('id, email_address')
        .eq('provider', 'gmail')
        .maybeSingle(),
      supabase
        .from('jobs')
        .select('id, job_title, employer, status')
        .eq('is_closed', false),
      supabase
        .from('email_matches')
        .select(
          'id, job_id, email_from, email_subject, email_received_at, email_snippet, suggested_event_name, suggested_event_date, suggested_event_time, created_at',
        )
        .order('created_at', { ascending: false }),
    ]);

    if (connectionResult.error) setError(connectionResult.error.message);
    else setConnection(connectionResult.data);

    if (jobsResult.error) setError(jobsResult.error.message);
    else setOpenJobs(jobsResult.data ?? []);

    if (matchesResult.error) {
      setError(matchesResult.error.message);
    } else {
      setMatches(matchesResult.data ?? []);
      setSelectedJobByMatch(
        Object.fromEntries(
          (matchesResult.data ?? []).map((m) => [m.id, m.job_id ?? '']),
        ),
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function handleConnectGmail() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Gmail sign-in isn’t configured yet.');
      return;
    }

    const state = crypto.randomUUID();
    sessionStorage.setItem(GMAIL_OAUTH_STATE_KEY, state);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: buildRedirectUri(),
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async function handleConfirmDisconnect() {
    setError(null);
    const { error: deleteError } = await supabase
      .from('email_connections')
      .delete()
      .eq('provider', 'gmail');

    setDisconnectPending(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setConnection(null);
    setMatches([]);
  }

  async function handleScanNow() {
    setScanning(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError('Not signed in.');
      setScanning(false);
      return;
    }

    const { error: fnError } = await supabase.functions.invoke(
      'scan-gmail-inbox',
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );

    setScanning(false);

    if (fnError) {
      setError(fnError.message);
      return;
    }

    await loadAll();
  }

  async function handleDismiss(match) {
    setError(null);
    // Deleted outright rather than marked dismissed — no reason to keep
    // holding the email content once it's been reviewed. A future scan
    // won't re-surface it: the sync cursor only looks at mail newer than
    // the last scan, so an already-seen message won't be re-fetched.
    const { error: deleteError } = await supabase
      .from('email_matches')
      .delete()
      .eq('id', match.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMatches((ms) => ms.filter((m) => m.id !== match.id));
  }

  function jobFor(jobId) {
    return openJobs.find((j) => j.id === jobId) ?? null;
  }

  async function handleEventSubmit(eventInput) {
    const jobId = confirmTarget?.jobId;
    if (!jobId) return { error: 'Select a job first.' };

    const result = await addJobEvent(jobId, eventInput);
    if (result.error) return { error: result.error };

    // Deleted rather than marked confirmed — the event's now saved on the
    // job itself, so there's no reason to keep the email content around.
    const { error: deleteError } = await supabase
      .from('email_matches')
      .delete()
      .eq('id', confirmTarget.match.id);

    if (deleteError) return { error: deleteError.message };

    setOpenJobs((jobs) =>
      jobs.map((j) => (j.id === jobId ? { ...j, ...result.jobUpdates } : j)),
    );
    setMatches((ms) => ms.filter((m) => m.id !== confirmTarget.match.id));
    setConfirmTarget(null);
    return {};
  }

  const confirmJob = confirmTarget ? jobFor(confirmTarget.jobId) : null;
  const confirmJobEventOptions = confirmJob
    ? getAvailableEventNames(confirmJob.status)
    : [];
  // Only pre-select the suggested event if it's actually a valid next step
  // for the job's current status — e.g. the status may have moved on since
  // the email was matched — otherwise leave it for the user to pick.
  const confirmInitialEventName =
    confirmTarget &&
    confirmJobEventOptions.includes(confirmTarget.match.suggested_event_name)
      ? confirmTarget.match.suggested_event_name
      : undefined;

  return (
    <div className="list-page">
      <div className="list-header">
        <h1>Inbox</h1>
        {connection && (
          <button
            type="button"
            onClick={handleScanNow}
            disabled={scanning}
          >
            {scanning ? 'Scanning…' : 'Scan now'}
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}
      {scanning && <LoadingBar />}
      {!scanning && matches.length > 0 && (
        <p className="field-hint">
          Found {matches.length} possible update{matches.length === 1 ? '' : 's'}.
        </p>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : !connection ? (
        <>
          <p className="field-hint">
            Connect your Gmail account (read-only access) to scan for
            application updates — interview invites, rejections, offers —
            and review suggested matches here before anything is added to a
            job.
          </p>
          <button type="button" onClick={handleConnectGmail}>
            Connect Gmail
          </button>
        </>
      ) : (
        <>
          <p className="field-hint">
            Connected as {connection.email_address ?? 'your Gmail account'}.{' '}
            <button
              type="button"
              className="inline-link-button"
              onClick={() => setDisconnectPending(true)}
            >
              Disconnect
            </button>
          </p>

          {matches.length === 0 ? (
            <p className="empty-list-hint">
              No pending matches. Click "Scan now" to check for updates.
            </p>
          ) : (
            <ul className="email-match-list">
              {matches.map((match) => (
                <li key={match.id} className="email-match-card">
                  <div className="email-match-header">
                    <span className="email-match-subject">
                      {match.email_subject || '(no subject)'}
                    </span>
                    <span className="item-meta">
                      {match.email_received_at
                        ? new Date(match.email_received_at).toLocaleDateString()
                        : ''}
                    </span>
                  </div>
                  <div className="item-subtext">{match.email_from}</div>
                  {match.email_snippet && (
                    <p className="email-match-snippet">{match.email_snippet}</p>
                  )}

                  <div className="email-match-suggestion">
                    <label htmlFor={`job-${match.id}`}>Job</label>
                    <select
                      id={`job-${match.id}`}
                      className="profile-select"
                      value={selectedJobByMatch[match.id] ?? ''}
                      onChange={(e) =>
                        setSelectedJobByMatch((sel) => ({
                          ...sel,
                          [match.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">No match — pick a job</option>
                      {openJobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.job_title} — {job.employer}
                        </option>
                      ))}
                    </select>
                    {match.suggested_event_name ? (
                      <span className="item-badge">
                        {match.suggested_event_name}
                      </span>
                    ) : (
                      <span className="item-subtext">
                        Unable to determine content
                      </span>
                    )}
                  </div>

                  <div className="item-actions">
                    <button
                      type="button"
                      className="button-outline item-delete"
                      onClick={() => handleDismiss(match)}
                    >
                      Dismiss
                    </button>
                    {match.suggested_event_name && (
                      <button
                        type="button"
                        className="button-positive"
                        disabled={!selectedJobByMatch[match.id]}
                        onClick={() =>
                          setConfirmTarget({
                            match,
                            jobId: selectedJobByMatch[match.id],
                          })
                        }
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <button
        type="button"
        className="button-outline"
        onClick={() => navigate('/main')}
      >
        Back to home
      </button>

      <ConfirmDialog
        open={disconnectPending}
        title="Disconnect Gmail?"
        message="Job Search 365 will no longer be able to scan your inbox for application updates."
        confirmLabel="Disconnect"
        onConfirm={handleConfirmDisconnect}
        onCancel={() => setDisconnectPending(false)}
      />

      {confirmTarget && confirmJob && (
        <AddEventDialog
          open={!!confirmTarget}
          onClose={() => setConfirmTarget(null)}
          onSubmit={handleEventSubmit}
          eventNameOptions={confirmJobEventOptions}
          initialValues={{
            eventName: confirmInitialEventName,
            eventDate: confirmTarget.match.suggested_event_date,
            eventTime: confirmTarget.match.suggested_event_time,
          }}
        />
      )}
    </div>
  );
}

export default Inbox;
