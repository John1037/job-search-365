import { useEffect, useState } from 'react';
import Modal from './Modal';
import LoadingBar from './LoadingBar';
import { supabase } from '../supabaseClient';
import { getFunctionErrorMessage } from '../functionError';
import { sanitizeFileNamePart } from '../fileNaming';

// Loaded on demand (only when a letter is actually saved) since jsPDF adds
// a meaningful chunk of weight that most page loads never need.
async function buildCoverLetterPdfBlob(text) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 56;
  const marginTop = 72;
  const lineHeight = 16;
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  let y = marginTop;
  for (const paragraph of text.split('\n')) {
    const lines = paragraph ? doc.splitTextToSize(paragraph, maxWidth) : [''];
    for (const line of lines) {
      if (y > pageHeight - marginTop) {
        doc.addPage();
        y = marginTop;
      }
      doc.text(line, marginX, y);
      y += lineHeight;
    }
  }

  return doc.output('blob');
}

function GenerateCoverLetterDialog({ open, onClose, jobId, employer, onSave }) {
  const [extraDetails, setExtraDetails] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Generation no longer fires the moment the dialog opens — it waits for
  // "Generate" below, so there's a chance to add anything specific first
  // instead of only being able to edit the draft after the fact.
  useEffect(() => {
    if (!open) return;
    setExtraDetails('');
    setDraft('');
    setError(null);
  }, [open]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError('Not signed in.');
      setLoading(false);
      return;
    }

    const { data, error: fnError } = await supabase.functions.invoke(
      'generate-cover-letter',
      {
        body: { job_id: jobId, extra_details: extraDetails.trim() },
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );

    if (fnError) {
      setError(await getFunctionErrorMessage(fnError));
    } else {
      setDraft(data.draft);
    }

    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Not signed in.');
      setSaving(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const namePart = sanitizeFileNamePart(profile?.full_name || 'Cover_Letter') || 'Cover_Letter';
    const employerPart = sanitizeFileNamePart(employer || '') || 'Employer';
    const baseName = `${namePart}_cover_${employerPart}`;
    const sanitizedBase = baseName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const txtPath = `${user.id}/${crypto.randomUUID()}-${sanitizedBase}.txt`;
    const pdfPath = `${user.id}/${crypto.randomUUID()}-${sanitizedBase}.pdf`;

    const { error: txtUploadError } = await supabase.storage
      .from('documents')
      .upload(txtPath, new Blob([draft], { type: 'text/plain' }), {
        contentType: 'text/plain',
      });

    if (txtUploadError) {
      setError(txtUploadError.message);
      setSaving(false);
      return;
    }

    const { error: pdfUploadError } = await supabase.storage
      .from('documents')
      .upload(pdfPath, await buildCoverLetterPdfBlob(draft), {
        contentType: 'application/pdf',
      });

    if (pdfUploadError) {
      setError(pdfUploadError.message);
      setSaving(false);
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('documents')
      .insert([
        {
          user_id: user.id,
          category: 'cover_letter',
          file_name: `${baseName}.txt`,
          storage_path: txtPath,
        },
        {
          user_id: user.id,
          category: 'cover_letter',
          file_name: `${baseName}.pdf`,
          storage_path: pdfPath,
        },
      ])
      .select('id, file_name, storage_path');

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    // The PDF is the one actually connected to the job — the .txt stays in
    // the documents library as an easily-editable copy.
    onSave(inserted.find((doc) => doc.file_name.endsWith('.pdf')));
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div
        className="confirm-dialog profile-form event-dialog"
        role="dialog"
        aria-modal="true"
      >
        <h2>Suggest cover letter</h2>

        {!loading && !draft && (
          <>
            <label htmlFor="cover-letter-extra-details">
              Anything specific you want included? (optional)
            </label>
            <textarea
              id="cover-letter-extra-details"
              rows={4}
              placeholder="e.g. mention my notice period, or that I'm relocating to the area"
              value={extraDetails}
              onChange={(e) => setExtraDetails(e.target.value)}
            />
          </>
        )}

        {loading && (
          <>
            <p>Drafting your cover letter…</p>
            <LoadingBar />
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        {!loading && draft && (
          <textarea
            rows={16}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        )}

        <div className="confirm-dialog-actions">
          <button type="button" className="button-outline" onClick={onClose}>
            Cancel
          </button>
          {!draft ? (
            <button
              type="button"
              className="button-positive"
              disabled={loading}
              onClick={handleGenerate}
            >
              {loading ? 'Drafting…' : 'Generate'}
            </button>
          ) : (
            <button
              type="button"
              className="button-positive"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'Save as cover letter'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default GenerateCoverLetterDialog;
