import { useEffect, useState } from 'react';
import Modal from './Modal';
import LoadingBar from './LoadingBar';
import BulletListEditor from './BulletListEditor';
import CvTemplateThumbnail from './CvTemplateThumbnail';
import { supabase } from '../supabaseClient';
import { CV_TEMPLATES, getTemplate } from '../cvTemplates/templates';
import { renderCvPdf, cvToPlainText, imageUrlToDataUrl } from '../cvTemplates/renderCvPdf';

const DEFAULT_RECENT_ROLES = 3;

function toEditableList(strings) {
  return strings.map((text, i) => ({ id: `item-${i}`, text }));
}

function fromEditableList(items) {
  return items.map((it) => it.text).filter((t) => t.trim());
}

function BuildCvDialog({ open, onClose, jobId, employer, cvWord, onSave }) {
  const [stage, setStage] = useState('configure');
  const [recentCount, setRecentCount] = useState(DEFAULT_RECENT_ROLES);
  const [recentMode, setRecentMode] = useState('roles');
  const [cv, setCv] = useState(null);
  const [templateId, setTemplateId] = useState(CV_TEMPLATES[0].id);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [includePhoto, setIncludePhoto] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const template = getTemplate(templateId);

  useEffect(() => {
    if (!open) return;
    setStage('configure');
    setRecentCount(DEFAULT_RECENT_ROLES);
    setRecentMode('roles');
    setCv(null);
    setTemplateId(CV_TEMPLATES[0].id);
    setPaletteIndex(0);
    setIncludePhoto(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
  }, [open]);

  function clearPreview() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function handleBuild() {
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

    const { data, error: fnError } = await supabase.functions.invoke('build-cv', {
      body: { job_id: jobId, recent_mode: recentMode, recent_count: recentCount },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    setLoading(false);

    if (fnError) {
      setError(fnError.message);
      return;
    }

    setCv(data.cv);
    setStage('review');
  }

  function updateSection(index, patch) {
    setCv((c) => ({
      ...c,
      sections: c.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  function updateEntry(sectionIndex, entryIndex, patch) {
    setCv((c) => ({
      ...c,
      sections: c.sections.map((s, i) =>
        i === sectionIndex
          ? { ...s, entries: s.entries.map((e, j) => (j === entryIndex ? { ...e, ...patch } : e)) }
          : s,
      ),
    }));
  }

  function removeEntry(sectionIndex, entryIndex) {
    setCv((c) => ({
      ...c,
      sections: c.sections.map((s, i) =>
        i === sectionIndex ? { ...s, entries: s.entries.filter((_, j) => j !== entryIndex) } : s,
      ),
    }));
  }

  function removeSection(sectionIndex) {
    setCv((c) => ({ ...c, sections: c.sections.filter((_, i) => i !== sectionIndex) }));
  }

  async function getPhotoDataUrl() {
    if (!includePhoto || !cv?.avatar_url || !template.supportsPhoto) return null;
    try {
      return await imageUrlToDataUrl(cv.avatar_url);
    } catch {
      return null;
    }
  }

  async function handlePreview() {
    setPreviewing(true);
    setError(null);

    try {
      const photoDataUrl = await getPhotoDataUrl();
      const blob = await renderCvPdf(cv, template, paletteIndex, photoDataUrl);
      clearPreview();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setError('Failed to render preview.');
    }

    setPreviewing(false);
  }

  // If the preview is already open, keep it live as settings change
  // instead of leaving it stale until the user clicks Preview again.
  // Keyed on the settings themselves (not called directly from their
  // onChange handlers) so it always sees the up-to-date state — calling
  // handlePreview() synchronously right after setTemplateId() etc. would
  // still close over the pre-update value, since state updates aren't
  // applied until the next render.
  useEffect(() => {
    if (!previewUrl) return;
    handlePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, paletteIndex, includePhoto]);

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

    let pdfBlob;
    try {
      const photoDataUrl = await getPhotoDataUrl();
      pdfBlob = await renderCvPdf(cv, template, paletteIndex, photoDataUrl);
    } catch {
      setError('Failed to render the CV.');
      setSaving(false);
      return;
    }

    const plainText = cvToPlainText(cv);
    const baseName = `${employer} — ${cvWord}`;
    const sanitizedBase = baseName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const txtPath = `${user.id}/${crypto.randomUUID()}-${sanitizedBase}.txt`;
    const pdfPath = `${user.id}/${crypto.randomUUID()}-${sanitizedBase}.pdf`;

    const { error: txtUploadError } = await supabase.storage
      .from('documents')
      .upload(txtPath, new Blob([plainText], { type: 'text/plain' }), {
        contentType: 'text/plain',
      });

    if (txtUploadError) {
      setError(txtUploadError.message);
      setSaving(false);
      return;
    }

    const { error: pdfUploadError } = await supabase.storage
      .from('documents')
      .upload(pdfPath, pdfBlob, { contentType: 'application/pdf' });

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

    onSave(inserted.find((doc) => doc.file_name.endsWith('.pdf')));
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div
        className="confirm-dialog profile-form build-cv-dialog"
        role="dialog"
        aria-modal="true"
      >
        <h2>Build {cvWord}</h2>

        {stage === 'configure' && (
          <>
            <p className="field-hint">
              This determines how much of your Experience section is shown
              in full — the most recent roles get their complete detail,
              bullets and all, while everything before that is compacted
              into a single summary line per role.
            </p>
            <div className="build-cv-roles-field">
              <label htmlFor="recentCount">
                Show full detail for the most recent
              </label>
              <input
                id="recentCount"
                type="number"
                min="0"
                max="50"
                value={recentCount}
                onChange={(e) => setRecentCount(Number(e.target.value))}
              />
              <select
                className="profile-select"
                value={recentMode}
                onChange={(e) => setRecentMode(e.target.value)}
                aria-label="Unit"
              >
                <option value="roles">role{recentCount === 1 ? '' : 's'}</option>
                <option value="years">year{recentCount === 1 ? '' : 's'}</option>
              </select>
            </div>
            <p className="field-hint">
              {recentMode === 'roles'
                ? 'Earlier roles are compacted into a single summary line each.'
                : 'Roles outside this window are compacted into a single summary line each.'}
            </p>
          </>
        )}

        {loading && (
          <>
            <p>Building your {cvWord}…</p>
            <LoadingBar />
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        {stage === 'review' && cv && (
          <div className="cv-review">
            {cv.sections.map((section, sIndex) => (
              <div key={section.id} className="cv-review-section">
                <div className="cv-review-section-header">
                  <h3>{section.heading}</h3>
                  {section.type === 'custom' && (
                    <button
                      type="button"
                      className="button-outline item-delete"
                      onClick={() => removeSection(sIndex)}
                    >
                      Remove section
                    </button>
                  )}
                </div>

                {section.type === 'profile' && (
                  <textarea
                    rows={4}
                    value={section.text}
                    onChange={(e) => updateSection(sIndex, { text: e.target.value })}
                  />
                )}

                {section.type === 'skills' && (
                  <BulletListEditor
                    items={toEditableList(section.items)}
                    onChange={(items) =>
                      updateSection(sIndex, { items: fromEditableList(items) })
                    }
                    addLabel="Add skill"
                    variant="compact"
                    rows={1}
                  />
                )}

                {section.type === 'experience' &&
                  section.entries.map((entry, eIndex) => (
                    <div key={entry.id} className="cv-review-entry">
                      <div className="cv-review-entry-header">
                        <span className="item-name-primary">
                          {entry.title} — {entry.employer}
                        </span>
                        <span className="item-meta">{entry.date_range}</span>
                        <button
                          type="button"
                          className="button-outline item-delete"
                          onClick={() => removeEntry(sIndex, eIndex)}
                        >
                          Remove
                        </button>
                      </div>
                      <BulletListEditor
                        items={toEditableList(entry.bullets)}
                        onChange={(items) =>
                          updateEntry(sIndex, eIndex, { bullets: fromEditableList(items) })
                        }
                        addLabel="Add bullet"
                        rows={3}
                      />
                    </div>
                  ))}

                {section.type === 'earlier_experience' &&
                  section.entries.map((entry, eIndex) => (
                    <div key={entry.id} className="cv-review-entry">
                      <div className="cv-review-entry-header">
                        <span className="item-name-primary">
                          {entry.employer} - {entry.title}
                        </span>
                        <button
                          type="button"
                          className="button-outline item-delete"
                          onClick={() => removeEntry(sIndex, eIndex)}
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={entry.summary}
                        onChange={(e) =>
                          updateEntry(sIndex, eIndex, { summary: e.target.value })
                        }
                      />
                    </div>
                  ))}

                {section.type === 'education' &&
                  section.entries.map((entry, eIndex) => (
                    <div key={entry.id} className="cv-review-entry">
                      <div className="cv-review-entry-header">
                        <span className="item-name-primary">
                          {entry.title} — {entry.institution}
                        </span>
                        <span className="item-meta">{entry.date_range}</span>
                        <button
                          type="button"
                          className="button-outline item-delete"
                          onClick={() => removeEntry(sIndex, eIndex)}
                        >
                          Remove
                        </button>
                      </div>
                      <BulletListEditor
                        items={toEditableList(entry.items)}
                        onChange={(items) =>
                          updateEntry(sIndex, eIndex, { items: fromEditableList(items) })
                        }
                        addLabel="Add detail"
                      />
                    </div>
                  ))}

                {section.type === 'custom' && (
                  <>
                    {section.format === 'bullets' && (
                      <>
                        <label>Introduction (optional)</label>
                        <textarea
                          rows={2}
                          value={section.intro}
                          onChange={(e) => updateSection(sIndex, { intro: e.target.value })}
                        />
                      </>
                    )}
                    <label>
                      Content — {section.format === 'bullets' ? 'bullet points' : 'plain text'}
                    </label>
                    <textarea
                      rows={4}
                      value={section.content}
                      onChange={(e) => updateSection(sIndex, { content: e.target.value })}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {stage === 'template' && cv && (
          <>
            <label>Template</label>
            <div className="cv-template-options">
              {CV_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={
                    'cv-template-option' +
                    (templateId === t.id ? ' cv-template-option-selected' : '')
                  }
                  onClick={() => {
                    setTemplateId(t.id);
                    setPaletteIndex(0);
                  }}
                >
                  <CvTemplateThumbnail template={t} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>

            <label>Color</label>
            <div className="cv-palette-options">
              {template.palettes.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  className={
                    'cv-palette-swatch' +
                    (paletteIndex === i ? ' cv-palette-swatch-selected' : '')
                  }
                  style={{ backgroundColor: p.accent }}
                  title={p.name}
                  aria-label={p.name}
                  onClick={() => setPaletteIndex(i)}
                />
              ))}
            </div>

            {template.supportsPhoto && cv.avatar_url && (
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={includePhoto}
                  onChange={(e) => setIncludePhoto(e.target.checked)}
                />
                Include profile photo
              </label>
            )}

            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="button-outline"
                onClick={handlePreview}
                disabled={previewing}
              >
                {previewing ? 'Rendering…' : 'Preview'}
              </button>
            </div>

            {previewUrl && (
              <iframe title="CV preview" src={previewUrl} className="cv-preview-frame" />
            )}
          </>
        )}

        <div className="confirm-dialog-actions">
          {stage === 'configure' && (
            <>
              <button type="button" className="button-outline" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="button-positive"
                disabled={loading}
                onClick={handleBuild}
              >
                {loading ? 'Building…' : 'Build'}
              </button>
            </>
          )}

          {stage === 'review' && (
            <>
              <button type="button" className="button-outline" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="button-positive"
                onClick={() => setStage('template')}
              >
                Continue
              </button>
            </>
          )}

          {stage === 'template' && (
            <>
              <button
                type="button"
                className="button-outline"
                onClick={() => setStage('review')}
              >
                Back
              </button>
              <button
                type="button"
                className="button-positive"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? 'Saving…' : `Save as ${cvWord}`}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default BuildCvDialog;
