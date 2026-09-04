import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { alertDialog } from '../lib/dialogs.js';

export default function Admin({ currentUserId, onOpenWorkspace }) {
  const [tab, setTab] = useState('Users');
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);

  const refresh = useCallback(() => {
    api.adminListUsers().then(setUsers).catch(() => {});
    api.adminListWorkspaces().then(setWorkspaces).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function toggleActive(u) {
    try {
      await api.adminUpdateUser(u.id, { is_active: !u.is_active });
      refresh();
    } catch (err) {
      alertDialog(err.message);
    }
  }

  async function toggleRole(u) {
    try {
      await api.adminUpdateUser(u.id, { role: u.role === 'admin' ? 'member' : 'admin' });
      refresh();
    } catch (err) {
      alertDialog(err.message);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-body">
        <nav className="settings-tabs">
          <button className={tab === 'Users' ? 'active' : ''} onClick={() => setTab('Users')}>Users</button>
          <button className={tab === 'Workspaces' ? 'active' : ''} onClick={() => setTab('Workspaces')}>Workspaces</button>
        </nav>

        <div className="settings-panel">
          {tab === 'Users' && (
            <>
              <h3>All users</h3>
              <p className="settings-hint">Manage roles and access across the whole app.</p>
              <table className="admin-table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th>Workspaces</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>{u.role}</td>
                      <td>{u.workspace_count}</td>
                      <td>{u.is_active ? 'Active' : 'Deactivated'}</td>
                      <td className="admin-table-actions">
                        <button className="ghost" disabled={u.id === currentUserId} onClick={() => toggleRole(u)}>
                          {u.role === 'admin' ? 'Make member' : 'Make admin'}
                        </button>
                        <button className="ghost" disabled={u.id === currentUserId} onClick={() => toggleActive(u)}>
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {tab === 'Workspaces' && (
            <>
              <h3>All workspaces</h3>
              <p className="settings-hint">Every workspace on this server. As admin you can open any of them from the sidebar switcher.</p>
              <table className="admin-table">
                <thead>
                  <tr><th>Name</th><th>Members</th><th>Tasks</th><th>Created</th><th></th></tr>
                </thead>
                <tbody>
                  {workspaces.map((w) => (
                    <tr key={w.id}>
                      <td>{w.name}</td>
                      <td>{w.member_count}</td>
                      <td>{w.task_count}</td>
                      <td>{new Date(w.created_at).toLocaleDateString()}</td>
                      <td className="admin-table-actions">
                        <button className="ghost" onClick={() => onOpenWorkspace(w.id)}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
