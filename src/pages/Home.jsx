import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import JobListItem from '../components/JobListItem';
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

  useEffect(() => {
    async function loadAlerts() {
      setLoadingAlerts(true);
      setAlertsError(null);

      const today = new Date();
      const todayStr = formatLocalDate(today);
      const future = new Date(today);
      future.setDate(future.getDate() + windowDays);
      const futureStr = formatLocalDate(future);

      const { data, error } = await supabase
        .from('events')
        .select(
          'id, event_name, event_type, event_date, event_time, job_id, jobs(job_title, employer)',
        )
        .in('event_name', UPCOMING_EVENT_NAMES)
        .gte('event_date', todayStr)
        .lte('event_date', futureStr)
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true });

      if (error) {
        setAlertsError(error.message);
      } else {
        setAlerts(data);
      }

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

  return (
    <div className="home-page">
      <h1 className="home-greeting">Hi {displayName}, here's what's going on</h1>

      <section className="home-section">
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
            {alerts.map((event) => (
              <li key={event.id} className="item-row">
                <span className="item-name">
                  <Link
                    to={`/jobs/${event.job_id}`}
                    className="item-name-primary item-name-link"
                  >
                    {event.event_name}
                    {event.event_type ? ` — ${event.event_type}` : ''}
                  </Link>
                  {event.jobs && (
                    <span className="item-subtext">
                      {event.jobs.job_title} — {event.jobs.employer}
                    </span>
                  )}
                </span>
                <span className="item-meta alert-datetime">
                  {formatEventDateTime(event.event_date, event.event_time, isUS)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="home-section">
        <h2>Current applications</h2>

        {applicationsError && <p className="form-error">{applicationsError}</p>}

        {loadingApplications ? (
          <p>Loading…</p>
        ) : applications.length === 0 ? (
          <p className="field-hint">No current applications.</p>
        ) : (
          <ul className="item-list">
            {applications.map((job) => (
              <JobListItem key={job.id} job={job} />
            ))}
          </ul>
        )}
      </section>

      <section className="home-section">
        <h2>Current interested jobs</h2>

        {interestedError && <p className="form-error">{interestedError}</p>}

        {loadingInterested ? (
          <p>Loading…</p>
        ) : interested.length === 0 ? (
          <p className="field-hint">No interested jobs yet.</p>
        ) : (
          <ul className="item-list">
            {interested.map((job) => (
              <JobListItem key={job.id} job={job} />
            ))}
          </ul>
        )}
      </section>

      <section className="home-section">
        <h2>Potential jobs</h2>
      </section>
    </div>
  );
}

export default Home;
