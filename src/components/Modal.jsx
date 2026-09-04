import { useEffect } from 'react';

function Modal({ open, onClose, children }) {
  // Esc dismisses whatever dialog is open, the same as clicking the
  // backdrop — every dialog's onClose prop is already a no-action-taken
  // cancel/dismiss, never a confirm, so this is safe to wire up centrally
  // here rather than in each dialog individually.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

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
