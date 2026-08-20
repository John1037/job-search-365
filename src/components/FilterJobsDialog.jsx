import { useEffect, useState } from 'react';
import Modal from './Modal';
import MultiSelectDropdown from './MultiSelectDropdown';
import { EMPTY_FILTERS } from '../jobFilters';

function CheckboxGroup({ label, options, selected, onChange }) {
  if (options.length === 0) return null;

  function toggle(value) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="filter-group">
      <h3>{label}</h3>
      <div className="filter-checkboxes">
        {options.map((opt) => (
          <label key={opt.value} className="filter-checkbox">
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function FilterJobsDialog({ open, onClose, filters, onApply, options }) {
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  function handleApply() {
    onApply(draft);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div
        className="confirm-dialog profile-form filter-dialog"
        role="dialog"
        aria-modal="true"
      >
        <h2>Filter jobs</h2>

        <CheckboxGroup
          label="Status"
          options={options.status}
          selected={draft.status}
          onChange={(status) => setDraft((d) => ({ ...d, status }))}
        />

        <div className="filter-group">
          <h3>Salary (min)</h3>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="At least…"
            value={draft.salaryMin}
            onChange={(e) =>
              setDraft((d) => ({ ...d, salaryMin: e.target.value }))
            }
          />
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={draft.salaryMinIncludeNull}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  salaryMinIncludeNull: e.target.checked,
                }))
              }
            />
            Include jobs with no salary min stated
          </label>
        </div>

        <div className="filter-group">
          <h3>Salary (max)</h3>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="At least…"
            value={draft.salaryMax}
            onChange={(e) =>
              setDraft((d) => ({ ...d, salaryMax: e.target.value }))
            }
          />
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={draft.salaryMaxIncludeNull}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  salaryMaxIncludeNull: e.target.checked,
                }))
              }
            />
            Include jobs with no salary max stated
          </label>
        </div>

        <CheckboxGroup
          label="Location type"
          options={options.locationType}
          selected={draft.locationType}
          onChange={(locationType) => setDraft((d) => ({ ...d, locationType }))}
        />

        <MultiSelectDropdown
          label="Location"
          options={options.location}
          selected={draft.location}
          onChange={(location) => setDraft((d) => ({ ...d, location }))}
        />

        <CheckboxGroup
          label="Employment type"
          options={options.employmentType}
          selected={draft.employmentType}
          onChange={(employmentType) =>
            setDraft((d) => ({ ...d, employmentType }))
          }
        />

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="button-outline"
            onClick={() => setDraft(EMPTY_FILTERS)}
          >
            Clear all
          </button>
          <button type="button" className="button-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-positive"
            onClick={handleApply}
          >
            Apply
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default FilterJobsDialog;
