import { useEffect, useState } from 'react';
import Modal from './Modal';
import BulletListEditor from './BulletListEditor';
import { supabase } from '../supabaseClient';
import { MONTH_ABBR } from '../jobFormat';

const CURRENT_YEAR = new Date().getFullYear();

function ExperienceDialog({ open, onClose, onSaved, experience }) {
  const [jobTitle, setJobTitle] = useState('');
  const [employer, setEmployer] = useState('');
  const [location, setLocation] = useState('');
  const [startYear, setStartYear] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [endYear, setEndYear] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);
  const [bullets, setBullets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;

    setError(null);

    if (!experience) {
      setJobTitle('');
      setEmployer('');
      setLocation('');
      setStartYear('');
      setStartMonth('');
      setEndYear('');
      setEndMonth('');
      setIsCurrent(false);
      setBullets([]);
      return;
    }

    setJobTitle(experience.job_title);
    setEmployer(experience.employer);
    setLocation(experience.location ?? '');
    setStartYear(String(experience.start_year));
    setStartMonth(experience.start_month ? String(experience.start_month) : '');
    setEndYear(experience.end_year ? String(experience.end_year) : '');
    setEndMonth(experience.end_month ? String(experience.end_month) : '');
    setIsCurrent(experience.is_current);

    async function loadBullets() {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from('cv_experience_bullets')
        .select('id, bullet_text')
        .eq('experience_id', experience.id)
        .order('sort_order', { ascending: true });

      if (loadError) {
        setError(loadError.message);
      } else {
        setBullets(
          (data ?? []).map((b) => ({ id: b.id, text: b.bullet_text })),
        );
      }
      setLoading(false);
    }

    loadBullets();
  }, [open, experience]);

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
      job_title: jobTitle,
      employer,
      location: location || null,
      start_year: Number(startYear),
      start_month: startMonth ? Number(startMonth) : null,
      end_year: isCurrent ? null : endYear ? Number(endYear) : null,
      end_month: isCurrent ? null : endMonth ? Number(endMonth) : null,
      is_current: isCurrent,
    };

    let experienceId = experience?.id;

    if (experienceId) {
      const { error: updateError } = await supabase
        .from('cv_experience')
        .update(payload)
        .eq('id', experienceId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('cv_experience')
        .insert(payload)
        .select('id')
        .single();

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
      experienceId = data.id;
    }

    // Simplest correct approach: replace all bullets for this entry rather
    // than diffing — nothing outside this dialog holds onto a bullet's id
    // across edits, so there's nothing to preserve.
    const { error: deleteError } = await supabase
      .from('cv_experience_bullets')
      .delete()
      .eq('experience_id', experienceId);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    const bulletRows = bullets
      .map((b) => b.text.trim())
      .filter(Boolean)
      .map((text, index) => ({
        experience_id: experienceId,
        user_id: user.id,
        bullet_text: text,
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

    setSaving(false);
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form
        className="confirm-dialog profile-form cv-entry-dialog"
        onSubmit={handleSubmit}
      >
        <h2>{experience ? 'Edit experience' : 'Add experience'}</h2>

        <label htmlFor="expJobTitle">Job title</label>
        <input
          id="expJobTitle"
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          required
        />

        <label htmlFor="expEmployer">Employer</label>
        <input
          id="expEmployer"
          type="text"
          value={employer}
          onChange={(e) => setEmployer(e.target.value)}
          required
        />

        <label htmlFor="expLocation">Location (optional)</label>
        <input
          id="expLocation"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <div className="form-row-pair">
          <div className="form-field">
            <label htmlFor="expStartYear">Start year</label>
            <input
              id="expStartYear"
              type="number"
              min="1950"
              max={CURRENT_YEAR}
              value={startYear}
              onChange={(e) => setStartYear(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="expStartMonth">Start month (optional)</label>
            <select
              id="expStartMonth"
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
          I currently work here
        </label>

        {!isCurrent && (
          <div className="form-row-pair">
            <div className="form-field">
              <label htmlFor="expEndYear">End year</label>
              <input
                id="expEndYear"
                type="number"
                min="1950"
                max={CURRENT_YEAR}
                value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="expEndMonth">End month (optional)</label>
              <select
                id="expEndMonth"
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

        <label>Achievements / responsibilities</label>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <BulletListEditor
            items={bullets}
            onChange={setBullets}
            addLabel="Add bullet"
            placeholder="e.g. Led the transformation of customer service into..."
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

export default ExperienceDialog;
