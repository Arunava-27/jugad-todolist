import { useState, useMemo } from 'react';
import { parseQuickAdd } from '../lib/quickAddParser.js';
import { formatDueDate } from '../lib/format.js';
import Icon from './Icon.jsx';

export default function QuickAdd({ onCreate, projects, priorities }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('');
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parsed = useMemo(
    () => (title.trim() ? parseQuickAdd(title, { priorities, projects }) : null),
    [title, priorities, projects]
  );

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const p = parseQuickAdd(title, { priorities, projects });
      await onCreate({
        title: p.title || title.trim(),
        // Manual pickers win over what was parsed from the text; parsed
        // values fill in when a picker was left untouched.
        due_date: dueDate || p.due_date || undefined,
        priority: priority || p.priority || null,
        project_id: projectId ? Number(projectId) : (p.project_id || undefined),
        labels: p.labels.length ? p.labels : undefined,
      });
      setTitle('');
      setDueDate('');
      setPriority('');
      setProjectId('');
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button className="quick-add-trigger" onClick={() => setOpen(true)}><Icon name="plus" size={14} /> Add task</button>
    );
  }

  const showPreview = parsed && (parsed.due_date || parsed.priority || parsed.project || parsed.labels.length > 0);

  return (
    <form className="quick-add-form" onSubmit={submit}>
      <input
        autoFocus
        placeholder="Task name — try “tomorrow #Project @label p1”"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      />
      {showPreview && (
        <div className="quick-add-preview">
          {parsed.due_date && <span className="chip due-chip"><Icon name="calendar" size={11} /> {formatDueDate(parsed.due_date)}</span>}
          {parsed.priority && <span className="chip"><Icon name="flag" size={11} /> {parsed.priority}</span>}
          {parsed.project && (
            <span className="chip">
              <Icon name={parsed.project_id ? 'folder' : 'help'} size={11} /> {parsed.project}{!parsed.project_id && ' (no match)'}
            </span>
          )}
          {parsed.labels.map((l) => <span key={l} className="chip label-chip">#{l}</span>)}
        </div>
      )}
      <div className="quick-add-row">
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} title="Override the parsed due date" />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} title="Override the parsed priority">
          <option value="">Priority</option>
          {priorities.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} title="Override the parsed project">
          <option value="">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="quick-add-actions">
          <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" disabled={submitting || !title.trim()}>Add task</button>
        </div>
      </div>
    </form>
  );
}
