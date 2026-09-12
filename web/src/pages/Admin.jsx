import { Fragment, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { alertDialog, promptDialog } from '../lib/dialogs.js';
import SettingsList from '../components/SettingsList.jsx';

const ROLES = ['owner', 'admin', 'manager', 'developer', 'viewer'];
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', manager: 'Manager', developer: 'Developer', viewer: 'Viewer' };

export default function Admin({ currentUserId, currentUserRole, onOpenWorkspace }) {
  const isOwner = currentUserRole === 'owner';
  const [tab, setTab] = useState('Users');
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [domains, setDomains] = useState([]);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);

  const refresh = useCallback(() => {
    api.adminListUsers().then(setUsers).catch(() => {});
    api.adminListWorkspaces().then(setWorkspaces).catch(() => {});
    api.adminGetOrganization().then(setOrganization).catch(() => {});
    api.adminListDomains().then(setDomains).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function loadMemberships(userId) {
    setMembershipsLoading(true);
    api.adminUserMemberships(userId).then(setMemberships).catch(() => setMemberships([])).finally(() => setMembershipsLoading(false));
  }

  function toggleExpand(u) {
    if (expandedUserId === u.id) { setExpandedUserId(null); return; }
    setExpandedUserId(u.id);
    loadMemberships(u.id);
  }

  async function changeRole(u, role) {
    try {
      await api.adminUpdateUser(u.id, { role });
      refresh();
    } catch (err) {
      alertDialog(err.message);
    }
  }

  async function changeDomain(u, domainId) {
    try {
      await api.adminUpdateUser(u.id, { domain_id: domainId ? Number(domainId) : null });
      refresh();
    } catch (err) {
      alertDialog(err.message);
    }
  }

  async function changeCapacity(u, value) {
    const n = value.trim() === '' ? null : Number(value);
    if (n === (u.weekly_capacity_hours ?? null)) return; // no real change — skip the round-trip
    try {
      await api.adminUpdateUser(u.id, { weekly_capacity_hours: n });
      refresh();
    } catch (err) {
      alertDialog(err.message);
      refresh(); // revert the input back to the real value
    }
  }

  async function toggleActive(u) {
    try {
      await api.adminUpdateUser(u.id, { is_active: !u.is_active });
      refresh();
    } catch (err) {
      alertDialog(err.message);
    }
  }

  async function deleteUser(u) {
    if (!isOwner) return; // belt-and-suspenders — the button itself is hidden for non-owners
    const scope = u.workspace_count > 0 ? ` and remove them from ${u.workspace_count} workspace${u.workspace_count === 1 ? '' : 's'}` : '';
    const typed = await promptDialog(
      `This permanently deletes ${u.name}'s account${scope} — it can't be undone. Type their email to confirm:\n${u.email}`,
      '',
      { title: 'Delete user' }
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== u.email.toLowerCase()) {
      alertDialog("That didn't match their email — nothing was deleted.");
      return;
    }
    try {
      await api.adminDeleteUser(u.id);
      if (expandedUserId === u.id) setExpandedUserId(null);
      refresh();
    } catch (err) {
      alertDialog(err.message);
    }
  }

  async function changeMembership(u, m, newRole) {
    try {
      if (!m.role && newRole) {
        await api.addWorkspaceMember(m.workspace_id, u.email, newRole);
      } else if (m.role && !newRole) {
        await api.removeWorkspaceMember(m.workspace_id, u.id);
      } else if (m.role && newRole && newRole !== m.role) {
        await api.updateWorkspaceMember(m.workspace_id, u.id, newRole);
      }
      loadMemberships(u.id);
      refresh();
    } catch (err) {
      alertDialog(err.message);
      loadMemberships(u.id);
    }
  }

  async function renameOrganization() {
    const name = await promptDialog('Organization name:', organization?.name || '', { title: 'Rename organization' });
    if (!name || !name.trim()) return;
    try {
      const updated = await api.adminUpdateOrganization({ name: name.trim() });
      setOrganization(updated);
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
          <button className={tab === 'Domains' ? 'active' : ''} onClick={() => setTab('Domains')}>Domains</button>
          <button className={tab === 'Organization' ? 'active' : ''} onClick={() => setTab('Organization')}>Organization</button>
        </nav>

        <div className="settings-panel">
          {tab === 'Users' && (
            <>
              <h3>All users</h3>
              <p className="settings-hint">
                Manage roles, team labels and per-workspace access across the organization. Open a row to
                scope exactly which workspaces someone can reach and at what role.
              </p>
              <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th>Domain</th><th>Capacity</th><th>Workspaces</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <Fragment key={u.id}>
                      <tr>
                        <td>{u.name} {u.id === currentUserId && <span className="settings-hint">(you)</span>}</td>
                        <td>{u.email}</td>
                        <td>
                          <select
                            value={u.role}
                            disabled={u.id === currentUserId}
                            onChange={(e) => changeRole(u, e.target.value)}
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={u.domain_id || ''} onChange={(e) => changeDomain(u, e.target.value)}>
                            <option value="">No domain</option>
                            {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="admin-capacity-input"
                            placeholder="40"
                            defaultValue={u.weekly_capacity_hours ?? ''}
                            onBlur={(e) => changeCapacity(u, e.target.value)}
                            title="Weekly capacity in hours (blank = default of 40)"
                          />
                        </td>
                        <td>
                          <button className="ghost" onClick={() => toggleExpand(u)}>
                            {u.workspace_count} — {expandedUserId === u.id ? 'Hide' : 'Manage access'}
                          </button>
                        </td>
                        <td>{u.is_active ? 'Active' : 'Deactivated'}</td>
                        <td className="admin-table-actions">
                          <button className="ghost" disabled={u.id === currentUserId} onClick={() => toggleActive(u)}>
                            {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                          {isOwner && (
                            <button className="ghost danger-hover" disabled={u.id === currentUserId} onClick={() => deleteUser(u)}>
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedUserId === u.id && (
                        <tr>
                          <td colSpan={8} className="admin-scope-cell">
                            {membershipsLoading ? (
                              <div className="settings-hint">Loading…</div>
                            ) : (
                              <div className="admin-scope-panel">
                                {memberships.map((m) => (
                                  <div className="settings-row" key={m.workspace_id}>
                                    <div style={{ flex: 1 }}>{m.workspace_name}</div>
                                    <select
                                      value={m.role || ''}
                                      onChange={(e) => changeMembership(u, m, e.target.value || null)}
                                    >
                                      <option value="">Not a member</option>
                                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                                    </select>
                                  </div>
                                ))}
                                {memberships.length === 0 && <div className="settings-hint">No workspaces in this organization yet.</div>}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}

          {tab === 'Workspaces' && (
            <>
              <h3>All workspaces</h3>
              <p className="settings-hint">Every workspace in this organization. As owner you can open any of them from the sidebar switcher.</p>
              <div className="admin-table-wrap">
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
              </div>
            </>
          )}

          {tab === 'Domains' && (
            <>
              <h3>Domains</h3>
              <p className="settings-hint">
                The disciplines people on your team work in — Frontend, Backend, QA, Cloud/DevOps, Design,
                whatever fits. Assign someone's domain from the Users tab. Purely descriptive — doesn't
                grant or restrict anything.
              </p>
              <SettingsList
                items={domains}
                reorderable
                addPlaceholder="New domain name"
                onCreate={(data) => api.adminCreateDomain(data).then(refresh)}
                onUpdate={(id, patch) => api.adminUpdateDomain(id, patch).then(refresh)}
                onDelete={(id, reassignTo) => api.adminDeleteDomain(id, reassignTo).then(refresh)}
                onReorder={(ordered) => Promise.all(ordered.map((item, idx) => api.adminUpdateDomain(item.id, { sort_order: idx }))).then(refresh)}
              />
            </>
          )}

          {tab === 'Organization' && organization && (
            <>
              <h3>Organization</h3>
              <p className="settings-hint">Everyone above belongs to this one organization — there's no visibility across organizations anywhere in Punchlist.</p>
              <div className="settings-row">
                <div style={{ flex: 1 }}>
                  <div>{organization.name}</div>
                  <div className="settings-hint" style={{ margin: 0 }}>Created {new Date(organization.created_at).toLocaleDateString()}</div>
                </div>
                <button className="ghost" onClick={renameOrganization}>Rename</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
