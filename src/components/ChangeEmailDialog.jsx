import { useState } from 'react';
import Modal from './Modal';
import { supabase } from '../supabaseClient';

function ChangeEmailDialog({ open, onClose, currentEmail }) {
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  function resetAndClose() {
    setEmail('');
    setConfirmEmail('');
    setError(null);
    setMessage(null);
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (email !== confirmEmail) {
      setError('Email addresses do not match.');
      return;
    }

    if (email === currentEmail) {
      setError('That is already your current email address.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ email });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(
      'Check your new email inbox to confirm the change. Your email address will update once confirmed.',
    );
  }

  return (
    <Modal open={open} onClose={resetAndClose}>
      <form
        className="confirm-dialog profile-form login-dialog"
        onSubmit={handleSubmit}
      >
        <h2>Change email address</h2>

        {!message && (
          <>
            <label htmlFor="newEmail">New email address</label>
            <input
              id="newEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />

            <label htmlFor="confirmNewEmail">Confirm new email address</label>
            <input
              id="confirmNewEmail"
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              required
            />
          </>
        )}

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
              {loading ? 'Please wait…' : 'Send confirmation'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default ChangeEmailDialog;
