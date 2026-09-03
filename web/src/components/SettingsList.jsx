import { useState } from 'react';

// Generic editable list of {id, name, color, ...} rows — used for statuses,
// priorities, labels and people. Handles inline rename/recolor, delete with
// a "reassign in-use items first" fallback, adding a new row, and (when
// `reorderable`) drag-to-reorder persisted via sort_order.
export default function SettingsList({ items, onCreate, onUpdate, onDelete, onReorder, renderRowExtra, addPlaceholder = 'Add new…', reorderable = false }) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [creating, setCreating] = useState(false);
  const [blocked, setBlocked] = useState(null); // { id, count, reassignTo }
  const [busyId, setBusyId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  async function submitNew(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await onCreate({ name: newName.trim(), color: newColor });
      setNewName('');
    } finally {
      setCreating(false);
    }
  }

  async function rename(item, name) {
    if (name.trim() && name.trim() !== item.name) {
      await onUpdate(item.id, { name: name.trim() });
    }
  }

  async function recolor(item, color) {
    await onUpdate(item.id, { color });
  }

  async function tryDelete(item) {
    setBusyId(item.id);
    try {
      await onDelete(item.id);
      setBlocked(null);
    } catch (err) {
      if (err.status === 409 || /in use/i.test(err.message || '')) {
        setBlocked({ id: item.id, count: err.count, reassignTo: '' });
      } else {
        alert(err.message || 'Could not delete');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReassignDelete(item) {
    setBusyId(item.id);
    try {
      await onDelete(item.id, blocked.reassignTo);
      setBlocked(null);
    } catch (err) {
      alert(err.message || 'Could not delete');
    } finally {
      setBusyId(null);
    }
  }

  function handleDrop(targetId) {
    setDragOverId(null);
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    setDragId(null);
    if (from === -1 || to === -1) return;
    const reordered = [...items];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onReorder(reordered);
  }

  return (
    <div>
      <div className="settings-list">
        {items.map((item) => (
          <div key={item.id}>
            <div
              className={`settings-row ${reorderable ? 'reorderable' : ''} ${dragOverId === item.id ? 'drag-over' : ''}`}
              draggable={reorderable}
              onDragStart={() => setDragId(item.id)}
              onDragOver={(e) => { if (reorderable) { e.preventDefault(); setDragOverId(item.id); } }}
              onDragLeave={() => setDragOverId((cur) => (cur === item.id ? null : cur))}
              onDrop={(e) => { if (reorderable) { e.preventDefault(); handleDrop(item.id); } }}
            >
              {reorderable && <span className="drag-handle" title="Drag to reorder">⠿</span>}
              <input
                type="color"
                value={item.color || '#94a3b8'}
                onChange={(e) => recolor(item, e.target.value)}
                title="Color"
              />
              <input
                type="text"
                defaultValue={item.name}
                onBlur={(e) => rename(item, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
              />
              {renderRowExtra && (
                <div className="settings-row-flags">{renderRowExtra(item, (patch) => onUpdate(item.id, patch))}</div>
              )}
              <button
                className="icon-btn danger-hover"
                onClick={() => tryDelete(item)}
                disabled={busyId === item.id}
                title="Delete"
              >
                🗑
              </button>
            </div>
            {blocked?.id === item.id && (
              <div className="reassign-inline">
                <span>{blocked.count} task(s) use this — reassign them to:</span>
                <select
                  value={blocked.reassignTo}
                  onChange={(e) => setBlocked({ ...blocked, reassignTo: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {items.filter((i) => i.id !== item.id).map((i) => (
                    <option key={i.id} value={i.name}>{i.name}</option>
                  ))}
                </select>
                <button disabled={!blocked.reassignTo} onClick={() => confirmReassignDelete(item)}>Reassign &amp; delete</button>
                <button className="ghost" onClick={() => setBlocked(null)}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form className="settings-add-row" onSubmit={submitNew}>
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
        <input
          type="text"
          placeholder={addPlaceholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" disabled={creating || !newName.trim()}>Add</button>
      </form>
    </div>
  );
}
