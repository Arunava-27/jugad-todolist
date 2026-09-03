import { useState } from 'react';
import { PRIORITIES, STATUSES } from '../lib/format.js';

export default function TaskModal({ task, projects, onClose, onUpdate, onDelete }) {
  const [form, setForm] = useState({
    title: task.title || '',
    description: task.description || '',
    status: task.status || 'Not started',
    priority: task.priority || '',
    platform: task.platform || '',
    due_date: task.due_date || '',
    estimate_hours: task.estimate_hours ?? '',
    version: task.version || '',
    build_number: task.build_number || '',
    link: task.link || '',
    project_id: task.project_id || '',
    labels: task.labels.join(', '),
    assignees: task.assignees.join(', '),
  });
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await onUpdate(task.id, {
        title: form.title.trim(),
        description: form.description || null,
        status: form.status,
        priority: form.priority || null,
        platform: form.platform || null,
        due_date: form.due_date || null,
        estimate_hours: form.estimate_hours === '' ? null : Number(form.estimate_hours),
        version: form.version || null,
        build_number: form.build_number || null,
        link: form.link || null,
        project_id: form.project_id ? Number(form.project_id) : null,
        is_completed: form.status === 'Done',
        labels: form.labels.split(',').map((s) => s.trim()).filter(Boolean),
        assignees: form.assignees.split(',').map((s) => s.trim()).filter(Boolean),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {task.notion_task_number && <span className="task-num">#{task.notion_task_number}</span>}
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <input
          className="modal-title-input"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Task title"
        />

        <textarea
          className="modal-desc-input"
          placeholder="Description / notes"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
        />

        <div className="modal-grid">
          <label>
            Status
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="">None</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </label>
          <label>
            Project
            <select value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            Platform
            <input value={form.platform} onChange={(e) => set('platform', e.target.value)} placeholder="e.g. 🌐 Web App" />
          </label>
          <label>
            Estimate (hrs)
            <input type="number" step="0.5" value={form.estimate_hours} onChange={(e) => set('estimate_hours', e.target.value)} />
          </label>
          <label>
            Version
            <input value={form.version} onChange={(e) => set('version', e.target.value)} />
          </label>
          <label>
            Build number
            <input value={form.build_number} onChange={(e) => set('build_number', e.target.value)} />
          </label>
          <label className="span-2">
            Link
            <input value={form.link} onChange={(e) => set('link', e.target.value)} placeholder="https://…" />
          </label>
          <label className="span-2">
            Labels (comma separated)
            <input value={form.labels} onChange={(e) => set('labels', e.target.value)} placeholder="backend, frontend" />
          </label>
          <label className="span-2">
            Assignees (comma separated)
            <input value={form.assignees} onChange={(e) => set('assignees', e.target.value)} placeholder="Arunava, Soumi" />
          </label>
        </div>

        <div className="modal-footer">
          <button className="danger" onClick={() => onDelete(task.id)}>Delete</button>
          <div className="modal-footer-right">
            <button className="ghost" onClick={onClose}>Cancel</button>
            <button onClick={save} disabled={saving || !form.title.trim()}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
