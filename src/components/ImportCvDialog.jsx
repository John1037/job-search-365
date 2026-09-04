import { useEffect, useState } from 'react';
import Modal from './Modal';
import LoadingBar from './LoadingBar';
import BulletListEditor from './BulletListEditor';
import { supabase } from '../supabaseClient';
import { formatCvDateRange } from '../jobFormat';

function toEditableList(strings) {
  return strings.map((text, i) => ({ id: `item-${i}`, text }));
}

function fromEditableList(items) {
  return items.map((it) => it.text).filter((t) => t.trim());
}

// Chunked to avoid a call-stack blowup from String.fromCharCode(...bytes)
// on a large file.
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function toggleIncluded(setList, index) {
  setList((list) => list.map((e, i) => (i === index ? { ...e, included: !e.included } : e)));
}

function updateEntryList(setList, index, field, items) {
  setList((list) => list.map((e, i) => (i === index ? { ...e, [field]: items } : e)));
}

function ImportCvDialog({ open, onClose, onImported, existingSkills, existingProfileSummary }) {
  const [stage, setStage] = useState('upload');
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [profileSummary, setProfileSummary] = useState('');
  const [includeProfileSummary, setIncludeProfileSummary] = useState(false);
  const [skillItems, setSkillItems] = useState([]);
  const [experienceEntries, setExperienceEntries] = useState([]);
  const [educationEntries, setEducationEntries] = useState([]);
  const [certificationEntries, setCertificationEntries] = useState([]);

  useEffect(() => {
    if (!open) return;
    setStage('upload');
    setFile(null);
    setError(null);
    setProfileSummary('');
    setIncludeProfileSummary(false);
    setSkillItems([]);
    setExperienceEntries([]);
    setEducationEntries([]);
    setCertificationEntries([]);
  }, [open]);

  async function handleExtract() {
    if (!file) return;
    setExtracting(true);
    setError(null);

    try {
      const file_base64 = await fileToBase64(file);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError('Not signed in.');
        setExtracting(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke('import-cv', {
        body: { file_name: file.name, file_base64 },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) {
        setError(fnError.message);
        setExtracting(false);
        return;
      }

      const extracted = data.extracted;
      const existingLower = new Set(
        (existingSkills ?? []).map((s) => s.trim().toLowerCase()),
      );

      // Never silently overwrite an existing summary the user already
      // wrote — default the checkbox on only if there's nothing there yet;
      // otherwise it's shown but off, so replacing it is a deliberate choice.
      setProfileSummary(extracted.profile_summary ?? '');
      setIncludeProfileSummary(
        !!extracted.profile_summary && !existingProfileSummary?.trim(),
      );

      setSkillItems(
        toEditableList(
          extracted.skills.filter((s) => !existingLower.has(s.trim().toLowerCase())),
        ),
      );
      setExperienceEntries(
        extracted.experience.map((e) => ({
          ...e,
          included: true,
          bullets: toEditableList(e.bullets),
        })),
      );
      setEducationEntries(
        extracted.education.map((e) => ({
          ...e,
          included: true,
          items: toEditableList(e.items),
        })),
      );
      setCertificationEntries(
        extracted.certifications.map((c) => ({
          ...c,
          included: true,
          items: toEditableList(c.items),
        })),
      );

      setStage('review');
    } catch {
      setError('Failed to read the file.');
    }

    setExtracting(false);
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

    if (includeProfileSummary && profileSummary.trim()) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ cv_summary: profileSummary.trim() })
        .eq('id', user.id);

      if (profileError) {
        setError(profileError.message);
        setSaving(false);
        return;
      }
    }

    const newSkills = fromEditableList(skillItems);
    if (newSkills.length > 0) {
      const { error: skillsError } = await supabase
        .from('cv_skills')
        .insert(newSkills.map((skill_text) => ({ user_id: user.id, skill_text })));

      if (skillsError) {
        setError(skillsError.message);
        setSaving(false);
        return;
      }
    }

    for (const entry of experienceEntries.filter((e) => e.included)) {
      const { data: inserted, error: insertError } = await supabase
        .from('cv_experience')
        .insert({
          user_id: user.id,
          job_title: entry.job_title,
          employer: entry.employer,
          location: entry.location,
          start_year: entry.start_year,
          start_month: entry.start_month,
          end_year: entry.is_current ? null : entry.end_year,
          end_month: entry.is_current ? null : entry.end_month,
          is_current: entry.is_current,
        })
        .select('id')
        .single();

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      const bulletRows = fromEditableList(entry.bullets).map((bullet_text, index) => ({
        experience_id: inserted.id,
        user_id: user.id,
        bullet_text,
        sort_order: index,
      }));
      if (bulletRows.length > 0) {
        const { error: bulletsError } = await supabase
          .from('cv_experience_bullets')
          .insert(bulletRows);
        if (bulletsError) {
          setError(bulletsError.message);
          setSaving(false);
          return;
        }
      }
    }

    for (const entry of educationEntries.filter((e) => e.included)) {
      const { data: inserted, error: insertError } = await supabase
        .from('cv_education')
        .insert({
          user_id: user.id,
          establishment: entry.establishment,
          level: entry.level,
          subject: entry.subject,
          grade: entry.grade,
          qualification_year: entry.qualification_year,
        })
        .select('id')
        .single();

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      const itemRows = fromEditableList(entry.items).map((detail_text, index) => ({
        education_id: inserted.id,
        user_id: user.id,
        detail_text,
        sort_order: index,
      }));
      if (itemRows.length > 0) {
        const { error: itemsError } = await supabase
          .from('cv_education_items')
          .insert(itemRows);
        if (itemsError) {
          setError(itemsError.message);
          setSaving(false);
          return;
        }
      }
    }

    for (const entry of certificationEntries.filter((c) => c.included)) {
      const { data: inserted, error: insertError } = await supabase
        .from('cv_certifications')
        .insert({
          user_id: user.id,
          issuer: entry.issuer,
          title: entry.title,
          location: entry.location,
          start_year: entry.start_year,
          start_month: entry.start_month,
          end_year: entry.is_current ? null : entry.end_year,
          end_month: entry.is_current ? null : entry.end_month,
          is_current: entry.is_current,
        })
        .select('id')
        .single();

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      const itemRows = fromEditableList(entry.items).map((detail_text, index) => ({
        certification_id: inserted.id,
        user_id: user.id,
        detail_text,
        sort_order: index,
      }));
      if (itemRows.length > 0) {
        const { error: itemsError } = await supabase
          .from('cv_certification_items')
          .insert(itemRows);
        if (itemsError) {
          setError(itemsError.message);
          setSaving(false);
          return;
        }
      }
    }

    setSaving(false);
    onImported();
  }

  const includedExperienceCount = experienceEntries.filter((e) => e.included).length;
  const includedEducationCount = educationEntries.filter((e) => e.included).length;
  const includedCertificationCount = certificationEntries.filter((c) => c.included).length;
  const nothingSelected =
    !includeProfileSummary &&
    skillItems.length === 0 &&
    includedExperienceCount === 0 &&
    includedEducationCount === 0 &&
    includedCertificationCount === 0;

  return (
    <Modal open={open} onClose={onClose}>
      <div
        className="confirm-dialog profile-form build-cv-dialog"
        role="dialog"
        aria-modal="true"
      >
        <h2>Import from an existing CV</h2>

        {stage === 'upload' && (
          <>
            <p className="field-hint">
              Upload a .pdf or .docx CV and we'll pull out a profile summary,
              skills, experience, education and certifications for you to
              review before anything is added to your library. Sidebar and
              multi-column layouts are handled too — the one thing that
              can't be read is a scanned/image-only PDF with no actual text.
            </p>
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </>
        )}

        {extracting && (
          <>
            <p>Reading your CV…</p>
            <LoadingBar />
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        {stage === 'review' && (
          <div className="cv-review">
            {nothingSelected && (
              <p className="empty-list-hint">
                Nothing new was found to import — everything may already be
                in your library.
              </p>
            )}

            {profileSummary.trim() && (
              <div className="cv-review-section">
                <div className="cv-review-section-header">
                  <h3>Profile summary</h3>
                </div>
                <label className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={includeProfileSummary}
                    onChange={(e) => setIncludeProfileSummary(e.target.checked)}
                  />
                  {existingProfileSummary?.trim()
                    ? 'Replace your existing profile summary with this'
                    : 'Use this as your profile summary'}
                </label>
                {includeProfileSummary && (
                  <textarea
                    rows={4}
                    value={profileSummary}
                    onChange={(e) => setProfileSummary(e.target.value)}
                  />
                )}
              </div>
            )}

            {skillItems.length > 0 && (
              <div className="cv-review-section">
                <div className="cv-review-section-header">
                  <h3>Skills</h3>
                </div>
                <BulletListEditor
                  items={skillItems}
                  onChange={setSkillItems}
                  addLabel="Add skill"
                  variant="compact"
                  rows={1}
                />
              </div>
            )}

            {experienceEntries.length > 0 && (
              <div className="cv-review-section">
                <div className="cv-review-section-header">
                  <h3>Experience</h3>
                </div>
                {experienceEntries.map((entry, index) => (
                  <div key={index} className="cv-review-entry">
                    <div className="cv-review-entry-header">
                      <label className="filter-checkbox">
                        <input
                          type="checkbox"
                          checked={entry.included}
                          onChange={() => toggleIncluded(setExperienceEntries, index)}
                        />
                      </label>
                      <div className="cv-review-entry-text">
                        <span className="item-name-primary">
                          {entry.job_title} — {entry.employer}
                        </span>
                        <span className="item-meta">{formatCvDateRange(entry)}</span>
                      </div>
                    </div>
                    {entry.included && (
                      <BulletListEditor
                        items={entry.bullets}
                        onChange={(items) =>
                          updateEntryList(setExperienceEntries, index, 'bullets', items)
                        }
                        addLabel="Add bullet"
                        rows={3}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {educationEntries.length > 0 && (
              <div className="cv-review-section">
                <div className="cv-review-section-header">
                  <h3>Education</h3>
                </div>
                {educationEntries.map((entry, index) => (
                  <div key={index} className="cv-review-entry">
                    <div className="cv-review-entry-header">
                      <label className="filter-checkbox">
                        <input
                          type="checkbox"
                          checked={entry.included}
                          onChange={() => toggleIncluded(setEducationEntries, index)}
                        />
                      </label>
                      <div className="cv-review-entry-text">
                        <span className="item-name-primary">
                          {[entry.level, entry.subject].filter(Boolean).join(', ')} —{' '}
                          {entry.establishment}
                        </span>
                        <span className="item-meta">{entry.qualification_year}</span>
                      </div>
                    </div>
                    {entry.included && (
                      <BulletListEditor
                        items={entry.items}
                        onChange={(items) =>
                          updateEntryList(setEducationEntries, index, 'items', items)
                        }
                        addLabel="Add detail"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {certificationEntries.length > 0 && (
              <div className="cv-review-section">
                <div className="cv-review-section-header">
                  <h3>Certifications</h3>
                </div>
                {certificationEntries.map((entry, index) => (
                  <div key={index} className="cv-review-entry">
                    <div className="cv-review-entry-header">
                      <label className="filter-checkbox">
                        <input
                          type="checkbox"
                          checked={entry.included}
                          onChange={() => toggleIncluded(setCertificationEntries, index)}
                        />
                      </label>
                      <div className="cv-review-entry-text">
                        <span className="item-name-primary">
                          {entry.title} — {entry.issuer}
                        </span>
                        <span className="item-meta">
                          {entry.start_year ? formatCvDateRange(entry) : ''}
                        </span>
                      </div>
                    </div>
                    {entry.included && (
                      <BulletListEditor
                        items={entry.items}
                        onChange={(items) =>
                          updateEntryList(setCertificationEntries, index, 'items', items)
                        }
                        addLabel="Add detail"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="confirm-dialog-actions">
          {stage === 'upload' && (
            <>
              <button type="button" className="button-outline" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="button-positive"
                disabled={!file || extracting}
                onClick={handleExtract}
              >
                {extracting ? 'Reading…' : 'Import'}
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
                disabled={saving || nothingSelected}
                onClick={handleSave}
              >
                {saving ? 'Saving…' : 'Add to library'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ImportCvDialog;
