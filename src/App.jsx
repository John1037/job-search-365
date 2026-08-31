import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Signup from './pages/Signup';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import EditProfile from './pages/EditProfile';
import Documents from './pages/Documents';
import Settings from './pages/Settings';
import AddJob from './pages/AddJob';
import ManageJobs from './pages/ManageJobs';
import JobDetail from './pages/JobDetail';
import Inbox from './pages/Inbox';
import InboxCallback from './pages/InboxCallback';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';

function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        // getSession() only reads local storage; confirm the account
        // still actually exists server-side before trusting it.
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          await supabase.auth.signOut();
          setSession(null);
          return;
        }
      }

      setSession(session);
    }

    init().catch(() => setSession(null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // onAuthStateChange only fires for actions taken in this tab. If the
    // user confirms their email (or logs in) in a different tab/window,
    // Supabase writes the new session to localStorage — pick that up here
    // so this tab updates without needing a manual refresh.
    function handleStorageChange(e) {
      if (e.key && !e.key.includes('supabase')) return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
      });
    }
    window.addEventListener('storage', handleStorageChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  if (session === undefined) {
    return <div className="page-center">Loading…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={session ? <Navigate to="/main" replace /> : <Landing />}
        />
        <Route
          path="/signup"
          element={session ? <Navigate to="/main" replace /> : <Signup />}
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route
          element={session ? <Layout /> : <Navigate to="/" replace />}
        >
          <Route path="/main" element={<Home />} />
          <Route path="/profile" element={<EditProfile />} />
          <Route path="/documents/:category" element={<Documents />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/jobs" element={<ManageJobs />} />
          <Route path="/jobs/closed" element={<ManageJobs closed />} />
          <Route path="/jobs/new" element={<AddJob />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/inbox/callback" element={<InboxCallback />} />
        </Route>
        <Route
          path="*"
          element={<Navigate to={session ? '/main' : '/'} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
