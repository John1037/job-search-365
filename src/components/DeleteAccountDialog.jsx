import { useState } from 'react';
import Modal from './Modal';

const CONFIRM_TEXT = 'DELETE';

function DeleteAccountDialog({ open, onClose, onConfirm }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  function resetAndClose() {
    setConfirmText('');
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    setError(null);
    setDeleting(true);

    try {
      const result = await onConfirm();

      if (result?.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error('[delete-account] unexpected error:', err);
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose}>
      <div
        className="confirm-dialog profile-form"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
      >
        <h2 id="delete-account-title">Delete my account</h2>
        <p>
          This action is not reversible, ALL of your data will be deleted,
          and we won't be able to recover it. Proceed?
        </p>

        <label htmlFor="deleteConfirmText">Type "{CONFIRM_TEXT}" to confirm</label>
        <input
          id="deleteConfirmText"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={CONFIRM_TEXT}
          autoFocus
        />

        {error && <p className="form-error">{error}</p>}

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="link-button"
            onClick={resetAndClose}
            disabled={deleting}
          >
            Go back
          </button>
          <button
            type="button"
            className="confirm-danger-button"
            onClick={handleConfirm}
            disabled={confirmText !== CONFIRM_TEXT || deleting}
          >
            {deleting ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default DeleteAccountDialog;
