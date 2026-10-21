import { Link } from 'react-router-dom';
import Modal from './Modal';
import { formatEventDateTime } from '../jobFormat';

// Read-only — shows what an "Alerts" entry is actually about (an event),
// rather than immediately navigating to the job the way the list used to.
// "View job" still gets you there, just as an explicit extra step.
function EventDetailsDialog({ open, onClose, event, isUS }) {
  if (!event) return null;

  return (
    <Modal open={open} onClose={onClose}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-details-title"
      >
        <h2 id="event-details-title">
          {event.eventName}
          {event.eventType ? ` — ${event.eventType}` : ''}
        </h2>
        <p>{formatEventDateTime(event.date, event.time, isUS)}</p>
        {event.location && <p>{event.location}</p>}
        {event.jobTitle && (
          <p>
            {event.jobTitle} — {event.employer}
          </p>
        )}
        <div className="confirm-dialog-actions">
          <button type="button" className="button-outline" onClick={onClose}>
            Close
          </button>
          {event.jobId && (
            <Link to={`/jobs/${event.jobId}`} className="button-positive" onClick={onClose}>
              View job
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default EventDetailsDialog;
