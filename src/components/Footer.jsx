import { Link } from 'react-router-dom';

function Footer({ showLegalLinks = false }) {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <p className="app-footer-contact">
        Need help?{' '}
        <a href="mailto:support@jobsearch365.com">support@jobsearch365.com</a>
      </p>
      <p className="app-footer-copyright">&copy; {year} · 365 Applications</p>
      {showLegalLinks && (
        <p className="app-footer-legal">
          <Link to="/privacy-policy">Privacy Policy</Link>
          {' · '}
          <Link to="/terms-of-service">Terms of Service</Link>
        </p>
      )}
    </footer>
  );
}

export default Footer;
