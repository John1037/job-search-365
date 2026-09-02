import { useEffect, useState } from 'react';
import Modal from './Modal';
import { supabase } from '../supabaseClient';

function CustomSectionDialog({ open, onClose, onSaved, section }) {
  const [heading, setHeading] = useState('');
  const [introText, setIntroText] = useState('');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState('paragraph');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setHeading(section?.heading ?? '');
    setIntroText(section?.intro_text ?? '');
    setContent(section?.content ?? '');
    setFormat(section?.format ?? 'paragraph');
  }, [open, section]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Not signed in.');
      setSaving(false);
      return;
    }

    const payload = {
      user_id: user.id,
      heading,
      intro_text: format === 'bullets' ? introText || null : null,
      content,
      format,
    };

    const { error: saveError } = section
      ? await supabase.from('cv_custom_sections').update(payload).eq('id', section.id)
      : await supabase.from('cv_custom_sections').insert(payload);

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form
        className="confirm-dialog profile-form event-dialog"
        onSubmit={handleSubmit}
      >
        <h2>{section ? 'Edit section' : 'Add section'}</h2>

        <label htmlFor="sectionHeading">Heading</label>
        <input
          id="sectionHeading"
          type="text"
          placeholder="e.g. Certifications"
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          required
        />

        <label htmlFor="sectionFormat">Format</label>
        <select
          id="sectionFormat"
          className="profile-select"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="paragraph">Paragraph</option>
          <option value="bullets">Bullet list (one per line)</option>
        </select>

        {format === 'bullets' && (
          <>
            <label htmlFor="sectionIntro">
              Introduction (optional, shown above the list)
            </label>
            <textarea
              id="sectionIntro"
              rows={2}
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
            />
          </>
        )}

        <label htmlFor="sectionContent">Content</label>
        <textarea
          id="sectionContent"
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
        {format === 'bullets' && (
          <p className="field-hint">
            Tip: a line like "Automation &amp; CRM: Zendesk, Freshdesk,
            Klaviyo" renders with the part before the colon bolded as a
            sub-header.
          </p>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="confirm-dialog-actions">
          <button type="button" className="button-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button-positive" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default CustomSectionDialog;
