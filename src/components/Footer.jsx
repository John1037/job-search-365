function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <p className="app-footer-contact">
        Need help?{' '}
        <a href="mailto:support@jobsearch365.com">support@jobsearch365.com</a>
      </p>
      <p className="app-footer-copyright">&copy; {year} · 365 Applications</p>
    </footer>
  );
}

export default Footer;
