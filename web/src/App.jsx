import { useEffect, useState, useCallback } from 'react';
import { api } from './lib/api.js';
import Login from './pages/Login.jsx';
import Sidebar from './components/Sidebar.jsx';
import TaskList from './components/TaskList.jsx';
import BoardView from './components/BoardView.jsx';
import TaskModal from './components/TaskModal.jsx';
import QuickAdd from './components/QuickAdd.jsx';
import { todayISO } from './lib/format.js';

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);

  const [projects, setProjects] = useState([]);
  const [labels, setLabels] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [view, setView] = useState({ type: 'today' });
  const [activeTask, setActiveTask] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    api.me().then((u) => setUser(u)).catch(() => setUser(null)).finally(() => setAuthChecked(true));
  }, []);

  const refreshLookups = useCallback(() => {
    api.listProjects().then(setProjects).catch(() => {});
    api.listLabels().then(setLabels).catch(() => {});
    api.listAssignees().then(setAssignees).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) refreshLookups();
  }, [user, refreshLookups]);

  const loadTasks = useCallback(() => {
    if (!user) return;
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
    }
    api.listTasks(params).then(setTasks).catch(() => {}).finally(() => setLoadingTasks(false));
  }, [user, view]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  if (!authChecked) return <div className="boot-screen">Loading…</div>;
  if (!user) return <Login onLoggedIn={setUser} />;

  const currentProject = view.type === 'project' ? projects.find((p) => p.id === view.id) : null;

  const viewTitle = {
    today: '📅 Today',
    upcoming: '🔭 Upcoming',
    inbox: '📥 Inbox',
    all: '🗂️ All tasks',
  }[view.type] || (view.type === 'project' ? currentProject?.name : `#${view.name}`);

  async function handleCreateTask(fields) {
    const defaults = {};
    if (view.type === 'project') defaults.project_id = view.id;
    if (view.type === 'today') defaults.due_date = todayISO();
    if (view.type === 'label') defaults.labels = [view.name];
    // Drop undefined keys so a smart default (e.g. today's due date) isn't
    // clobbered by a field the caller left unset.
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

  async function handleDeleteTask(id) {
    await api.deleteTask(id);
    setActiveTask(null);
    loadTasks();
  }

  return (
    <div className="app-shell">
      <Sidebar
        projects={projects}
        labels={labels}
        view={view}
        onSelectView={(v) => { setView(v); setSidebarOpen(false); }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={() => api.logout().then(() => setUser(null))}
        onProjectsChanged={refreshLookups}
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

        <QuickAdd onCreate={handleCreateTask} projects={projects} />

        {view.type === 'project' && view.mode === 'board' ? (
          <BoardView
            tasks={tasks}
            loading={loadingTasks}
            onUpdateTask={handleUpdateTask}
            onOpenTask={setActiveTask}
          />
        ) : (
          <TaskList
            tasks={tasks}
            loading={loadingTasks}
            onToggleComplete={handleToggleComplete}
            onOpenTask={setActiveTask}
          />
        )}
      </main>

      {activeTask && (
        <TaskModal
          task={activeTask}
          projects={projects}
          labels={labels}
          assignees={assignees}
          onClose={() => setActiveTask(null)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}
