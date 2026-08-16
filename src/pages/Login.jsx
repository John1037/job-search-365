import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Footer from '../components/Footer';

function Login() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(
    searchParams.get('mode') === 'signup' ? 'sign-up' : 'sign-in',
  ); // 'sign-in' | 'sign-up' | 'forgot-password'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  function switchMode(newMode) {
    setMode(newMode);
    setError(null);
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (error) setError(error.message);
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else if (!data.session) {
      // Email confirmation is required before a session is issued.
      setMessage('Check your email to confirm your account before logging in.');
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMessage('Check your email for a password reset link.');
    }
  }

  const titles = {
    'sign-in': 'Log in',
    'sign-up': 'Create an account',
    'forgot-password': 'Reset password',
  };
  const submitLabels = {
    'sign-in': 'Log in',
    'sign-up': 'Sign up',
    'forgot-password': 'Send reset link',
  };
  const handlers = {
    'sign-in': handleSignIn,
    'sign-up': handleSignUp,
    'forgot-password': handleForgotPassword,
  };

  return (
    <>
      <div className="page-center">
        <form className="auth-form" onSubmit={handlers[mode]}>
          <h1>{titles[mode]}</h1>

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          {mode !== 'forgot-password' && (
            <>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={
                  mode === 'sign-up' ? 'new-password' : 'current-password'
                }
              />
            </>
          )}

          {mode === 'sign-up' && (
            <>
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </>
          )}

          {error && <p className="form-error">{error}</p>}
          {message && <p className="form-message">{message}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Please wait…' : submitLabels[mode]}
          </button>

          {mode === 'sign-in' && (
            <>
              <button
                type="button"
                className="link-button"
                onClick={() => switchMode('forgot-password')}
              >
                Forgot password?
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => switchMode('sign-up')}
              >
                Don't have an account? Sign up
              </button>
            </>
          )}

          {(mode === 'sign-up' || mode === 'forgot-password') && (
            <button
              type="button"
              className="link-button"
              onClick={() => switchMode('sign-in')}
            >
              Back to log in
            </button>
          )}
        </form>
      </div>
      <Footer />
    </>
  );
}

export default Login;
