import { useEffect, useState } from 'react';
import Modal from './Modal';
import BulletListEditor from './BulletListEditor';
import { supabase } from '../supabaseClient';
import { MONTH_ABBR } from '../jobFormat';

const CURRENT_YEAR = new Date().getFullYear();

function EducationDialog({ open, onClose, onSaved, education }) {
  const [institution, setInstitution] = useState('');
  const [qualificationTitle, setQualificationTitle] = useState('');
  const [location, setLocation] = useState('');
  const [startYear, setStartYear] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [endYear, setEndYear] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;

    setError(null);

    if (!education) {
      setInstitution('');
      setQualificationTitle('');
      setLocation('');
      setStartYear('');
      setStartMonth('');
      setEndYear('');
      setEndMonth('');
      setIsCurrent(false);
      setItems([]);
      return;
    }

    setInstitution(education.institution);
    setQualificationTitle(education.qualification_title);
    setLocation(education.location ?? '');
    setStartYear(education.start_year ? String(education.start_year) : '');
    setStartMonth(education.start_month ? String(education.start_month) : '');
    setEndYear(education.end_year ? String(education.end_year) : '');
    setEndMonth(education.end_month ? String(education.end_month) : '');
    setIsCurrent(education.is_current);

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
      institution,
      qualification_title: qualificationTitle,
      location: location || null,
      start_year: startYear ? Number(startYear) : null,
      start_month: startMonth ? Number(startMonth) : null,
      end_year: isCurrent ? null : endYear ? Number(endYear) : null,
      end_month: isCurrent ? null : endMonth ? Number(endMonth) : null,
      is_current: isCurrent,
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

        <label htmlFor="eduInstitution">Institution</label>
        <input
          id="eduInstitution"
          type="text"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          required
        />

        <label htmlFor="eduQualification">Qualification</label>
        <input
          id="eduQualification"
          type="text"
          placeholder="e.g. BSc Computer Science"
          value={qualificationTitle}
          onChange={(e) => setQualificationTitle(e.target.value)}
          required
        />

        <label htmlFor="eduLocation">Location (optional)</label>
        <input
          id="eduLocation"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <div className="form-row-pair">
          <div className="form-field">
            <label htmlFor="eduStartYear">Start year (optional)</label>
            <input
              id="eduStartYear"
              type="number"
              min="1950"
              max={CURRENT_YEAR}
              value={startYear}
              onChange={(e) => setStartYear(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="eduStartMonth">Start month (optional)</label>
            <select
              id="eduStartMonth"
              className="profile-select"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
            >
              <option value="">Not specified</option>
              {MONTH_ABBR.map((abbr, i) => (
                <option key={abbr} value={i + 1}>
                  {abbr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={isCurrent}
            onChange={(e) => setIsCurrent(e.target.checked)}
          />
          I'm currently studying here
        </label>

        {!isCurrent && (
          <div className="form-row-pair">
            <div className="form-field">
              <label htmlFor="eduEndYear">End year</label>
              <input
                id="eduEndYear"
                type="number"
                min="1950"
                max={CURRENT_YEAR}
                value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="eduEndMonth">End month (optional)</label>
              <select
                id="eduEndMonth"
                className="profile-select"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
              >
                <option value="">Not specified</option>
                {MONTH_ABBR.map((abbr, i) => (
                  <option key={abbr} value={i + 1}>
                    {abbr}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <label>Qualification details</label>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <BulletListEditor
            items={items}
            onChange={setItems}
            addLabel="Add detail"
            placeholder="e.g. First class honours"
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
