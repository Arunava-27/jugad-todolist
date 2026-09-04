import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function TaskModal({ task, projects, statuses, priorities, onClose, onUpdate, onDelete }) {
  const [attachments, setAttachments] = useState(task.attachments || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [sectionOptions, setSectionOptions] = useState([]);

  async function handleFileChange(e) {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const uploaded = await api.uploadAttachment(task.id, file);
      setAttachments((prev) => [...prev, uploaded]);
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(id) {
    setAttachments((prev) => prev.filter((a) => a.id !== id)); // optimistic
    try {
      await api.deleteAttachment(id);
    } catch {
      setAttachments(task.attachments || []); // revert on failure
    }
  }

  const [form, setForm] = useState({
    title: task.title || '',
    description: task.description || '',
    status: task.status || statuses[0]?.name || '',
    priority: task.priority || '',
    platform: task.platform || '',
    due_date: task.due_date || '',
    estimate_hours: task.estimate_hours ?? '',
    version: task.version || '',
    build_number: task.build_number || '',
    link: task.link || '',
    project_id: task.project_id || '',
    section_id: task.section_id || '',
    labels: task.labels.map((l) => l.name).join(', '),
    assignees: task.assignees.map((a) => a.name).join(', '),
  });
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    if (form.project_id) {
      api.listSections(form.project_id).then(setSectionOptions).catch(() => setSectionOptions([]));
    } else {
      setSectionOptions([]);
    }
  }, [form.project_id]);

  function changeProject(value) {
    setForm((f) => ({ ...f, project_id: value, section_id: Number(value) === task.project_id ? f.section_id : '' }));
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
        section_id: form.section_id ? Number(form.section_id) : null,
        // is_completed is deliberately omitted: the server derives it from
        // whichever status is marked "done" in Settings > Workflow.
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
              {statuses.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="">None</option>
              {priorities.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </label>
          <label>
            Project
            <select value={form.project_id} onChange={(e) => changeProject(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            Section
            <select value={form.section_id} onChange={(e) => set('section_id', e.target.value)} disabled={!form.project_id}>
              <option value="">No section</option>
              {sectionOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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

        <div className="attachments-section">
          <div className="settings-hint" style={{ marginBottom: 8 }}>Images</div>
          {uploadError && <div className="login-error" style={{ marginBottom: 8 }}>{uploadError}</div>}
          <div className="attachment-grid">
            {attachments.map((a) => (
              <div className="attachment-thumb" key={a.id}>
                <img src={a.url} alt={a.original_name} />
                <button
                  type="button"
                  className="attachment-remove"
                  onClick={() => removeAttachment(a.id)}
                  title={`Remove ${a.original_name}`}
                >✕</button>
              </div>
            ))}
            <label className="attachment-add">
              {uploading ? '…' : '+'}
              <input type="file" accept="image/*" hidden onChange={handleFileChange} disabled={uploading} />
            </label>
          </div>
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
