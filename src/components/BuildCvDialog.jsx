import { useEffect, useState } from 'react';
import Modal from './Modal';
import LoadingBar from './LoadingBar';
import BulletListEditor from './BulletListEditor';
import CvTemplateThumbnail from './CvTemplateThumbnail';
import { supabase } from '../supabaseClient';
import { CV_TEMPLATES, getTemplate } from '../cvTemplates/templates';
import {
  renderCvPdf,
  cvToPlainText,
  imageUrlToDataUrl,
  FONT_FAMILIES,
} from '../cvTemplates/renderCvPdf';
import { sanitizeFileNamePart } from '../fileNaming';

const DEFAULT_RECENT_ROLES = 3;

// Mobile browsers (no built-in PDF viewer) can't render the preview iframe
// at all — showing it there is just a permanently blank box. `pdfViewerEnabled`
// reports that capability directly where it's supported (Chrome/Edge/Firefox);
// elsewhere (e.g. Safari, which lacks the API but does support inline PDFs)
// default to showing it, since that matches current behavior there.
const CAN_PREVIEW_INLINE =
  typeof navigator !== 'undefined' && 'pdfViewerEnabled' in navigator
    ? navigator.pdfViewerEnabled
    : true;

function toEditableList(strings) {
  return strings.map((text, i) => ({ id: `item-${i}`, text }));
}

// Deliberately doesn't filter out blank entries — this feeds the LIVE
// editing state on every keystroke (including the instant after "Add" adds
// a brand-new blank row), and filtering here would strip that blank row
// back out before React ever gets to render it, making "Add" look like it
// does nothing. Blank entries are pruned separately, only at the point the
// CV is actually rendered (see pruneCvBlanks below).
function fromEditableList(items) {
  return items.map((it) => it.text);
}

function pruneBlankStrings(list) {
  return list.filter((s) => s.trim());
}

// Strips blank list entries (an "Add"ed row the user never filled in, or
// emptied out and forgot to remove) out of every list-shaped field in the
// CV, right before it's rendered/saved — never applied to the live editing
// state itself, so it can't interfere with adding a new (momentarily blank)
// row the way filtering in fromEditableList did.
function pruneCvBlanks(cv) {
  return {
    ...cv,
    sections: cv.sections.map((section) => {
      if (section.type === 'skills') {
        return { ...section, items: pruneBlankStrings(section.items) };
      }
      if (section.type === 'experience') {
        return {
          ...section,
          entries: section.entries.map((e) => ({
            ...e,
            bullets: pruneBlankStrings(e.bullets),
          })),
        };
      }
      if (section.type === 'certification') {
        return {
          ...section,
          entries: section.entries.map((e) => ({
            ...e,
            items: pruneBlankStrings(e.items),
          })),
        };
      }
      if (section.type === 'education') {
        return {
          ...section,
          groups: section.groups.map((g) => ({
            ...g,
            subgroups: g.subgroups.map((sg) => ({
              ...sg,
              qualifications: sg.qualifications.map((q) => ({
                ...q,
                items: pruneBlankStrings(q.items),
              })),
            })),
          })),
        };
      }
      return section;
    }),
  };
}

