import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const SIGNED_URL_TTL_SECONDS = 60;

const CATEGORY_LABELS = {
  cv: (country) => (country === 'US' ? 'Resumes' : 'CVs'),
  cover_letter: () => 'Cover letters',
  certificate: () => 'Certificates',
};

function Documents() {
  const { category } = useParams();
  const { country } = useOutletContext();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [userId, setUserId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

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

      const { data, error } = await supabase
        .from('documents')
        .select('id, file_name, storage_path, uploaded_at, is_default')
        .eq('user_id', user.id)
        .eq('category', category)
        .order('uploaded_at', { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setDocuments(data);
      }

      setLoading(false);
    }

    loadDocuments();
  }, [category, labelFn]);

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
    setUploading(true);

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `${userId}/${crypto.randomUUID()}-${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        category,
        file_name: file.name,
        storage_path: path,
      })
      .select('id, file_name, storage_path, uploaded_at, is_default')
      .single();

    if (insertError) {
      setError(insertError.message);
    } else {
      setDocuments((docs) => [inserted, ...docs]);
    }

    setUploading(false);
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
      .eq('category', category)
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
      docs.map((d) => ({ ...d, is_default: d.id === doc.id })),
    );
  }

  async function handleDelete(doc) {
    setError(null);

    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([doc.storage_path]);

    if (storageError) {
      setError(storageError.message);
      return;
    }

    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', doc.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setDocuments((docs) => docs.filter((d) => d.id !== doc.id));
  }

  if (!labelFn) {
    return (
      <div className="page-content">
        <p>Unknown document category.</p>
        <button
          type="button"
          className="link-button"
          onClick={() => navigate('/')}
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="documents-page">
      <div className="documents-header">
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
        <ul className="documents-list">
          {documents.map((doc) => (
            <li key={doc.id} className="document-row">
              <span className="document-name">{doc.file_name}</span>
              <span className="document-date">
                {new Date(doc.uploaded_at).toLocaleDateString()}
              </span>
              <div className="document-actions">
                {category === 'cv' &&
                  (doc.is_default ? (
                    <span className="document-default-badge">Default</span>
                  ) : (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleSetDefault(doc)}
                    >
                      Set as default
                    </button>
                  ))}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => handleView(doc)}
                >
                  View
                </button>
                <button
                  type="button"
                  className="link-button document-delete"
                  onClick={() => handleDelete(doc)}
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
        onClick={() => navigate('/')}
      >
        Back to home
      </button>
    </div>
  );
}

export default Documents;
