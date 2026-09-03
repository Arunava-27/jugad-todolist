import { useState } from 'react';

export default function QuickAdd({ onCreate, projects, priorities }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('');
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        due_date: dueDate || undefined, // let the current view's smart default apply when left blank
        priority: priority || null,
        project_id: projectId ? Number(projectId) : undefined,
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
      <button className="quick-add-trigger" onClick={() => setOpen(true)}>＋ Add task</button>
    );
  }

  return (
    <form className="quick-add-form" onSubmit={submit}>
      <input
        autoFocus
        placeholder="Task name"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      />
      <div className="quick-add-row">
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Priority</option>
          {priorities.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
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
