function Modal({ open, onClose, children }) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default Modal;
