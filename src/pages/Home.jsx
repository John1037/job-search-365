import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import JobListItem from '../components/JobListItem';
import AddJobDialog from '../components/AddJobDialog';
import {
  JOB_LIST_COLUMNS,
  UPCOMING_EVENT_NAMES,
  formatEventDateTime,
} from '../jobFormat';

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Date-only arithmetic, done in local time throughout, to avoid the
// UTC-parse/local-read mismatch that `new Date(dateString)` introduces.
function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function Home() {
  const { shortName, alertWindowDays, country } = useOutletContext();
  const isUS = country === 'US';
  const displayName = shortName || 'User';
  const windowDays = alertWindowDays ?? 30;

  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [alertsError, setAlertsError] = useState(null);

  const [applications, setApplications] = useState([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [applicationsError, setApplicationsError] = useState(null);

  const [interested, setInterested] = useState([]);
  const [loadingInterested, setLoadingInterested] = useState(true);
  const [interestedError, setInterestedError] = useState(null);
  const [addJobOpen, setAddJobOpen] = useState(false);

  useEffect(() => {
    async function loadAlerts() {
      setLoadingAlerts(true);
      setAlertsError(null);

      const today = new Date();
      const todayStr = formatLocalDate(today);
      const future = new Date(today);
      future.setDate(future.getDate() + windowDays);
      const futureStr = formatLocalDate(future);

      const [eventsResult, acknowledgedResult] = await Promise.all([
        supabase
          .from('events')
          .select(
            'id, event_name, event_type, event_date, event_time, job_id, jobs(job_title, employer)',
          )
          .in('event_name', UPCOMING_EVENT_NAMES)
          .gte('event_date', todayStr)
          .lte('event_date', futureStr),
        supabase
          .from('jobs')
          .select('id, job_title, employer, expected_response_date')
          .eq('is_closed', false)
          .eq('status', 'Application acknowledged')
          .not('expected_response_date', 'is', null),
      ]);

      if (eventsResult.error) {
        setAlertsError(eventsResult.error.message);
        setLoadingAlerts(false);
        return;
      }

      if (acknowledgedResult.error) {
        setAlertsError(acknowledgedResult.error.message);
        setLoadingAlerts(false);
        return;
      }

      const eventAlerts = eventsResult.data.map((event) => ({
        id: `event-${event.id}`,
        jobId: event.job_id,
        date: event.event_date,
        time: event.event_time,
        primary:
          event.event_name +
          (event.event_type ? ` — ${event.event_type}` : ''),
        subtitle: event.jobs
          ? `${event.jobs.job_title} — ${event.jobs.employer}`
          : null,
      }));

      // A job sitting at "Application acknowledged" gets auto-closed as
      // unsuccessful 7 days past the employer's expected response date if
      // nothing further has been logged by then — flag it here in advance.
      const closingAlerts = acknowledgedResult.data
        .filter((job) => job.expected_response_date <= todayStr)
        .map((job) => ({
          id: `close-${job.id}`,
          jobId: job.id,
          date: addDays(job.expected_response_date, 7),
          time: null,
          primary: 'Assumed unsuccessful',
          subtitle: `${job.job_title} — ${job.employer}`,
          closable: true,
        }))
        .filter((alert) => alert.date <= futureStr);

      const combined = [...eventAlerts, ...closingAlerts].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time ?? '').localeCompare(b.time ?? '');
      });

      setAlerts(combined);
      setLoadingAlerts(false);
    }

    loadAlerts();
  }, [windowDays]);

  useEffect(() => {
    async function loadApplications() {
      setLoadingApplications(true);
      setApplicationsError(null);

      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_LIST_COLUMNS)
        .eq('is_closed', false)
        .neq('status', 'Interested')
        .order('date_logged', { ascending: false });

      if (error) {
        setApplicationsError(error.message);
      } else {
        setApplications(data);
      }

      setLoadingApplications(false);
    }

    loadApplications();
  }, []);

  useEffect(() => {
    async function loadInterested() {
      setLoadingInterested(true);
      setInterestedError(null);

      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_LIST_COLUMNS)
        .eq('is_closed', false)
        .eq('status', 'Interested')
        .order('date_logged', { ascending: false });

      if (error) {
        setInterestedError(error.message);
      } else {
        setInterested(data);
      }

      setLoadingInterested(false);
    }

    loadInterested();
  }, []);

  async function handleCloseJob(jobId) {
    setAlertsError(null);

    const { error } = await supabase
      .from('jobs')
      .update({ is_closed: true, updated_at: new Date().toISOString() })
      .eq('id', jobId);

    if (error) {
      setAlertsError(error.message);
      return;
    }

    setAlerts((current) => current.filter((alert) => alert.jobId !== jobId));
    setApplications((current) => current.filter((job) => job.id !== jobId));
  }

  return (
    <div className="home-page">
      <h1 className="home-greeting">
        Hi <span className="home-greeting-name">{displayName}</span>, here's
        what's going on
      </h1>

      <section className="home-section home-section-alerts">
        <h2>Alerts</h2>

        {alertsError && <p className="form-error">{alertsError}</p>}

        {loadingAlerts ? (
          <p>Loading…</p>
        ) : alerts.length === 0 ? (
          <p className="field-hint">
            Nothing happening in next {windowDays} days
          </p>
        ) : (
          <ul className="item-list alerts-list">
            {alerts.map((alert) => (
              <li key={alert.id} className="item-row">
                <span className="item-name">
                  <Link
                    to={`/jobs/${alert.jobId}`}
                    className="item-name-primary item-name-link"
                  >
                    {alert.primary}
                  </Link>
                  {alert.subtitle && (
                    <span className="item-subtext">{alert.subtitle}</span>
                  )}
                </span>
                <span className="item-meta alert-datetime">
                  {formatEventDateTime(alert.date, alert.time, isUS)}
                </span>
                {alert.closable && (
                  <div className="item-actions">
                    <button
                      type="button"
                      className="button-outline"
                      onClick={() => handleCloseJob(alert.jobId)}
                    >
                      Close job
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="home-section home-section-applications">
        <h2>Current applications</h2>

        {applicationsError && <p className="form-error">{applicationsError}</p>}

        {loadingApplications ? (
          <p>Loading…</p>
        ) : applications.length === 0 ? (
          <p className="field-hint">
            No current applications.{' '}
            <button
              type="button"
              className="inline-link-button"
              onClick={() => setAddJobOpen(true)}
            >
              Add a job
            </button>{' '}
            to get started.
          </p>
        ) : (
          <ul className="item-list">
            {applications.map((job) => (
              <JobListItem key={job.id} job={job} />
            ))}
          </ul>
        )}
      </section>

      <section className="home-section home-section-interested">
        <h2>Current interested jobs</h2>

        {interestedError && <p className="form-error">{interestedError}</p>}

        {loadingInterested ? (
          <p>Loading…</p>
        ) : interested.length === 0 ? (
          <p className="field-hint">
            No interested jobs yet.{' '}
            <button
              type="button"
              className="inline-link-button"
              onClick={() => setAddJobOpen(true)}
            >
              Add a job
            </button>{' '}
            to get started.
          </p>
        ) : (
          <ul className="item-list">
            {interested.map((job) => (
              <JobListItem key={job.id} job={job} />
            ))}
          </ul>
        )}
      </section>

      <section className="home-section home-section-potential">
        <h2>Potential jobs</h2>
        <p className="field-hint">Coming soon.</p>
      </section>

      <AddJobDialog open={addJobOpen} onClose={() => setAddJobOpen(false)} />
    </div>
  );
}

export default Home;
