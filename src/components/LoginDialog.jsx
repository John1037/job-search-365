import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import { supabase } from '../supabaseClient';

function LoginDialog({ open, onClose }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('sign-in'); // 'sign-in' | 'forgot-password'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  function resetAndClose() {
    setMode('sign-in');
    setEmail('');
    setPassword('');
    setError(null);
    setMessage(null);
    onClose();
  }

  function switchMode(newMode) {
    setMode(newMode);
    setError(null);
    setMessage(null);
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

    if (error) {
      setError(error.message);
      return;
    }

    resetAndClose();
    navigate('/main');
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

  return (
    <Modal open={open} onClose={resetAndClose}>
      <form
        className="confirm-dialog profile-form login-dialog"
        onSubmit={mode === 'sign-in' ? handleSignIn : handleForgotPassword}
      >
        <h2>{mode === 'sign-in' ? 'Log in' : 'Reset password'}</h2>

        <label htmlFor="loginEmail">Email</label>
        <input
          id="loginEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
        />

        {mode === 'sign-in' && (
          <>
            <label htmlFor="loginPassword">Password</label>
            <input
              id="loginPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </>
        )}

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-message">{message}</p>}

        {mode === 'sign-in' ? (
          <button
            type="button"
            className="button-outline"
            onClick={() => switchMode('forgot-password')}
          >
            Forgot password?
          </button>
        ) : (
          <button
            type="button"
            className="button-outline"
            onClick={() => switchMode('sign-in')}
          >
            Back to log in
          </button>
        )}

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="button-outline"
            onClick={resetAndClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button type="submit" className="button-positive" disabled={loading}>
            {loading
              ? 'Please wait…'
              : mode === 'sign-in'
                ? 'Log in'
                : 'Send reset link'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default LoginDialog;
