import { useRef, useState } from 'react';

// Shared by ExperienceDialog/EducationDialog (the library editors) and
// BuildCvDialog's review stage — same add/remove/reorder UI everywhere,
// just a different array of { id, text } items, and a few optional knobs
// for contexts where the content is expected to look different: `rows`
// sets the per-item textarea's default height, `variant="compact"` puts
// the remove button in a horizontal row instead of stacked vertically
// (for short, likely-one-line content like skills, where a vertical
// button stack wastes height the text doesn't need), `reorder="handle"`
// (opt-in — default stays the up/down buttons the library editors still
// use) swaps those buttons for a drag handle, which is far less tedious
// than click-to-move-one-slot when a list runs long (BuildCvDialog's
// skills/bullets/detail pickers can all end up with many items), and
// `onAddClick` lets a caller replace what "Add" does entirely (e.g.
// BuildCvDialog's skills/bullet pickers) instead of appending a blank row.
function BulletListEditor({
  items,
  onChange,
  addLabel,
  placeholder,
  rows = 2,
  variant = 'stacked',
  reorder = 'buttons',
  onAddClick,
}) {
  // Pointer Events (not HTML5 drag-and-drop, which has no touch support)
  // so the same handle works with a mouse or a finger. dragIndex is the
  // item being moved; overIndex is whichever row the pointer is currently
  // over, used only for the drop-target highlight — the actual reorder
  // happens once, on release, same as the old up/down buttons did.
  const rowRefs = useRef([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  function updateText(index, text) {
    onChange(items.map((item, i) => (i === index ? { ...item, text } : item)));
  }

  function remove(index) {
    onChange(items.filter((_, i) => i !== index));
  }

  function moveUp(index) {
    if (index === 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function moveDown(index) {
    if (index === items.length - 1) return;
    const next = [...items];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    onChange(next);
  }

  function moveItem(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  }

  function handlePointerDown(e, index) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIndex(index);
    setOverIndex(index);
  }

  // Pointer capture keeps these events targeted at the handle itself (so
  // this handler keeps firing) regardless of what's physically under the
  // finger/cursor — clientY still reflects the real position, which is
  // compared against every row's own bounding box to find which one it's
  // currently over.
  function handlePointerMove(e) {
    if (dragIndex === null) return;
    const y = e.clientY;
    for (let i = 0; i < rowRefs.current.length; i++) {
      const rect = rowRefs.current[i]?.getBoundingClientRect();
      if (rect && y >= rect.top && y <= rect.bottom) {
        setOverIndex(i);
        break;
      }
    }
  }

  function handlePointerUp() {
    if (dragIndex !== null && overIndex !== null) moveItem(dragIndex, overIndex);
    setDragIndex(null);
    setOverIndex(null);
  }

  function add() {
    if (onAddClick) {
      onAddClick();
      return;
    }
    onChange([...items, { id: null, text: '' }]);
  }

  return (
    <div className={`bullet-editor bullet-editor-${variant}`}>
      {items.map((item, index) => {
        const textareaField = (
          <textarea
            rows={rows}
            placeholder={placeholder}
            value={item.text}
            onChange={(e) => updateText(index, e.target.value)}
          />
        );

        if (reorder === 'handle') {
          const handle = (
            <button
              type="button"
              className="button-outline bullet-editor-handle"
              onPointerDown={(e) => handlePointerDown(e, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              ⠿
            </button>
          );
          const deleteButton = (
            <button
              type="button"
              className="button-outline item-delete"
              onClick={() => remove(index)}
              aria-label="Remove"
            >
              ✕
            </button>
          );

          const rowClassName = [
            'bullet-editor-row',
            dragIndex === index && 'bullet-editor-row-dragging',
            overIndex === index && dragIndex !== index && 'bullet-editor-row-drop-target',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              className={rowClassName}
              key={item.id ?? `new-${index}`}
              ref={(el) => {
                rowRefs.current[index] = el;
              }}
            >
              {variant === 'compact' ? (
                <>
                  {handle}
                  {textareaField}
                  {deleteButton}
                </>
              ) : (
                <>
                  <div className="bullet-editor-row-actions">
                    {handle}
                    {deleteButton}
                  </div>
                  {textareaField}
                </>
              )}
            </div>
          );
        }

        return (
          <div className="bullet-editor-row" key={item.id ?? `new-${index}`}>
            {textareaField}
            <div className="bullet-editor-row-actions">
              <button
                type="button"
                className="button-outline"
                onClick={() => moveUp(index)}
                disabled={index === 0}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                className="button-outline"
                onClick={() => moveDown(index)}
                disabled={index === items.length - 1}
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                className="button-outline item-delete"
                onClick={() => remove(index)}
                aria-label="Remove"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
      <button type="button" className="button-outline" onClick={add}>
        {addLabel}
      </button>
    </div>
  );
}

export default BulletListEditor;
