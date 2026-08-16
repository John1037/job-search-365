import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

function IconList() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <polyline points="4,6 5,7 7,5" />
      <polyline points="4,12 5,13 7,11" />
      <polyline points="4,18 5,19 7,17" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

const FEATURES = [
  {
    title: 'Track every application',
    description:
      "Follow each job from interested through offer, with status and history all in one place.",
    Icon: IconList,
  },
  {
    title: 'Never miss an interview',
    description:
      'Automatic alerts surface upcoming interviews so nothing slips through the cracks.',
    Icon: IconBell,
  },
  {
    title: 'Organize your documents',
    description:
      'Keep CVs, cover letters and certificates on hand, and connect the right one to each job.',
    Icon: IconFolder,
  },
  {
    title: 'See it all at a glance',
    description: 'A dashboard summarizing what needs your attention right now.',
    Icon: IconGrid,
  },
];

function Landing() {
  return (
    <>
      <header className="control-bar">
        <div className="control-bar-brand">
          <img src="/favicon.svg" alt="" className="brand-icon" />
          <span className="brand-text">Job Search 365</span>
        </div>

        <div className="landing-header-actions">
          <Link
            to="/login"
            className="landing-button-secondary landing-header-button"
          >
            Log in
          </Link>
          <Link
            to="/login?mode=signup"
            className="landing-button-primary landing-header-button"
          >
            Sign up
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-inner">
          <h1 className="landing-title">Job Search 365</h1>
          <p className="landing-tagline">
            Track every application, interview and offer in one place.
          </p>
          <div className="landing-actions">
            <Link to="/login?mode=signup" className="landing-button-primary">
              Get started
            </Link>
            <Link to="/login" className="landing-button-secondary">
              Log in
            </Link>
          </div>
        </div>
      </section>

      <main className="landing-main">
        <section className="landing-features">
          {FEATURES.map(({ title, description, Icon }) => (
            <div className="landing-feature-card" key={title}>
              <div className="landing-feature-icon">
                <Icon />
              </div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
          ))}
        </section>
      </main>

      <Footer />
    </>
  );
}

export default Landing;
