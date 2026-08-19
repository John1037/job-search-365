import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { sortedCurrencies } from '../data/currencies';
import AlertDialog from '../components/AlertDialog';

function AddJob() {
  const navigate = useNavigate();

  const [jobTitle, setJobTitle] = useState('');
  const [employer, setEmployer] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('GBP');
  const [salaryType, setSalaryType] = useState('');
  const [salaryBasis, setSalaryBasis] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [hoursPerWeek, setHoursPerWeek] = useState('');
  const [locationType, setLocationType] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showRequiredAlert, setShowRequiredAlert] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!jobTitle.trim() || !employer.trim()) {
      setShowRequiredAlert(true);
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from('jobs').insert({
      user_id: user.id,
      job_title: jobTitle,
      employer,
      salary_min: salaryMin === '' ? null : Number(salaryMin),
      salary_max: salaryMax === '' ? null : Number(salaryMax),
      salary_currency: salaryCurrency,
      salary_type: salaryType === '' ? null : salaryType,
      salary_basis: salaryBasis === '' ? null : salaryBasis,
      employment_type: employmentType === '' ? null : employmentType,
      hours_per_week:
        employmentType === 'part_time' && hoursPerWeek !== ''
          ? Number(hoursPerWeek)
          : null,
      location_type: locationType === '' ? null : locationType,
      location: locationType === 'remote' ? null : location || null,
      status: 'Interested',
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    navigate('/jobs');
  }

  return (
    <div className="page-content">
      <form className="profile-form" onSubmit={handleSubmit}>
        <h1>Add a job</h1>

        <label htmlFor="jobTitle">
          Job title <span className="required-marker">*</span>
        </label>
        <input
          id="jobTitle"
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        />

        <label htmlFor="employer">
          Employer <span className="required-marker">*</span>
        </label>
        <input
          id="employer"
          type="text"
          value={employer}
          onChange={(e) => setEmployer(e.target.value)}
        />

        <label htmlFor="salaryMin">Salary (min)</label>
        <div className="salary-field">
          <input
            id="salaryMin"
            type="number"
            min="0"
            step="0.01"
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value)}
          />
          <select
            aria-label="Currency"
            value={salaryCurrency}
            onChange={(e) => setSalaryCurrency(e.target.value)}
          >
            {sortedCurrencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>

        <label htmlFor="salaryMax">Salary (max)</label>
        <div className="salary-field">
          <input
            id="salaryMax"
            type="number"
            min="0"
            step="0.01"
            value={salaryMax}
            onChange={(e) => setSalaryMax(e.target.value)}
          />
          <select
            aria-label="Currency"
            value={salaryCurrency}
            onChange={(e) => setSalaryCurrency(e.target.value)}
          >
            {sortedCurrencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>

        <label htmlFor="salaryType">Salary type</label>
        <select
          id="salaryType"
          className="profile-select"
          value={salaryType}
          onChange={(e) => setSalaryType(e.target.value)}
        >
          <option value="">Not specified</option>
          <option value="annual">Annual</option>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="hourly">Hourly</option>
        </select>

        <label htmlFor="salaryBasis">Salary basis</label>
        <select
          id="salaryBasis"
          className="profile-select"
          value={salaryBasis}
          onChange={(e) => setSalaryBasis(e.target.value)}
        >
          <option value="">Not specified</option>
          <option value="flat">Flat</option>
          <option value="ote">OTE</option>
        </select>

        <label htmlFor="employmentType">Employment type</label>
        <select
          id="employmentType"
          className="profile-select"
          value={employmentType}
          onChange={(e) => {
            setEmploymentType(e.target.value);
            if (e.target.value !== 'part_time') setHoursPerWeek('');
          }}
        >
          <option value="">Not specified</option>
          <option value="full_time">Full time</option>
          <option value="part_time">Part time</option>
        </select>

        {employmentType === 'part_time' && (
          <>
            <label htmlFor="hoursPerWeek">Hours per week</label>
            <input
              id="hoursPerWeek"
              type="number"
              min="0"
              step="0.5"
              value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(e.target.value)}
            />
          </>
        )}

        <label htmlFor="locationType">Location type</label>
        <select
          id="locationType"
          className="profile-select"
          value={locationType}
          onChange={(e) => setLocationType(e.target.value)}
        >
          <option value="">Not specified</option>
          <option value="on_site">On-site</option>
          <option value="hybrid">Hybrid</option>
          <option value="remote">Remote</option>
        </select>

        {locationType && locationType !== 'remote' && (
          <>
            <label htmlFor="location">Location</label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="profile-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Add job'}
          </button>
          <button
            type="button"
            className="button-outline"
            onClick={() => navigate('/main')}
          >
            Cancel
          </button>
        </div>
      </form>

      <AlertDialog
        open={showRequiredAlert}
        title="Missing required fields"
        message="Job title and Employer are both required before you can add this job."
        onClose={() => setShowRequiredAlert(false)}
      />
    </div>
  );
}

export default AddJob;
