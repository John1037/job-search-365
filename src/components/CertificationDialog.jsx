import { useEffect, useState } from 'react';
import Modal from './Modal';
import BulletListEditor from './BulletListEditor';
import { supabase } from '../supabaseClient';
import { MONTH_ABBR } from '../jobFormat';

const CURRENT_YEAR = new Date().getFullYear();

function CertificationDialog({ open, onClose, onSaved, certification }) {
  const [issuer, setIssuer] = useState('');
  const [title, setTitle] = useState('');
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

    if (!certification) {
      setIssuer('');
      setTitle('');
      setLocation('');
      setStartYear('');
      setStartMonth('');
      setEndYear('');
      setEndMonth('');
      setIsCurrent(false);
      setItems([]);
      return;
    }

    setIssuer(certification.issuer);
    setTitle(certification.title);
    setLocation(certification.location ?? '');
    setStartYear(certification.start_year ? String(certification.start_year) : '');
    setStartMonth(certification.start_month ? String(certification.start_month) : '');
    setEndYear(certification.end_year ? String(certification.end_year) : '');
    setEndMonth(certification.end_month ? String(certification.end_month) : '');
    setIsCurrent(certification.is_current);

    async function loadItems() {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from('cv_certification_items')
        .select('id, detail_text')
        .eq('certification_id', certification.id)
        .order('sort_order', { ascending: true });

      if (loadError) {
        setError(loadError.message);
      } else {
        setItems((data ?? []).map((it) => ({ id: it.id, text: it.detail_text })));
      }
      setLoading(false);
    }

    loadItems();
  }, [open, certification]);

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
      issuer,
      title,
      location: location || null,
      start_year: startYear ? Number(startYear) : null,
      start_month: startMonth ? Number(startMonth) : null,
      end_year: isCurrent ? null : endYear ? Number(endYear) : null,
      end_month: isCurrent ? null : endMonth ? Number(endMonth) : null,
      is_current: isCurrent,
    };

    let certificationId = certification?.id;

    if (certificationId) {
      const { error: updateError } = await supabase
        .from('cv_certifications')
        .update(payload)
        .eq('id', certificationId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('cv_certifications')
        .insert(payload)
        .select('id')
        .single();

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
      certificationId = data.id;
    }

    const { error: deleteError } = await supabase
      .from('cv_certification_items')
      .delete()
      .eq('certification_id', certificationId);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    const itemRows = items
      .map((it) => it.text.trim())
      .filter(Boolean)
      .map((text, index) => ({
        certification_id: certificationId,
        user_id: user.id,
        detail_text: text,
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

    setSaving(false);
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form
        className="confirm-dialog profile-form cv-entry-dialog"
        onSubmit={handleSubmit}
      >
        <h2>{certification ? 'Edit certification' : 'Add certification'}</h2>

        <label htmlFor="certIssuer">Issuing organization</label>
        <input
          id="certIssuer"
          type="text"
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          required
        />

        <label htmlFor="certTitle">Certification</label>
        <input
          id="certTitle"
          type="text"
          placeholder="e.g. AWS Certified Solutions Architect"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <label htmlFor="certLocation">Location (optional)</label>
        <input
          id="certLocation"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <div className="form-row-pair">
          <div className="form-field">
            <label htmlFor="certStartYear">Start year (optional)</label>
            <input
              id="certStartYear"
              type="number"
              min="1950"
              max={CURRENT_YEAR}
              value={startYear}
              onChange={(e) => setStartYear(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="certStartMonth">Start month (optional)</label>
            <select
              id="certStartMonth"
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
          Does not expire / currently valid
        </label>

        {!isCurrent && (
          <div className="form-row-pair">
            <div className="form-field">
              <label htmlFor="certEndYear">End year</label>
              <input
                id="certEndYear"
                type="number"
                min="1950"
                max={CURRENT_YEAR}
                value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="certEndMonth">End month (optional)</label>
              <select
                id="certEndMonth"
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

        <label>Details</label>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <BulletListEditor
            items={items}
            onChange={setItems}
            addLabel="Add detail"
            placeholder="e.g. Credential ID ABC-12345"
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

export default CertificationDialog;
