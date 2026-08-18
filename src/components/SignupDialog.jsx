import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import { supabase } from '../supabaseClient';

function SignupDialog({ open, onClose }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  function resetAndClose() {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setMessage(null);
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/main` },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      resetAndClose();
      navigate('/main');
    } else {
      setMessage(
        'Check your email to confirm your account before logging in.',
      );
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose}>
      <form
        className="confirm-dialog profile-form login-dialog"
        onSubmit={handleSubmit}
      >
        <h2>Sign up free</h2>

        <label htmlFor="signupEmail">Email</label>
        <input
          id="signupEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
        />

        <label htmlFor="signupPassword">Password</label>
        <input
          id="signupPassword"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />

        <label htmlFor="signupConfirmPassword">Confirm password</label>
        <input
          id="signupConfirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
        />

        {error && <p className="form-error">{error}</p>}
        {message && <p className="signup-success-message">{message}</p>}

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="button-outline"
            onClick={resetAndClose}
            disabled={loading}
          >
            {message ? 'Close' : 'Cancel'}
          </button>
          {!message && (
            <button
              type="submit"
              className="button-positive"
              disabled={loading}
            >
              {loading ? 'Please wait…' : 'Sign up'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default SignupDialog;
