import Modal from './Modal';

function ManageDocumentsDialog({
  open,
  onClose,
  slots,
  connectedDocs,
  onView,
  onDownload,
  onDisconnect,
  canDisconnect,
}) {
  const connectedSlots = slots.filter((slot) => connectedDocs[slot.key]);

  return (
    <Modal open={open} onClose={onClose}>
      <div
        className="confirm-dialog event-dialog"
        role="dialog"
        aria-modal="true"
      >
        <h2>Manage documents</h2>

        {connectedSlots.length === 0 ? (
          <p className="field-hint">No documents connected to this job yet.</p>
        ) : (
          <ul className="item-list">
            {connectedSlots.map((slot) => {
              const doc = connectedDocs[slot.key];
              return (
                <li key={slot.key} className="item-row document-row document-row-stacked">
                  <span className="item-name">
                    <span className="item-name-primary">{doc.file_name}</span>
                  </span>
                  <div className="document-row-details">
                    <span className="item-meta">{slot.label}</span>
                    <div className="item-actions">
                      <button
                        type="button"
                        className="button-outline"
                        onClick={() => onView(doc)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="button-outline"
                        onClick={() => onDownload(doc)}
                      >
                        Download
                      </button>
                      {canDisconnect && (
                        <button
                          type="button"
                          className="button-outline item-delete"
                          onClick={() => onDisconnect(slot.key)}
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="confirm-dialog-actions">
          <button type="button" className="button-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ManageDocumentsDialog;
