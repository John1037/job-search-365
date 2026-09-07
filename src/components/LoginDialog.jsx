import { useRef, useState } from 'react';
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
  // These two inputs are intentionally uncontrolled (no `value` prop) — a
  // browser autofilling a saved credential writes straight to the DOM
  // without firing React's onChange, and if the input were controlled,
  // React's own next re-render (e.g. from typing in the other field, or
  // just `loading` changing) would reassert the stale `email`/`password`
  // state over the top and erase what the browser just filled in, right
  // before submit reads it. Reading the live DOM value via ref at submit
  // time is only reliable once React has stopped fighting the DOM for it.
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

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
      email: emailRef.current?.value ?? email,
      password: passwordRef.current?.value ?? password,
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

    const { error } = await supabase.auth.resetPasswordForEmail(
      emailRef.current?.value ?? email,
      { redirectTo: `${window.location.origin}/reset-password` },
    );

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
          ref={emailRef}
          type="email"
          defaultValue={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
        />

        {/* Hidden via CSS rather than conditionally rendered — unmounting
            this field on a mode switch would destroy the DOM node and lose
            an autofilled value on remount (defaultValue only applies once,
            from whatever `password` state happened to be at that point). */}
        <div style={{ display: mode === 'sign-in' ? 'contents' : 'none' }}>
          <label htmlFor="loginPassword">Password</label>
          <input
            id="loginPassword"
            ref={passwordRef}
            type="password"
            defaultValue={password}
            onChange={(e) => setPassword(e.target.value)}
            required={mode === 'sign-in'}
            autoComplete="current-password"
          />
        </div>

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
