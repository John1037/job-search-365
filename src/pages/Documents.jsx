import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import ConfirmDialog from '../components/ConfirmDialog';
import DescribeDocumentDialog from '../components/DescribeDocumentDialog';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const SIGNED_URL_TTL_SECONDS = 60;
const FIXED_CATEGORIES = ['cv', 'cover_letter', 'certificate'];

const CATEGORY_LABELS = {
  cv: (country) => (country === 'US' ? 'Resumes' : 'CVs'),
  cover_letter: () => 'Cover letters',
  certificate: () => 'Certificates',
  other: () => 'Other documents',
};

function Documents() {
  const { category } = useParams();
  const { country } = useOutletContext();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const isOther = category === 'other';

  const [userId, setUserId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [docPendingDelete, setDocPendingDelete] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [describeDialogOpen, setDescribeDialogOpen] = useState(false);

  const labelFn = CATEGORY_LABELS[category];
  const categoryLabel = labelFn ? labelFn(country) : null;

  useEffect(() => {
    if (!labelFn) return;

    async function loadDocuments() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;
      setUserId(user.id);

      let query = supabase
        .from('documents')
        .select('id, file_name, storage_path, uploaded_at, is_default, category')
        .eq('user_id', user.id);

      query = isOther
        ? query.not('category', 'in', `(${FIXED_CATEGORIES.join(',')})`)
        : query.eq('category', category);

      const { data, error } = await query.order('uploaded_at', {
        ascending: false,
      });

      if (error) {
        setError(error.message);
      } else {
        setDocuments(data);
      }

      setLoading(false);
    }

    loadDocuments();
  }, [category, isOther, labelFn]);

  async function uploadFile(file, categoryValue) {
    setUploading(true);

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `${userId}/${crypto.randomUUID()}-${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setUploading(false);
      return { error: uploadError.message };
    }

    const { data: inserted, error: insertError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        category: categoryValue,
        file_name: file.name,
        storage_path: path,
      })
      .select('id, file_name, storage_path, uploaded_at, is_default, category')
      .single();

    setUploading(false);

    if (insertError) {
      return { error: insertError.message };
    }

    setDocuments((docs) => [inserted, ...docs]);
    return {};
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please choose a PDF or Word document.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('File must be smaller than 10MB.');
      return;
    }

    setError(null);

    if (isOther) {
      setPendingFile(file);
      setDescribeDialogOpen(true);
      return;
    }

    const result = await uploadFile(file, category);
    if (result.error) setError(result.error);
  }

  async function handleDescribeSubmit(description) {
    const result = await uploadFile(pendingFile, description);

    if (!result.error) {
      setPendingFile(null);
      setDescribeDialogOpen(false);
    }

    return result;
  }

  async function handleView(doc) {
    setError(null);
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);

    if (error) {
      setError(error.message);
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleSetDefault(doc) {
    setError(null);

    const { error: clearError } = await supabase
      .from('documents')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('category', doc.category)
      .eq('is_default', true);

    if (clearError) {
      setError(clearError.message);
      return;
    }

    const { error: setDefaultError } = await supabase
      .from('documents')
      .update({ is_default: true })
      .eq('id', doc.id);

    if (setDefaultError) {
      setError(setDefaultError.message);
      return;
    }

    setDocuments((docs) =>
      docs.map((d) => ({
        ...d,
        is_default: d.id === doc.id ? true : d.category === doc.category ? false : d.is_default,
      })),
    );
  }

  async function handleConfirmDelete() {
    const doc = docPendingDelete;
    if (!doc) return;

    setError(null);

    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([doc.storage_path]);

    if (storageError) {
      setError(storageError.message);
      setDocPendingDelete(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', doc.id);

    if (deleteError) {
      setError(deleteError.message);
      setDocPendingDelete(null);
      return;
    }

    setDocuments((docs) => docs.filter((d) => d.id !== doc.id));
    setDocPendingDelete(null);
  }

  if (!labelFn) {
    return (
      <div className="page-content">
        <p>Unknown document category.</p>
        <button
          type="button"
          className="link-button"
          onClick={() => navigate('/main')}
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="list-page">
      <div className="list-header">
        <h1>Manage {categoryLabel}</h1>
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="avatar-file-input"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : documents.length === 0 ? (
        <p className="field-hint">No {categoryLabel.toLowerCase()} uploaded yet.</p>
      ) : (
        <ul className="item-list">
          {documents.map((doc) => (
            <li key={doc.id} className="item-row">
              <span className="item-name">
                <span className="item-name-primary">{doc.file_name}</span>
                {isOther && doc.category && (
                  <span className="item-subtext">{doc.category}</span>
                )}
              </span>
              <span className="item-meta">
                {new Date(doc.uploaded_at).toLocaleDateString()}
              </span>
              <div className="item-actions">
                {doc.is_default ? (
                  <span className="item-badge">Default</span>
                ) : (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleSetDefault(doc)}
                  >
                    Set as default
                  </button>
                )}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => handleView(doc)}
                >
                  View
                </button>
                <button
                  type="button"
                  className="link-button item-delete"
                  onClick={() => setDocPendingDelete(doc)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="link-button"
        onClick={() => navigate('/main')}
      >
        Back to home
      </button>

      <ConfirmDialog
        open={!!docPendingDelete}
        title="Delete document?"
        message={`Delete "${docPendingDelete?.file_name}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDocPendingDelete(null)}
      />

      <DescribeDocumentDialog
        open={describeDialogOpen}
        onClose={() => {
          setDescribeDialogOpen(false);
          setPendingFile(null);
        }}
        onSubmit={handleDescribeSubmit}
      />
    </div>
  );
}

export default Documents;
