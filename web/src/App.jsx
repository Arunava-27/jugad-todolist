import { useEffect, useState, useCallback } from 'react';
import { api, setActiveWorkspaceId } from './lib/api.js';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import Sidebar from './components/Sidebar.jsx';
import TaskList from './components/TaskList.jsx';
import SectionedTaskList from './components/SectionedTaskList.jsx';
import BoardView from './components/BoardView.jsx';
import TaskModal from './components/TaskModal.jsx';
import QuickAdd from './components/QuickAdd.jsx';
import { todayISO } from './lib/format.js';

const ACTIVE_WORKSPACE_KEY = 'jugad-active-workspace';

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authScreen, setAuthScreen] = useState('login'); // 'login' | 'register'
  const [user, setUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(null);

  const [projects, setProjects] = useState([]);
  const [labels, setLabels] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [sections, setSections] = useState([]);

  const [view, setView] = useState({ type: 'today' });
  const [activeTask, setActiveTask] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    api.me()
      .then(({ user, workspaces }) => applyAuthResult({ user, workspaces }))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  function applyAuthResult({ user, workspaces }) {
    setUser(user);
    setWorkspaces(workspaces);
    let saved = null;
    try { saved = Number(localStorage.getItem(ACTIVE_WORKSPACE_KEY)); } catch { /* ignore */ }
    const valid = workspaces.find((w) => w.id === saved) ? saved : workspaces[0]?.id ?? null;
    switchWorkspace(valid);
  }

  function switchWorkspace(id) {
    setActiveWorkspaceIdState(id);
    setActiveWorkspaceId(id);
    try { if (id) localStorage.setItem(ACTIVE_WORKSPACE_KEY, String(id)); } catch { /* ignore */ }
    setView({ type: 'today' });
  }

  const refreshLookups = useCallback(() => {
    if (!activeWorkspaceId) return;
    api.listProjects().then(setProjects).catch(() => {});
    api.listLabels().then(setLabels).catch(() => {});
    api.listAssignees().then(setAssignees).catch(() => {});
    api.listStatuses().then(setStatuses).catch(() => {});
    api.listPriorities().then(setPriorities).catch(() => {});
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (user && activeWorkspaceId) refreshLookups();
  }, [user, activeWorkspaceId, refreshLookups]);

  const loadTasks = useCallback(() => {
    if (!user || !activeWorkspaceId || view.type === 'settings' || view.type === 'admin') return;
    setLoadingTasks(true);
    const params = {};
    if (view.type === 'today') {
      params.due_before = todayISO();
      params.completed = '0';
    } else if (view.type === 'upcoming') {
      params.due_after = todayISO();
      params.completed = '0';
    } else if (view.type === 'inbox') {
      params.project_id = 'none';
    } else if (view.type === 'project') {
      params.project_id = view.id;
    } else if (view.type === 'label') {
      params.label = view.name;
    } else if (view.type === 'search') {
      params.q = view.q;
    }
    api.listTasks(params).then(setTasks).catch(() => {}).finally(() => setLoadingTasks(false));
  }, [user, activeWorkspaceId, view]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const loadSections = useCallback(() => {
    if (!activeWorkspaceId || view.type !== 'project') { setSections([]); return; }
    api.listSections(view.id).then(setSections).catch(() => {});
  }, [activeWorkspaceId, view]);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  if (!authChecked) return <div className="boot-screen">Loading…</div>;
  if (!user) {
    return authScreen === 'register'
      ? <Register onRegistered={applyAuthResult} onSwitchToLogin={() => setAuthScreen('login')} />
      : <Login onLoggedIn={applyAuthResult} onSwitchToRegister={() => setAuthScreen('register')} />;
  }
  if (!activeWorkspaceId) {
    return <div className="boot-screen">No workspace yet — this shouldn't normally happen. Try logging out and back in.</div>;
  }

  const currentProject = view.type === 'project' ? projects.find((p) => p.id === view.id) : null;

  const viewTitle = {
    today: '📅 Today',
    upcoming: '🔭 Upcoming',
    inbox: '📥 Inbox',
    all: '🗂️ All tasks',
    settings: '⚙️ Settings',
    admin: '🛡️ Admin',
  }[view.type] || (view.type === 'project' ? currentProject?.name : view.type === 'search' ? `🔍 “${view.q}”` : `#${view.name}`);

  async function handleCreateTask(fields) {
    const defaults = {};
    if (view.type === 'project') defaults.project_id = view.id;
    if (view.type === 'today') defaults.due_date = todayISO();
    if (view.type === 'label') defaults.labels = [view.name];
    const cleanFields = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    await api.createTask({ ...defaults, ...cleanFields });
    loadTasks();
    refreshLookups();
  }

  async function handleToggleComplete(task) {
    await api.updateTask(task.id, { is_completed: !task.is_completed });
    loadTasks();
  }

  async function handleUpdateTask(id, fields) {
    const updated = await api.updateTask(id, fields);
    loadTasks();
    refreshLookups();
    return updated;
  }

  async function handleTaskMoved(taskId, sectionId) {
    await api.updateTask(taskId, { section_id: sectionId });
    loadTasks();
  }

  async function handleDeleteTask(id) {
    await api.deleteTask(id);
    setActiveTask(null);
    loadTasks();
  }

  async function handleCreateWorkspace(name) {
    const created = await api.createWorkspace(name);
    const fresh = await api.me();
    setWorkspaces(fresh.workspaces);
    switchWorkspace(created.id);
  }

  function handleLogout() {
    api.logout().then(() => {
      setUser(null);
      setWorkspaces([]);
      switchWorkspace(null);
    });
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSwitchWorkspace={switchWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        projects={projects}
        labels={labels}
        view={view}
        onSelectView={(v) => { setView(v); setSidebarOpen(false); }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={handleLogout}
        onProjectsChanged={refreshLookups}
        searchQuery={view.type === 'search' ? view.q : ''}
        onSearch={(q) => setView({ type: 'search', q })}
      />

      <main className="main-panel">
        <header className="main-header">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <h2>{viewTitle}</h2>
          {view.type === 'project' && (
            <div className="view-toggle">
              <button
                className={view.mode !== 'board' ? 'active' : ''}
                onClick={() => setView({ ...view, mode: 'list' })}
              >List</button>
              <button
                className={view.mode === 'board' ? 'active' : ''}
                onClick={() => setView({ ...view, mode: 'board' })}
              >Board</button>
            </div>
          )}
        </header>

        {view.type === 'settings' ? (
          <Settings
            statuses={statuses}
            priorities={priorities}
            labels={labels}
            assignees={assignees}
            projects={projects}
            workspaceId={activeWorkspaceId}
            currentUserId={user.id}
            onChange={refreshLookups}
          />
        ) : view.type === 'admin' ? (
          <Admin
            currentUserId={user.id}
            onOpenWorkspace={(id) => { switchWorkspace(id); setView({ type: 'today' }); }}
          />
        ) : (
          <>
            <QuickAdd onCreate={handleCreateTask} projects={projects} priorities={priorities} />

            {view.type === 'project' && view.mode === 'board' ? (
              <BoardView
                tasks={tasks}
                statuses={statuses}
                priorities={priorities}
                loading={loadingTasks}
                onUpdateTask={handleUpdateTask}
                onOpenTask={setActiveTask}
                onReorderStatuses={(ordered) => Promise.all(ordered.map((s, idx) => api.updateStatus(s.id, { sort_order: idx }))).then(refreshLookups)}
              />
            ) : view.type === 'project' ? (
              <SectionedTaskList
                tasks={tasks}
                sections={sections}
                projectId={view.id}
                priorities={priorities}
                loading={loadingTasks}
                onToggleComplete={handleToggleComplete}
                onOpenTask={setActiveTask}
                onTaskMoved={handleTaskMoved}
                onSectionsChanged={loadSections}
              />
            ) : (
              <TaskList
                tasks={tasks}
                priorities={priorities}
                loading={loadingTasks}
                onToggleComplete={handleToggleComplete}
                onOpenTask={setActiveTask}
              />
            )}
          </>
        )}
      </main>

      {activeTask && (
        <TaskModal
          task={activeTask}
          projects={projects}
          statuses={statuses}
          priorities={priorities}
          onClose={() => setActiveTask(null)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}
