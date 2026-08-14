import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Layout from './components/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import EditProfile from './pages/EditProfile';

function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
