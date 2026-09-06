import { Link } from 'react-router-dom';

// Four columns by design, even though only "Legal" is populated today —
// Product and Support are placeholders for when there's real content to
// put in them, not dead weight to remove.
function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-columns">
        <div className="site-footer-column site-footer-brand">
          <div className="site-footer-brand-name">
            <img src="/favicon.svg" alt="" className="brand-icon" />
            Job Search 365
          </div>
          <p>Track every application, interview and offer in one place.</p>
        </div>

        <div className="site-footer-column">
          <h3>Legal</h3>
          <ul>
            <li>
              <Link to="/privacy-policy">Privacy Policy</Link>
            </li>
            <li>
              <Link to="/terms-of-service">Terms of Service</Link>
            </li>
          </ul>
        </div>

        <div className="site-footer-column">
          <h3>Product</h3>
        </div>

        <div className="site-footer-column">
          <h3>Support</h3>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
