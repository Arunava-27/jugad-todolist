import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { alertDialog, confirmDialog } from '../lib/dialogs.js';
import Icon from './Icon.jsx';

const ROLES = ['owner', 'admin', 'member', 'viewer'];
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' };

export default function MembersPanel({ workspaceId, currentUserId }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    api.listWorkspaceMembers(workspaceId).then((data) => {
      setMembers(data.members || []);
      setInvites(data.invites || []);
    }).catch(() => {});
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function submitAdd(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    setError('');
    setNotice('');
    try {
      const result = await api.addWorkspaceMember(workspaceId, email.trim(), role);
      setEmail('');
      if (result.status === 'invited') {
        setNotice(result.emailSent
          ? `Invite emailed to ${result.email}.`
          : `Invite created for ${result.email}, but email couldn't be sent — share this link with them: ${result.inviteLink}`);
      }
      refresh();
    } catch (err) {
      setError(err.message || 'Could not add member');
    } finally {
      setAdding(false);
    }
  }

  async function remove(userId) {
    try {
      await api.removeWorkspaceMember(workspaceId, userId);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not remove member');
    }
  }

  async function changeRole(userId, newRole) {
    try {
      await api.updateWorkspaceMember(workspaceId, userId, newRole);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not change role');
      refresh(); // revert the select back to the real value
    }
  }

  async function revoke(invite) {
    const ok = await confirmDialog(`Revoke the invite to ${invite.email}?`, { title: 'Revoke invite' });
    if (!ok) return;
    try {
      await api.revokeInvite(workspaceId, invite.id);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not revoke invite');
    }
  }

  return (
    <div>
      <div className="settings-list">
        {members.map((m) => (
          <div className="settings-row" key={m.id}>
            <span className="avatar" style={{ background: 'var(--accent)' }}>{m.name.slice(0, 2).toUpperCase()}</span>
            <div style={{ flex: 1 }}>
              <div>{m.name} {m.id === currentUserId && <span className="settings-hint">(you)</span>}</div>
              <div className="settings-hint" style={{ margin: 0 }}>{m.email}</div>
            </div>
            <select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)} title="Role">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <button
              className="icon-btn danger-hover"
              title="Remove from workspace"
              onClick={() => remove(m.id)}
            ><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <>
          <div className="settings-hint" style={{ margin: '18px 0 8px' }}>Pending invites</div>
          <div className="settings-list">
            {invites.map((inv) => (
              <div className="settings-row" key={inv.id}>
                <span className="avatar" style={{ background: 'var(--panel-sunk)', color: 'var(--ink-soft)' }}>
                  <Icon name="calendar" size={13} />
                </span>
                <div style={{ flex: 1 }}>
                  <div>{inv.email}</div>
                  <div className="settings-hint" style={{ margin: 0 }}>Invited as {ROLE_LABEL[inv.role]}</div>
                </div>
                <button className="icon-btn danger-hover" title="Revoke invite" onClick={() => revoke(inv)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <form className="settings-add-row" onSubmit={submitAdd} style={{ marginTop: 14 }}>
        <input
          type="email"
          placeholder="teammate@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1 }}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} title="Role to invite as">
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <button type="submit" disabled={adding || !email.trim()}>{adding ? 'Sending…' : 'Invite'}</button>
      </form>
      {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}
      {notice && <div className="settings-hint" style={{ marginTop: 8 }}>{notice}</div>}
      <p className="settings-hint" style={{ marginTop: 10 }}>
        Already have an account here? They're added right away. Otherwise we email them an invite link
        to join — <strong>Viewer</strong>s can see everything but can't create or change anything;
        <strong> Admin</strong>s can also manage members and workspace settings.
      </p>
    </div>
  );
}
