import { useEffect, useState } from 'react';
import Modal from './Modal';
import { supabase } from '../supabaseClient';

const FIXED_CATEGORIES = ['cv', 'cover_letter', 'certificate'];

function ConnectDocumentDialog({ open, onClose, onSelect, connectedDocs, cvWord }) {
  const [category, setCategory] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setCategory(null);
      setDocuments([]);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!category) return;

    async function loadDocuments() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      let query = supabase
        .from('documents')
        .select('id, file_name, storage_path, is_default')
        .eq('user_id', user.id);

      query =
        category === 'other'
          ? query.not('category', 'in', `(${FIXED_CATEGORIES.join(',')})`)
          : query.eq('category', category);

      const { data, error } = await query
        .order('is_default', { ascending: false })
        .order('uploaded_at', { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setDocuments(data);
      }

      setLoading(false);
    }

    loadDocuments();
  }, [category]);

  const categoryOptions = [
    { value: 'cv', label: cvWord, full: !!connectedDocs.cv_document_id },
    {
      value: 'cover_letter',
      label: 'Cover letter',
      full: !!connectedDocs.cover_letter_document_id,
    },
    {
      value: 'certificate',
      label: 'Certificate',
      full: !!connectedDocs.certificate_document_id,
    },
    {
      value: 'other',
      label: 'Other document',
      full: [
        'other_document_1_id',
        'other_document_2_id',
        'other_document_3_id',
      ].every((key) => connectedDocs[key]),
    },
  ];

  const categoryLabel = categoryOptions.find((c) => c.value === category)?.label;

  function handleClose() {
    setCategory(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <div
        className="confirm-dialog event-dialog"
        role="dialog"
        aria-modal="true"
      >
        {!category ? (
          <>
            <h2>Connect a document</h2>
            <p className="field-hint">
              Choose which type of document to connect.
            </p>

            <ul className="item-list">
              {categoryOptions.map((opt) => (
                <li key={opt.value} className="item-row">
                  <span className="item-name">
                    <span className="item-name-primary">{opt.label}</span>
                    {opt.full && (
                      <span className="item-subtext">All slots full</span>
                    )}
                  </span>
                  <div className="item-actions">
                    <button
                      type="button"
                      className="button-outline"
                      disabled={opt.full}
                      onClick={() => setCategory(opt.value)}
                    >
                      Choose
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="button-outline"
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Connect a {categoryLabel}</h2>

            {error && <p className="form-error">{error}</p>}

            {loading ? (
              <p>Loading…</p>
            ) : documents.length === 0 ? (
              <p className="field-hint">
                No {categoryLabel.toLowerCase()}s uploaded yet. Upload one
                from the Documents menu first.
              </p>
            ) : (
              <ul className="item-list">
                {documents.map((doc) => (
                  <li key={doc.id} className="item-row">
                    <span className="item-name">
                      <span className="item-name-primary">
                        {doc.file_name}
                      </span>
                    </span>
                    {doc.is_default && (
                      <span className="item-badge">Default</span>
                    )}
                    <div className="item-actions">
                      <button
                        type="button"
                        className="button-outline"
                        onClick={() => onSelect(doc, category)}
                      >
                        Select
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="button-outline"
                onClick={() => setCategory(null)}
              >
                Back
              </button>
              <button
                type="button"
                className="button-outline"
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default ConnectDocumentDialog;
