function Modal({ open, onClose, children }) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export default Modal;
