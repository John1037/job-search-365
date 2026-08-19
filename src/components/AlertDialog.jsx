import Modal from './Modal';

function AlertDialog({ open, title, message, onClose }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-dialog-title"
      >
        <h2 id="alert-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="button-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AlertDialog;
