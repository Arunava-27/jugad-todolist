import { useState } from 'react';
import { api } from '../lib/api.js';

const SMART_VIEWS = [
  { type: 'today', icon: '📅', label: 'Today' },
  { type: 'upcoming', icon: '🔭', label: 'Upcoming' },
  { type: 'inbox', icon: '📥', label: 'Inbox' },
  { type: 'all', icon: '🗂️', label: 'All tasks' },
];

export default function Sidebar({ projects, labels, view, onSelectView, open, onClose, onLogout, onProjectsChanged }) {
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  async function submitNewProject(e) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await api.createProject({ name: newProjectName.trim() });
    setNewProjectName('');
    setAddingProject(false);
    onProjectsChanged();
  }

  return (
    <>
      {open && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">✅</span> Jugad Todolist
        </div>

        <nav className="sidebar-nav">
          {SMART_VIEWS.map((v) => (
            <button
              key={v.type}
              className={`nav-item ${view.type === v.type ? 'active' : ''}`}
              onClick={() => onSelectView({ type: v.type })}
            >
              <span className="nav-icon">{v.icon}</span> {v.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-section-title">
            Projects
            <button className="icon-btn" onClick={() => setAddingProject((s) => !s)} title="Add project">＋</button>
          </div>
          {addingProject && (
            <form onSubmit={submitNewProject} className="inline-add-form">
              <input
                autoFocus
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onBlur={() => { if (!newProjectName.trim()) setAddingProject(false); }}
              />
            </form>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              className={`nav-item ${view.type === 'project' && view.id === p.id ? 'active' : ''}`}
              onClick={() => onSelectView({ type: 'project', id: p.id, mode: 'list' })}
            >
              <span className="dot" style={{ background: p.color }} />
              <span className="nav-item-label">{p.name}</span>
              <span className="nav-count">{p.task_count - p.completed_count}</span>
            </button>
          ))}
        </div>

        {labels.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Labels</div>
            {labels.map((l) => (
              <button
                key={l.id}
                className={`nav-item ${view.type === 'label' && view.name === l.name ? 'active' : ''}`}
                onClick={() => onSelectView({ type: 'label', name: l.name })}
              >
                <span className="dot" style={{ background: l.color }} /> {l.name}
              </button>
            ))}
          </div>
        )}

        <button
          className={`nav-item ${view.type === 'settings' ? 'active' : ''}`}
          onClick={() => onSelectView({ type: 'settings' })}
        >⚙️ Settings</button>
        <button className="nav-item logout" onClick={onLogout}>⎋ Log out</button>
      </aside>
    </>
  );
}
