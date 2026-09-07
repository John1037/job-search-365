import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getOnboardingStatus } from '../onboarding';

function IconUser() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="3" y1="13" x2="21" y2="13" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="5 13 10 18 19 7" />
    </svg>
  );
}

const SUGGESTIONS = [
  {
    key: 'profileComplete',
    title: 'Complete your profile',
    description:
      'Add your contact details so your CVs and cover letters are ready to go.',
    to: '/profile',
    Icon: IconUser,
  },
  {
    key: 'cvComplete',
    title: 'Add your CV components',
    description:
      'Build a library of skills, experience and education to draw your CVs from.',
    to: '/cv-components',
    Icon: IconDocument,
  },
  {
    key: 'jobComplete',
    title: 'Add a job',
    description: "Start tracking an application — you're one step closer already.",
    to: '/jobs',
    Icon: IconBriefcase,
  },
];

function Welcome() {
  const { shortName } = useOutletContext();
  const [status, setStatus] = useState(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Fetched fresh on every visit (not cached from Layout) — the whole point
  // of this page is to reflect exactly how complete each step currently is,
  // including right after the user finishes one and clicks back.
  useEffect(() => {
    let cancelled = false;

    getOnboardingStatus().then((result) => {
      if (!cancelled) setStatus(result);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Only takes effect the moment the user actually navigates away — checking
  // the box alone commits to nothing, per spec ("if checked BEFORE the user
  // clicks anywhere"). Fired without awaiting: the Link/button's own
  // navigation isn't blocked on it, but the request is already in flight by
  // the time the page unmounts.
  function handleNavigate() {
    if (!dontShowAgain || !status?.userId) return;
    supabase.from('profiles').update({ welcome_dismissed: true }).eq('id', status.userId);
  }

  return (
    <div className="welcome-page">
      <section className="welcome-hero">
        <h1>
          Welcome to JobSearch 365{shortName ? `, ${shortName}` : ''}!
        </h1>
        <p className="welcome-tagline">
          We're glad you're here. A few things to get you set up for a
          smoother job search — take them in any order, or skip ahead to your
          dashboard whenever you're ready.
        </p>
      </section>

      <section className="welcome-suggestions" aria-label="Suggested next steps">
        {SUGGESTIONS.map(({ key, title, description, to, Icon }) => {
          const complete = !!status?.[key];
          return (
            <Link
              className="welcome-suggestion-card"
              to={to}
              key={key}
              onClick={handleNavigate}
            >
              <div className="welcome-suggestion-icon">
                <Icon />
              </div>
              {complete && (
                <div className="welcome-suggestion-check">
                  <IconCheck />
                  <span className="visually-hidden"> — complete</span>
                </div>
              )}
              <h2>{title}</h2>
              <p>{description}</p>
            </Link>
          );
        })}
      </section>

      <p className="welcome-cta">
        <Link className="button-primary" to="/main" onClick={handleNavigate}>
          Head to your dashboard
        </Link>
      </p>

      <label className="welcome-dismiss">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
        />
        Do not show this screen again
      </label>
    </div>
  );
}

export default Welcome;
