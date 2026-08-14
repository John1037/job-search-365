import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Layout from './components/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import EditProfile from './pages/EditProfile';
import Documents from './pages/Documents';
import Settings from './pages/Settings';
import AddJob from './pages/AddJob';
import ManageJobs from './pages/ManageJobs';
import JobDetail from './pages/JobDetail';

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

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="page-center">Loading…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <Login />}
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          element={session ? <Layout /> : <Navigate to="/login" replace />}
        >
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<EditProfile />} />
          <Route path="/documents/:category" element={<Documents />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/jobs" element={<ManageJobs />} />
          <Route path="/jobs/closed" element={<ManageJobs closed />} />
          <Route path="/jobs/new" element={<AddJob />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
