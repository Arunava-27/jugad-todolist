import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { confirmDialog } from '../lib/dialogs.js';
import Icon from './Icon.jsx';

export default function SubtaskList({ parentTaskId }) {
  const [subtasks, setSubtasks] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    api.listSubtasks(parentTaskId).then(setSubtasks).catch(() => {});
  }, [parentTaskId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function toggle(subtask) {
    setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, is_completed: !s.is_completed } : s))); // optimistic
    try {
      await api.updateTask(subtask.id, { is_completed: !subtask.is_completed });
    } catch {
      refresh(); // revert on failure
    }
  }

  async function rename(subtask, title) {
    if (title.trim() && title.trim() !== subtask.title) {
      await api.updateTask(subtask.id, { title: title.trim() });
      refresh();
    }
  }

  async function remove(subtask) {
    const ok = await confirmDialog(`Delete sub-task "${subtask.title}"?`, { title: 'Delete sub-task', danger: true });
    if (!ok) return;
    await api.deleteTask(subtask.id);
    refresh();
  }

  async function submitAdd(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await api.createSubtask(parentTaskId, newTitle.trim());
      setNewTitle('');
      refresh();
    } finally {
      setAdding(false);
    }
  }

  const done = subtasks.filter((s) => s.is_completed).length;

  return (
    <div className="subtasks-section">
      <div className="settings-hint" style={{ marginBottom: 8 }}>
        Sub-tasks{subtasks.length > 0 ? ` — ${done}/${subtasks.length} done` : ''}
      </div>
      {subtasks.length > 0 && (
        <ul className="subtask-list">
          {subtasks.map((s) => (
            <li className={`subtask-row ${s.is_completed ? 'completed' : ''}`} key={s.id}>
              <button className="task-checkbox" onClick={() => toggle(s)} aria-label="Toggle complete">
                {s.is_completed && <Icon name="check" size={12} />}
              </button>
              <input
                className="subtask-title"
                defaultValue={s.title}
                onBlur={(e) => rename(s, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
              />
              <button className="icon-btn danger-hover" onClick={() => remove(s)} title="Delete sub-task"><Icon name="x" size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <form className="settings-add-row" onSubmit={submitAdd}>
        <input
          placeholder="Add a sub-task…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={adding || !newTitle.trim()}>Add</button>
      </form>
    </div>
  );
}
