import { useState } from 'react';
import Modal from './Modal';
import { APPLICATION_METHOD_OPTIONS } from '../jobFormat';

const INTERVIEW_EVENT_NAMES = ['Interview scheduled', 'Interview completed'];
const INTERVIEW_TYPE_OPTIONS = ['AI', 'Remote', 'In person'];

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function AddEventDialog({
  open,
  onClose,
  onSubmit,
  eventNameOptions,
  currentApplicationMethod,
}) {
  const [eventName, setEventName] = useState('');
  const [applicationMethod, setApplicationMethod] = useState('');
  const [employerResponseDate, setEmployerResponseDate] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function resetFields() {
    setEventName('');
    setApplicationMethod('');
    setEmployerResponseDate('');
    setEventType('');
    setEventDate('');
    setEventTime('');
    setError(null);
  }

  function resetAndClose() {
    resetFields();
    onClose();
  }

  function handleEventNameChange(name) {
    setEventName(name);
    setError(null);

    if (name === 'Applied') {
      setApplicationMethod(currentApplicationMethod ?? '');
      setEventDate(todayDateString());
    } else if (name === 'Application acknowledged') {
      setEmployerResponseDate('');
      setEventDate(todayDateString());
    } else if (INTERVIEW_EVENT_NAMES.includes(name)) {
      setEventType('');
      setEventDate('');
      setEventTime('');
    } else {
      // Offer received, Other — no extra fields defined yet.
      setEventDate(todayDateString());
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (INTERVIEW_EVENT_NAMES.includes(eventName) && !eventType) {
      setError('Please select an interview type.');
      return;
    }

    setSaving(true);

    const payload = { event_name: eventName, event_date: eventDate };

    if (eventName === 'Applied') {
      payload.application_method = applicationMethod || null;
      payload.event_type = applicationMethod || null;
    } else if (eventName === 'Application acknowledged') {
      payload.expected_response_date = employerResponseDate || null;
    } else if (INTERVIEW_EVENT_NAMES.includes(eventName)) {
      payload.event_type = eventType;
      payload.event_time = eventTime || null;
    }

    const result = await onSubmit(payload);

    setSaving(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    resetFields();
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
          onChange={(e) => handleEventNameChange(e.target.value)}
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

        {eventName === 'Applied' && (
          <>
            <label htmlFor="applicationMethod">Application method</label>
            <select
              id="applicationMethod"
              className="profile-select"
              value={applicationMethod}
              onChange={(e) => setApplicationMethod(e.target.value)}
            >
              <option value="">Not specified</option>
              {APPLICATION_METHOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'Online' ? 'Online (legacy)' : option}
                </option>
              ))}
            </select>

            <label htmlFor="eventDate">Date</label>
            <input
              id="eventDate"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />
          </>
        )}

        {eventName === 'Application acknowledged' && (
          <>
            <label htmlFor="employerResponseDate">
              Employer response date (optional)
            </label>
            <input
              id="employerResponseDate"
              type="date"
              value={employerResponseDate}
              onChange={(e) => setEmployerResponseDate(e.target.value)}
            />
            <p className="field-hint">
              If the employer gave a timeframe, we'll assume the application
              was unsuccessful and close it if nothing's logged within 7 days
              of that date.
            </p>
          </>
        )}

        {INTERVIEW_EVENT_NAMES.includes(eventName) && (
          <>
            <label htmlFor="eventType">Type</label>
            <select
              id="eventType"
              className="profile-select"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              required
            >
              <option value="" disabled>
                Select a type
              </option>
              {INTERVIEW_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

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
          </>
        )}

        {(eventName === 'Offer received' || eventName === 'Other') && (
          <p className="field-hint">No additional details needed yet.</p>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="confirm-dialog-actions">
          <button type="button" className="button-outline" onClick={resetAndClose}>
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
