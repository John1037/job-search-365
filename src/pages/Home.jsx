import { useOutletContext } from 'react-router-dom';

function Home() {
  const { shortName } = useOutletContext();
  const displayName = shortName || 'User';

  return (
    <div className="home-page">
      <h1 className="home-greeting">Hi {displayName}</h1>

      <section className="home-section">
        <h2>Alerts</h2>
      </section>

      <section className="home-section">
        <h2>Current applications</h2>
      </section>

      <section className="home-section">
        <h2>Current interested jobs</h2>
      </section>

      <section className="home-section">
        <h2>Potential jobs</h2>
      </section>
    </div>
  );
}

export default Home;
