import { useEffect, useState } from 'react';
import Modal from './Modal';
import { supabase } from '../supabaseClient';

function ConnectCvDialog({ open, onClose, onSelect, cvWord }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;

    async function loadCvs() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('documents')
        .select('id, file_name, storage_path, is_default')
        .eq('user_id', user.id)
        .eq('category', 'cv')
        .order('is_default', { ascending: false })
        .order('uploaded_at', { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setDocuments(data);
      }

      setLoading(false);
    }

    loadCvs();
  }, [open]);

  return (
    <Modal open={open} onClose={onClose}>
      <div
        className="confirm-dialog event-dialog"
        role="dialog"
        aria-modal="true"
      >
        <h2>Connect a {cvWord}</h2>

        {error && <p className="form-error">{error}</p>}

        {loading ? (
          <p>Loading…</p>
        ) : documents.length === 0 ? (
          <p className="field-hint">
            No {cvWord}s uploaded yet. Upload one from the Documents menu
            first.
          </p>
        ) : (
          <ul className="item-list">
            {documents.map((doc) => (
              <li key={doc.id} className="item-row">
                <span className="item-name">
                  <span className="item-name-primary">{doc.file_name}</span>
                </span>
                {doc.is_default && (
                  <span className="item-badge">Default</span>
                )}
                <div className="item-actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onSelect(doc)}
                  >
                    Select
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="confirm-dialog-actions">
          <button type="button" className="link-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ConnectCvDialog;
