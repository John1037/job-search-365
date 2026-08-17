import { useState } from 'react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer';
import SignupDialog from '../components/SignupDialog';

// No logged-in profile to read a country from on this page, so fall back
// to the browser's locale as a best-effort signal for US visitors.
function isLikelyUS() {
  if (typeof navigator === 'undefined') return false;
  const region = (navigator.language || '').split('-')[1];
  return region?.toUpperCase() === 'US';
}

function Signup() {
  const [signupOpen, setSignupOpen] = useState(false);
  const cvWord = isLikelyUS() ? 'resume' : 'CV';

  const tiers = [
    {
      id: 'free',
      name: 'Free account',
      comingSoon: false,
      features: [
        'Manage up to 20 applications',
        'Unlimited events',
        'Upload up to 5 documents',
        'Attach documents to jobs',
        'Get alerts when deadlines are close',
      ],
    },
    {
      id: 'advanced',
      name: 'Advanced account',
      comingSoon: true,
      intro: 'Everything in Free, plus:',
      features: [
        'Unlimited applications',
        'Up to 50 documents stored',
        'AI cover letter writing',
      ],
    },
    {
      id: 'pro',
      name: 'Pro account',
      comingSoon: true,
      intro: 'Everything in Advanced, plus:',
      features: [
        'Custom integrations',
        `AI tweaks to ${cvWord} to match job`,
      ],
    },
  ];

  return (
    <>
      <header className="control-bar">
        <Link to="/" className="control-bar-brand">
          <img src="/favicon.svg" alt="" className="brand-icon" />
          <span className="brand-text">Job Search 365</span>
        </Link>
      </header>

      <main className="signup-page">
        <h1 className="signup-heading">Choose your plan</h1>

        <div className="pricing-cards">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={
                'pricing-card' +
                (tier.comingSoon
                  ? ' pricing-card-disabled'
                  : ' pricing-card-available')
              }
            >
              {tier.comingSoon && (
                <span className="pricing-card-badge">Coming soon</span>
              )}
              <h2>{tier.name}</h2>
              {tier.intro && (
                <p className="pricing-card-intro">{tier.intro}</p>
              )}
              <ul className="pricing-card-features">
                {tier.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {tier.comingSoon ? (
                <button type="button" className="pricing-card-cta" disabled>
                  Coming soon
                </button>
              ) : (
                <button
                  type="button"
                  className="pricing-card-cta pricing-card-cta-primary"
                  onClick={() => setSignupOpen(true)}
                >
                  Sign up free
                </button>
              )}
            </div>
          ))}
        </div>
      </main>

      <Footer />

      <SignupDialog open={signupOpen} onClose={() => setSignupOpen(false)} />
    </>
  );
}

export default Signup;
