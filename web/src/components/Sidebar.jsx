import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

const SMART_VIEWS = [
  { type: 'today', icon: '📅', label: 'Today' },
  { type: 'upcoming', icon: '🔭', label: 'Upcoming' },
  { type: 'inbox', icon: '📥', label: 'Inbox' },
  { type: 'all', icon: '🗂️', label: 'All tasks' },
];

const NEW_WORKSPACE = '__new__';

export default function Sidebar({
  user, workspaces, activeWorkspaceId, onSwitchWorkspace, onCreateWorkspace,
  projects, labels, view, onSelectView, open, onClose, onLogout, onProjectsChanged,
  searchQuery, onSearch,
}) {
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [searchDraft, setSearchDraft] = useState(searchQuery || '');
  const searchDebounce = useRef(null);

  function handleSearchChange(value) {
    setSearchDraft(value);
    clearTimeout(searchDebounce.current);
    if (!value.trim()) return; // don't force-navigate on an empty box; Enter/blur still no-ops too
    searchDebounce.current = setTimeout(() => onSearch(value.trim()), 300);
  }

  useEffect(() => () => clearTimeout(searchDebounce.current), []);

  async function submitNewProject(e) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await api.createProject({ name: newProjectName.trim() });
    setNewProjectName('');
    setAddingProject(false);
    onProjectsChanged();
  }

  function handleWorkspaceSelect(e) {
    const val = e.target.value;
    if (val === NEW_WORKSPACE) {
      const name = prompt('Name for the new workspace:');
      if (name && name.trim()) onCreateWorkspace(name.trim());
      return;
    }
    onSwitchWorkspace(Number(val));
  }

  async function toggleFavorite(e, project) {
    e.stopPropagation();
    await api.updateProject(project.id, { is_favorite: !project.is_favorite });
    onProjectsChanged();
  }

  function submitSearch(e) {
    e.preventDefault();
    clearTimeout(searchDebounce.current);
    if (searchDraft.trim()) onSearch(searchDraft.trim());
  }

  function projectRow(p) {
    return (
      <button
        key={p.id}
        className={`nav-item ${view.type === 'project' && view.id === p.id ? 'active' : ''}`}
        onClick={() => onSelectView({ type: 'project', id: p.id, mode: 'list' })}
      >
        <span className="dot" style={{ background: p.color }} />
        <span className="nav-item-label">{p.name}</span>
        <span className="nav-count">{p.task_count - p.completed_count}</span>
        <span
          className={`star-toggle ${p.is_favorite ? 'active' : ''}`}
          onClick={(e) => toggleFavorite(e, p)}
          title={p.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        >{p.is_favorite ? '★' : '☆'}</span>
      </button>
    );
  }

  const activeInList = workspaces.some((w) => w.id === activeWorkspaceId);
  const favorites = projects.filter((p) => p.is_favorite);

  return (
    <>
      {open && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">✅</span> Jugad Todolist
        </div>

        <select className="workspace-switcher" value={activeInList ? activeWorkspaceId : ''} onChange={handleWorkspaceSelect}>
          {!activeInList && <option value="">Admin view (workspace #{activeWorkspaceId})</option>}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
          <option value={NEW_WORKSPACE}>＋ New workspace…</option>
        </select>

        <form className="sidebar-search" onSubmit={submitSearch}>
          <input
            placeholder="🔍 Search tasks…"
            value={searchDraft}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </form>

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

        {favorites.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Favorites</div>
            {favorites.map(projectRow)}
          </div>
        )}

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
          {projects.map(projectRow)}
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
        {user.role === 'admin' && (
          <button
            className={`nav-item ${view.type === 'admin' ? 'active' : ''}`}
            onClick={() => onSelectView({ type: 'admin' })}
          >🛡️ Admin</button>
        )}
        <div className="sidebar-user">{user.name}</div>
        <button className="nav-item logout" onClick={onLogout}>⎋ Log out</button>
      </aside>
    </>
  );
}
