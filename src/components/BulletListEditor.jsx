// Shared by ExperienceDialog/EducationDialog (the library editors) and
// BuildCvDialog's review stage — same add/remove/reorder UI everywhere,
// just a different array of { id, text } items, and two optional knobs for
// contexts where the content is expected to look different: `rows` sets
// the per-item textarea's default height, and `variant="compact"` puts
// the up/down/remove buttons in a horizontal row instead of stacked
// vertically (for short, likely-one-line content like skills, where a
// vertical button stack wastes height the text doesn't need).
function BulletListEditor({
  items,
  onChange,
  addLabel,
  placeholder,
  rows = 2,
  variant = 'stacked',
}) {
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

  function add() {
    onChange([...items, { id: null, text: '' }]);
  }

  return (
    <div className={`bullet-editor bullet-editor-${variant}`}>
      {items.map((item, index) => (
        <div className="bullet-editor-row" key={item.id ?? `new-${index}`}>
          <textarea
            rows={rows}
            placeholder={placeholder}
            value={item.text}
            onChange={(e) => updateText(index, e.target.value)}
          />
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
      ))}
      <button type="button" className="button-outline" onClick={add}>
        {addLabel}
      </button>
    </div>
  );
}

export default BulletListEditor;
