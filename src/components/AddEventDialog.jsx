import { useState } from 'react';
import Modal from './Modal';

function AddEventDialog({ open, onClose, onSubmit, eventNameOptions }) {
  const [eventName, setEventName] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function resetAndClose() {
    setEventName('');
    setEventType('');
    setEventDate('');
    setEventTime('');
    setLocation('');
    setError(null);
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const result = await onSubmit({
      event_name: eventName,
      event_type: eventType || null,
      event_date: eventDate,
      event_time: eventTime || null,
      location: location || null,
    });

    setSaving(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setEventName('');
    setEventType('');
    setEventDate('');
    setEventTime('');
    setLocation('');
  }

  return (
    <Modal open={open} onClose={resetAndClose}>
      <form
        className="confirm-dialog profile-form event-dialog"
        onSubmit={handleSubmit}
      >
        <h2>Add event</h2>

        <label htmlFor="eventName">Event</label>
        <select
          id="eventName"
          className="profile-select"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          required
        >
          <option value="" disabled>
            Select an event
          </option>
          {eventNameOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <label htmlFor="eventType">Type</label>
        <input
          id="eventType"
          type="text"
          placeholder="e.g. Online, In person, AI"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        />

        <label htmlFor="eventDate">Date</label>
        <input
          id="eventDate"
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          required
        />

        <label htmlFor="eventTime">Time</label>
        <input
          id="eventTime"
          type="time"
          value={eventTime}
          onChange={(e) => setEventTime(e.target.value)}
        />

        <label htmlFor="eventLocation">Location</label>
        <input
          id="eventLocation"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        {error && <p className="form-error">{error}</p>}

        <div className="confirm-dialog-actions">
          <button type="button" className="link-button" onClick={resetAndClose}>
            Cancel
          </button>
          <button type="submit" className="button-positive" disabled={saving}>
            {saving ? 'Saving…' : 'Add event'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default AddEventDialog;
