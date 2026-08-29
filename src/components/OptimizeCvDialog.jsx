import { useEffect, useState } from 'react';
import Modal from './Modal';
import LoadingBar from './LoadingBar';
import { supabase } from '../supabaseClient';

// Loaded on demand (only when a result is actually saved) since jsPDF adds
// a meaningful chunk of weight that most page loads never need. Three
// tiers, marked by the Edge Function so structure survives being shown in
// a plain <textarea> for editing: "## " section headers (largest/bold),
// "### " sub-headers (bold, body-sized), everything else plain body text.
const TIERS = [
  { prefix: '## ', font: 'bold', size: 13, lineHeight: 22 },
  { prefix: '### ', font: 'bold', size: 11, lineHeight: 16 },
];
const BODY_TIER = { font: 'normal', size: 11, lineHeight: 16 };

// Renders one logical content line, honouring an optional "**label:**"
// bold-prefix marker (used for categorized-list bullets, e.g. "•
// Automation & CRM: ...") — bold label inline with normal-weight text
// after it when it fits, otherwise the label on its own line so it still
// reads distinctly. The regex allows an optional leading bullet marker
// before the "**" — without it, a bulleted line's "• " prefix meant the
// line never matched at all, since it doesn't start with "**".
function renderContentLine(doc, content, style, marginX, maxWidth, y, ensureRoom) {
  const boldMatch = content.match(/^([•\-*]\s*)?\*\*(.+?)\*\*\s*(.*)$/);
  doc.setFontSize(style.size);

  if (!boldMatch) {
    doc.setFont('helvetica', style.font);
    const lines = content ? doc.splitTextToSize(content, maxWidth) : [''];
    for (const line of lines) {
      y = ensureRoom(y, style.lineHeight);
      doc.text(line, marginX, y);
      y += style.lineHeight;
    }
    return y;
  }

  const [, bulletPrefix = '', boldText, rest] = boldMatch;
  doc.setFont('helvetica', style.font);
  const bulletWidth = bulletPrefix ? doc.getTextWidth(bulletPrefix) : 0;
  doc.setFont('helvetica', 'bold');
  const boldWithSpace = `${boldText} `;
  const boldWidth = doc.getTextWidth(boldWithSpace);
  doc.setFont('helvetica', style.font);
  const restWidth = rest ? doc.getTextWidth(rest) : 0;

  y = ensureRoom(y, style.lineHeight);

  function drawBulletAndBold() {
    if (bulletPrefix) {
      doc.setFont('helvetica', style.font);
      doc.text(bulletPrefix, marginX, y);
    }
    doc.setFont('helvetica', 'bold');
    doc.text(boldText, marginX + bulletWidth, y);
  }

  if (!rest || bulletWidth + boldWidth + restWidth <= maxWidth) {
    drawBulletAndBold();
    doc.setFont('helvetica', style.font);
    doc.text(rest, marginX + bulletWidth + boldWidth, y);
    return y + style.lineHeight;
  }

  drawBulletAndBold();
  y += style.lineHeight;

  doc.setFont('helvetica', style.font);
  const wrapped = doc.splitTextToSize(rest, maxWidth);
  for (const line of wrapped) {
    y = ensureRoom(y, style.lineHeight);
    doc.text(line, marginX, y);
    y += style.lineHeight;
  }
  return y;
}

async function buildOptimizedCvPdfBlob(text) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 56;
  const marginTop = 72;
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;

  let y = marginTop;

  function ensureRoom(currentY, height) {
    if (currentY > pageHeight - marginTop - height) {
      doc.addPage();
      return marginTop;
    }
    return currentY;
  }

  for (const rawLine of text.split('\n')) {
    // Page-break marker from the Edge Function, inserted wherever the
    // original CV had a page boundary — skip forcing one if nothing's
    // been drawn on the current page yet.
    if (rawLine === '\f') {
      if (y > marginTop) {
        doc.addPage();
        y = marginTop;
      }
      continue;
    }

    const tier = TIERS.find((t) => rawLine.startsWith(t.prefix));
    const content = tier ? rawLine.slice(tier.prefix.length) : rawLine;
    const style = tier ?? BODY_TIER;

    y = renderContentLine(doc, content, style, marginX, maxWidth, y, ensureRoom);
  }

  return doc.output('blob');
}

function OptimizeCvDialog({ open, onClose, jobId, employer, cvWord, onSave }) {
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;

    setDraft('');
    setError(null);

    async function generate() {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError('Not signed in.');
        setLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke(
        'optimize-cv',
        {
          body: { job_id: jobId },
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );

      if (fnError) {
        setError(fnError.message);
      } else {
        setDraft(data.optimized);
      }

      setLoading(false);
    }

    generate();
  }, [open, jobId]);

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

    const cleanText = draft
      .replace(/^(## |### )/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/^\f\n?/gm, '');
    const baseName = `${employer} — optimized ${cvWord}`;
    const sanitizedBase = baseName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const txtPath = `${user.id}/${crypto.randomUUID()}-${sanitizedBase}.txt`;
    const pdfPath = `${user.id}/${crypto.randomUUID()}-${sanitizedBase}.pdf`;

    const { error: txtUploadError } = await supabase.storage
      .from('documents')
      .upload(txtPath, new Blob([cleanText], { type: 'text/plain' }), {
        contentType: 'text/plain',
      });

    if (txtUploadError) {
      setError(txtUploadError.message);
      setSaving(false);
      return;
    }

    const { error: pdfUploadError } = await supabase.storage
      .from('documents')
      .upload(pdfPath, await buildOptimizedCvPdfBlob(draft), {
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
          category: 'cv',
          file_name: `${baseName}.txt`,
          storage_path: txtPath,
        },
        {
          user_id: user.id,
          category: 'cv',
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
        <h2>Optimize {cvWord}</h2>

        {loading && (
          <>
            <p>Optimizing your {cvWord}…</p>
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
          <button
            type="button"
            className="button-positive"
            disabled={loading || saving || !draft}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : `Save as ${cvWord}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default OptimizeCvDialog;
