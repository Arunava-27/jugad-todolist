import { useEffect, useState, useCallback, useRef } from 'react';
import { api, setActiveWorkspaceId } from './lib/api.js';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import AcceptInvite from './pages/AcceptInvite.jsx';
import CreateWorkspace from './pages/CreateWorkspace.jsx';
import StakeholderView from './pages/StakeholderView.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import Guides from './pages/Guides.jsx';
import Sidebar from './components/Sidebar.jsx';
import TaskList from './components/TaskList.jsx';
import SectionedTaskList from './components/SectionedTaskList.jsx';
import BoardView from './components/BoardView.jsx';
import TaskModal from './components/TaskModal.jsx';
import QuickAdd from './components/QuickAdd.jsx';
import DialogHost from './components/DialogHost.jsx';
import Icon from './components/Icon.jsx';
import { todayISO } from './lib/format.js';
import { stageColor } from './lib/projectStages.js';

const ACTIVE_WORKSPACE_KEY = 'jugad-active-workspace';

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authScreen, setAuthScreen] = useState('landing'); // 'landing' | 'login' | 'register'
  const [user, setUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(null);
  const [stakeholderProjects, setStakeholderProjects] = useState([]);

  const [projects, setProjects] = useState([]);
  const [labels, setLabels] = useState([]);
  const [members, setMembers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [sections, setSections] = useState([]);

  const [view, setView] = useState({ type: 'today' });
  const [activeTask, setActiveTask] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const preSearchViewRef = useRef({ type: 'today' });

  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'));
  const [inviteInfo, setInviteInfo] = useState(null);
  const [inviteError, setInviteError] = useState('');
  const [inviteResolved, setInviteResolved] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    api.me()
      .then(({ user, workspaces, stakeholderProjects }) => applyAuthResult({ user, workspaces, stakeholderProjects }))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    api.getInvite(inviteToken)
      .then(setInviteInfo)
      .catch((err) => setInviteError(err.message || 'This invite link is invalid.'));
  }, [inviteToken]);

  function dismissInvite() {
    setInviteResolved(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url);
  }

  async function handleAcceptNow() {
    setAccepting(true);
    try {
      await api.acceptInvite(inviteToken);
      applyAuthResult(await api.me());
      dismissInvite();
    } catch (err) {
      setInviteError(err.message || 'Could not accept invite');
    } finally {
      setAccepting(false);
    }
  }

  async function handleAuthAndAccept(authResult) {
    setUser(authResult.user);
    setAccepting(true);
    try {
      await api.acceptInvite(inviteToken);
      applyAuthResult(await api.me());
    } catch (err) {
      setInviteError(err.message || 'Could not accept invite');
      applyAuthResult(authResult);
    } finally {
      setAccepting(false);
      dismissInvite();
    }
  }

  function applyAuthResult({ user, workspaces, stakeholderProjects }) {
    setUser(user);
    setWorkspaces(workspaces);
    setStakeholderProjects(stakeholderProjects || []);
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
    api.listWorkspaceMembers(activeWorkspaceId).then((d) => setMembers(d.members || [])).catch(() => {});
    api.listStatuses().then(setStatuses).catch(() => {});
    api.listPriorities().then(setPriorities).catch(() => {});
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (user && activeWorkspaceId) refreshLookups();
  }, [user, activeWorkspaceId, refreshLookups]);

  const loadTasks = useCallback(() => {
    if (!user || !activeWorkspaceId || view.type === 'settings' || view.type === 'admin' || view.type === 'guides') return;
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

  if (inviteToken && !inviteResolved) {
    if (user) {
      return (
        <AcceptInvite
          info={inviteInfo}
          error={inviteError}
          user={user}
          accepting={accepting}
          onAcceptNow={handleAcceptNow}
          onLogout={handleLogout}
          onDismiss={dismissInvite}
        />
      );
    }
    if (authScreen === 'register') {
      return <Register onRegistered={handleAuthAndAccept} onSwitchToLogin={() => setAuthScreen('login')} onBack={() => setAuthScreen('landing')} inviteToken={inviteToken} inviteInfo={inviteInfo} />;
    }
    if (authScreen === 'login') {
      return <Login onLoggedIn={handleAuthAndAccept} onSwitchToRegister={() => setAuthScreen('register')} onBack={() => setAuthScreen('landing')} inviteInfo={inviteInfo} />;
    }
    return (
      <AcceptInvite
        info={inviteInfo}
        error={inviteError}
        user={null}
        onSignIn={() => setAuthScreen('login')}
        onRegister={() => setAuthScreen('register')}
        onDismiss={dismissInvite}
      />
    );
  }

  if (!user) {
    if (authScreen === 'register') {
      return <Register onRegistered={applyAuthResult} onSwitchToLogin={() => setAuthScreen('login')} onBack={() => setAuthScreen('landing')} />;
    }
    if (authScreen === 'login') {
      return <Login onLoggedIn={applyAuthResult} onSwitchToRegister={() => setAuthScreen('register')} onBack={() => setAuthScreen('landing')} />;
    }
    return <Landing onSignIn={() => setAuthScreen('login')} />;
  }
  if (!activeWorkspaceId) {
    // Zero workspaces but stakeholder access to at least one project: that's
    // this person's whole relationship to Punchlist (a client, an exec, a
    // non-technical stakeholder) — send them to their own read-only lane
    // instead of the "ask the owner to add you" dead end below.
    if (stakeholderProjects.length > 0) {
      return <StakeholderView userName={user.name} projects={stakeholderProjects} onLogout={handleLogout} />;
    }
    return <CreateWorkspace userName={user.name} isOwner={user.role === 'owner'} onCreate={handleCreateWorkspace} onLogout={handleLogout} />;
  }

  const currentProject = view.type === 'project' ? projects.find((p) => p.id === view.id) : null;
  const activeWorkspaceRole = workspaces.find((w) => w.id === activeWorkspaceId)?.my_role;
  const isViewer = activeWorkspaceRole === 'viewer';

  const VIEW_META = {
    today: { icon: 'calendar', label: 'Today' },
    upcoming: { icon: 'compass', label: 'Upcoming' },
    inbox: { icon: 'inbox', label: 'Inbox' },
    all: { icon: 'grid', label: 'All tasks' },
    settings: { icon: 'gear', label: 'Settings' },
    admin: { icon: 'shield', label: 'Admin' },
    guides: { icon: 'book', label: 'Guides' },
  };
  const viewMeta = VIEW_META[view.type] || (
    view.type === 'project' ? { icon: null, label: currentProject?.name }
      : view.type === 'search' ? { icon: 'search', label: `“${view.q}”` }
        : { icon: null, label: `#${view.name}` }
  );

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

  function handleSearch(q) {
    if (q) {
      if (view.type !== 'search') preSearchViewRef.current = view; // remember where to go back to
      setView({ type: 'search', q });
    } else {
      // Search box cleared: leave the stale results behind and go back to
      // whatever view was active before the search started.
      setView(preSearchViewRef.current || { type: 'today' });
    }
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
        readOnly={isViewer}
        onProjectsChanged={refreshLookups}
        searchQuery={view.type === 'search' ? view.q : ''}
        onSearch={handleSearch}
      />

      <main className="main-panel">
        <header className="main-header">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Icon name="menu" size={20} /></button>
          <h2>{viewMeta.icon && <Icon name={viewMeta.icon} size={18} style={{ marginRight: 9, verticalAlign: -3 }} />}{viewMeta.label}</h2>
          {view.type === 'project' && currentProject?.status && (
            <span className="chip status-chip" style={{ background: stageColor(currentProject.status) + '26', color: stageColor(currentProject.status) }}>
              {currentProject.status}
            </span>
          )}
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
            projects={projects}
            workspaceId={activeWorkspaceId}
            currentUserId={user.id}
            onChange={refreshLookups}
          />
        ) : view.type === 'admin' ? (
          <Admin
            currentUserId={user.id}
            currentUserRole={user.role}
            onOpenWorkspace={(id) => { switchWorkspace(id); setView({ type: 'today' }); }}
          />
        ) : view.type === 'guides' ? (
          <Guides isOwnerOrAdmin={user.role === 'owner' || user.role === 'admin'} />
        ) : (
          <>
            <QuickAdd onCreate={handleCreateTask} projects={projects} priorities={priorities} readOnly={isViewer} />

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
          members={members}
          onClose={() => setActiveTask(null)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
        />
      )}

      <DialogHost />
    </div>
  );
}