function BuildCvDialog({ open, onClose, jobId, cvWord, onSave }) {
  const [stage, setStage] = useState('configure');
  const [recentCount, setRecentCount] = useState(DEFAULT_RECENT_ROLES);
  const [recentMode, setRecentMode] = useState('roles');
  const [cv, setCv] = useState(null);
  const [templateId, setTemplateId] = useState(CV_TEMPLATES[0].id);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [includePhoto, setIncludePhoto] = useState(false);
  const [fontFamily, setFontFamily] = useState('helvetica');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [librarySkills, setLibrarySkills] = useState([]);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [newSkillText, setNewSkillText] = useState('');
  const [addingSkill, setAddingSkill] = useState(false);

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
    setFontFamily('helvetica');
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
    setSkillPickerOpen(false);
    setNewSkillText('');
  }, [open]);

  // The full skills library, independent of whatever build-cv selected —
  // needed so the skills picker (below) can show what got left out.
  useEffect(() => {
    if (!open) return;

    async function loadLibrarySkills() {
      const { data } = await supabase
        .from('cv_skills')
        .select('id, skill_text')
        .order('created_at', { ascending: true });
      setLibrarySkills(data ?? []);
    }

    loadLibrarySkills();
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

  // Adds a skill (already-known text, from a library badge or a
  // deduplicated free-text entry) to the skills section's live build list —
  // skipping it if it's already there rather than adding a visible duplicate.
  function addSkillToBuild(sectionIndex, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setCv((c) => {
      const section = c.sections[sectionIndex];
      if (section.items.some((t) => t.trim().toLowerCase() === trimmed.toLowerCase())) {
        return c;
      }
      return {
        ...c,
        sections: c.sections.map((s, i) =>
          i === sectionIndex ? { ...s, items: [...s.items, trimmed] } : s,
        ),
      };
    });
  }

  // Free-text entry in the skills picker: reuse a matching library skill if
  // one already exists (avoids inserting a duplicate row into cv_skills),
  // otherwise save it as a brand-new permanent library skill and add it to
  // this build too.
  async function handleAddNewSkill(sectionIndex) {
    const trimmed = newSkillText.trim();
    if (!trimmed) return;

    const existing = librarySkills.find(
      (s) => s.skill_text.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      addSkillToBuild(sectionIndex, existing.skill_text);
      setNewSkillText('');
      return;
    }

    setAddingSkill(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Not signed in.');
      setAddingSkill(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from('cv_skills')
      .insert({ user_id: user.id, skill_text: trimmed })
      .select('id, skill_text')
      .single();

    if (insertError) {
      setError(insertError.message);
      setAddingSkill(false);
      return;
    }

    setLibrarySkills((list) => [...list, data]);
    addSkillToBuild(sectionIndex, trimmed);
    setNewSkillText('');
    setAddingSkill(false);
  }

  // Education entries are grouped three deep — level, then establishment+
  // year sub-subsection, then the individual qualification — rather than a
  // flat entries array. These mirror updateEntry/removeEntry above but
  // address a qualification within its group/subgroup. Removing the last
  // qualification in a subgroup drops the subgroup, and the last subgroup
  // in a group drops the group too.
  function updateEducationQualification(sectionIndex, groupIndex, subgroupIndex, qualIndex, patch) {
    setCv((c) => ({
      ...c,
      sections: c.sections.map((s, i) =>
        i === sectionIndex
          ? {
              ...s,
              groups: s.groups.map((g, j) =>
                j === groupIndex
                  ? {
                      ...g,
                      subgroups: g.subgroups.map((sg, k) =>
                        k === subgroupIndex
                          ? {
                              ...sg,
                              qualifications: sg.qualifications.map((q, l) =>
                                l === qualIndex ? { ...q, ...patch } : q,
                              ),
                            }
                          : sg,
                      ),
                    }
                  : g,
              ),
            }
          : s,
      ),
    }));
  }

  function removeEducationQualification(sectionIndex, groupIndex, subgroupIndex, qualIndex) {
    setCv((c) => ({
      ...c,
      sections: c.sections.map((s, i) =>
        i === sectionIndex
          ? {
              ...s,
              groups: s.groups
                .map((g, j) =>
                  j === groupIndex
                    ? {
                        ...g,
                        subgroups: g.subgroups
                          .map((sg, k) =>
                            k === subgroupIndex
                              ? {
                                  ...sg,
                                  qualifications: sg.qualifications.filter(
                                    (_, l) => l !== qualIndex,
                                  ),
                                }
                              : sg,
                          )
                          .filter((sg) => sg.qualifications.length > 0),
                      }
                    : g,
                )
                .filter((g) => g.subgroups.length > 0),
            }
          : s,
      ),
    }));
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
      const blob = await renderCvPdf(
        pruneCvBlanks(cv),
        template,
        paletteIndex,
        photoDataUrl,
        fontFamily,
      );
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
  }, [templateId, paletteIndex, includePhoto, fontFamily]);

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

    const cleanCv = pruneCvBlanks(cv);

    let pdfBlob;
    try {
      const photoDataUrl = await getPhotoDataUrl();
      pdfBlob = await renderCvPdf(cleanCv, template, paletteIndex, photoDataUrl, fontFamily);
    } catch {
      setError('Failed to render the CV.');
      setSaving(false);
      return;
    }

    const plainText = cvToPlainText(cleanCv);
    const namePart = sanitizeFileNamePart(cv.name || 'CV') || 'CV';
    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const baseName = `${namePart}_cv_${mmdd}`;
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
        <div className="build-cv-dialog-header">
          <h2>Build {cvWord}</h2>
          {stage === 'template' && cv && (
            <>
              <div className="theme-toggle" role="radiogroup" aria-label="Font">
                <button
                  type="button"
                  role="radio"
                  aria-checked={fontFamily === 'helvetica'}
                  className={
                    'theme-toggle-option' +
                    (fontFamily === 'helvetica' ? ' theme-toggle-option-active' : '')
                  }
                  onClick={() => setFontFamily('helvetica')}
                >
                  Sans-serif
                </button>
                {Object.entries(FONT_FAMILIES).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={fontFamily === key}
                    className={
                      'theme-toggle-option' +
                      (fontFamily === key ? ' theme-toggle-option-active' : '')
                    }
                    onClick={() => setFontFamily(key)}
                  >
                    {config.label}
                  </button>
                ))}
              </div>
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
            </>
          )}
        </div>

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
                  {(section.type === 'custom' || section.type === 'links') && (
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
                  <>
                    <BulletListEditor
                      items={toEditableList(section.items)}
                      onChange={(items) =>
                        updateSection(sIndex, { items: fromEditableList(items) })
                      }
                      addLabel={skillPickerOpen ? 'Close' : 'Add skill'}
                      variant="compact"
                      rows={1}
                      onAddClick={() => setSkillPickerOpen((o) => !o)}
                    />
                    {skillPickerOpen && (
                      <div className="skill-picker">
                        {(() => {
                          const selectedLower = new Set(
                            section.items.map((t) => t.trim().toLowerCase()),
                          );
                          const omitted = librarySkills.filter(
                            (s) => !selectedLower.has(s.skill_text.trim().toLowerCase()),
                          );
                          return omitted.length > 0 ? (
                            <div className="skill-picker-badges">
                              {omitted.map((s) => (
                                <button
                                  type="button"
                                  key={s.id}
                                  className="skill-picker-badge"
                                  onClick={() => addSkillToBuild(sIndex, s.skill_text)}
                                >
                                  {s.skill_text}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="field-hint">
                              Every library skill is already in this build.
                            </p>
                          );
                        })()}
                        <div className="skill-picker-new">
                          <input
                            type="text"
                            placeholder="Add a new skill…"
                            value={newSkillText}
                            onChange={(e) => setNewSkillText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddNewSkill(sIndex);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="button-outline"
                            disabled={addingSkill || !newSkillText.trim()}
                            onClick={() => handleAddNewSkill(sIndex)}
                          >
                            {addingSkill ? 'Adding…' : 'Add'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
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
                  section.groups.map((group, gIndex) => (
                    <div key={group.id} className="cv-review-group">
                      {group.subgroups.map((subgroup, sgIndex) => (
                        <div key={subgroup.id} className="cv-review-subgroup">
                          <div className="cv-review-subgroup-header">{subgroup.header}</div>
                          {subgroup.qualifications.map((qual, qIndex) => (
                            <div key={qual.id} className="cv-review-entry">
                              <div className="cv-review-entry-header">
                                <span className="item-name-primary">
                                  {qual.detail || '(no subject/grade)'}
                                </span>
                                <button
                                  type="button"
                                  className="button-outline item-delete"
                                  onClick={() =>
                                    removeEducationQualification(sIndex, gIndex, sgIndex, qIndex)
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                              <BulletListEditor
                                items={toEditableList(qual.items)}
                                onChange={(items) =>
                                  updateEducationQualification(sIndex, gIndex, sgIndex, qIndex, {
                                    items: fromEditableList(items),
                                  })
                                }
                                addLabel="Add detail"
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}

                {section.type === 'certification' &&
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

                {section.type === 'links' && (
                  <ul className="cv-review-links">
                    {section.items.map((item) => (
                      <li key={item.label}>
                        {item.label}: {item.url}
                      </li>
                    ))}
                  </ul>
                )}

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
            <div className="cv-template-header-row">
              <label>Template</label>
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
            </div>
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
                    // Persist the actual selected color across the switch —
                    // matched by accent hex (not index), since it's the
                    // color's real identity; falls back to the first swatch
                    // only if the new template genuinely doesn't offer it.
                    const currentAccent = template.palettes[paletteIndex]?.accent;
                    const matchedIndex = t.palettes.findIndex(
                      (p) => p.accent === currentAccent,
                    );
                    setTemplateId(t.id);
                    setPaletteIndex(matchedIndex >= 0 ? matchedIndex : 0);
                  }}
                >
                  <CvTemplateThumbnail template={t} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>


            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="button-outline"
                onClick={previewUrl ? clearPreview : handlePreview}
                disabled={previewing}
              >
                {previewing ? 'Rendering…' : previewUrl ? 'Close Preview' : 'Preview'}
              </button>
            </div>

            {previewUrl && (
              <>
                {CAN_PREVIEW_INLINE && (
                  <iframe title="CV preview" src={previewUrl} className="cv-preview-frame" />
                )}
                {/* On browsers that can't render the iframe inline, this is
                    the only way to see the preview — and even where the
                    iframe does work, it's a reliable fallback (Android
                    auto-download-from-iframe is flaky for blob: URLs). */}
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button-outline cv-preview-open-link"
                >
                  Open preview in a new tab
                </a>
              </>
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
                onClick={() => {
                  // Content edits made after going back don't auto-refresh
                  // an already-open preview (unlike template/palette/photo,
                  // re-rendering on every keystroke would be wasteful) — so
                  // clear it here rather than risk showing stale content
                  // silently when the user returns to this stage.
                  clearPreview();
                  setStage('review');
                }}
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
