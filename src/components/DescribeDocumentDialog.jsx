import { useState } from 'react';
import Modal from './Modal';

const MAX_LENGTH = 40;

function DescribeDocumentDialog({ open, onClose, onSubmit }) {
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function resetAndClose() {
    setDescription('');
    setError(null);
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const trimmed = description.trim();
    if (!trimmed) return;

    setSaving(true);
    const result = await onSubmit(trimmed);
    setSaving(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setDescription('');
  }

  return (
    <Modal open={open} onClose={resetAndClose}>
      <form
        className="confirm-dialog profile-form"
        onSubmit={handleSubmit}
      >
        <h2>Describe this document</h2>

        <label htmlFor="documentDescription">What kind of document is this?</label>
        <input
          id="documentDescription"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={MAX_LENGTH}
          placeholder="e.g. Reference letter"
          required
          autoFocus
        />
        <p className="field-hint">
          {description.length}/{MAX_LENGTH} characters
        </p>

        {error && <p className="form-error">{error}</p>}

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="button-outline"
            onClick={resetAndClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button-positive"
            disabled={saving || !description.trim()}
          >
            {saving ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default DescribeDocumentDialog;
