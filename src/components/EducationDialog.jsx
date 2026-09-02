import { useEffect, useState } from 'react';
import Modal from './Modal';
import BulletListEditor from './BulletListEditor';
import { supabase } from '../supabaseClient';

const CURRENT_YEAR = new Date().getFullYear();

function EducationDialog({ open, onClose, onSaved, education }) {
  const [establishment, setEstablishment] = useState('');
  const [level, setLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [qualificationYear, setQualificationYear] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;

    setError(null);

    if (!education) {
      setEstablishment('');
      setLevel('');
      setSubject('');
      setGrade('');
      setQualificationYear('');
      setItems([]);
      return;
    }

    setEstablishment(education.establishment);
    setLevel(education.level);
    setSubject(education.subject ?? '');
    setGrade(education.grade ?? '');
    setQualificationYear(education.qualification_year ? String(education.qualification_year) : '');

    async function loadItems() {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from('cv_education_items')
        .select('id, detail_text')
        .eq('education_id', education.id)
        .order('sort_order', { ascending: true });

      if (loadError) {
        setError(loadError.message);
      } else {
        setItems((data ?? []).map((it) => ({ id: it.id, text: it.detail_text })));
      }
      setLoading(false);
    }

    loadItems();
  }, [open, education]);

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
      establishment,
      level,
      subject: subject || null,
      grade: grade || null,
      qualification_year: qualificationYear ? Number(qualificationYear) : null,
    };

    let educationId = education?.id;

    if (educationId) {
      const { error: updateError } = await supabase
        .from('cv_education')
        .update(payload)
        .eq('id', educationId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('cv_education')
        .insert(payload)
        .select('id')
        .single();

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
      educationId = data.id;
    }

    const { error: deleteError } = await supabase
      .from('cv_education_items')
      .delete()
      .eq('education_id', educationId);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    const itemRows = items
      .map((it) => it.text.trim())
      .filter(Boolean)
      .map((text, index) => ({
        education_id: educationId,
        user_id: user.id,
        detail_text: text,
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

    setSaving(false);
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form
        className="confirm-dialog profile-form cv-entry-dialog"
        onSubmit={handleSubmit}
      >
        <h2>{education ? 'Edit education' : 'Add education'}</h2>

        <label htmlFor="eduEstablishment">Educational establishment</label>
        <input
          id="eduEstablishment"
          type="text"
          placeholder="e.g. University of Manchester"
          value={establishment}
          onChange={(e) => setEstablishment(e.target.value)}
          required
        />

        <label htmlFor="eduLevel">Educational level</label>
        <input
          id="eduLevel"
          type="text"
          placeholder="e.g. BSc, A-level, GCSE"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          required
        />

        <label htmlFor="eduSubject">Subject (optional)</label>
        <input
          id="eduSubject"
          type="text"
          placeholder="e.g. Mathematics, Philosophy, Electronics Engineering"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <div className="form-row-pair">
          <div className="form-field">
            <label htmlFor="eduGrade">Grade (optional)</label>
            <input
              id="eduGrade"
              type="text"
              placeholder="e.g. Second Class, B, A*"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="eduYear">Year qualified</label>
            <input
              id="eduYear"
              type="number"
              min="1950"
              max={CURRENT_YEAR}
              value={qualificationYear}
              onChange={(e) => setQualificationYear(e.target.value)}
              required
            />
          </div>
        </div>

        <label>Additional information</label>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <BulletListEditor
            items={items}
            onChange={setItems}
            addLabel="Add detail"
            rows={3}
          />
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

export default EducationDialog;
