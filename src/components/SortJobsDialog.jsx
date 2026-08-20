import { useEffect, useState } from 'react';
import Modal from './Modal';
import { SORT_FIELDS } from '../jobSort';

function SortJobsDialog({ open, onClose, onAdd, usedFields, levelNumber }) {
  const availableFields = SORT_FIELDS.filter(
    (f) => !usedFields.includes(f.value),
  );
  const [field, setField] = useState('');
  const [direction, setDirection] = useState('asc');

  useEffect(() => {
    if (open) {
      setField(availableFields[0]?.value ?? '');
      setDirection('asc');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleAdd() {
    if (!field) return;
    onAdd({ field, direction });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div
        className="confirm-dialog profile-form"
        role="dialog"
        aria-modal="true"
      >
        <h2>Add sort level {levelNumber}</h2>

        {availableFields.length === 0 ? (
          <p className="field-hint">
            Every sortable field is already in use.
          </p>
        ) : (
          <>
            <label htmlFor="sortField">Sort by</label>
            <select
              id="sortField"
              className="profile-select"
              value={field}
              onChange={(e) => setField(e.target.value)}
            >
              {availableFields.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <label htmlFor="sortDirection">Direction</label>
            <select
              id="sortDirection"
              className="profile-select"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </>
        )}

        <div className="confirm-dialog-actions">
          <button type="button" className="button-outline" onClick={onClose}>
            Cancel
          </button>
          {availableFields.length > 0 && (
            <button
              type="button"
              className="button-positive"
              onClick={handleAdd}
            >
              Add
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default SortJobsDialog;
