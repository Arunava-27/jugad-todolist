import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';

export default function MembersPanel({ workspaceId, currentUserId }) {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    api.listWorkspaceMembers(workspaceId).then(setMembers).catch(() => {});
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function submitAdd(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    setError('');
    try {
      await api.addWorkspaceMember(workspaceId, email.trim());
      setEmail('');
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
      alert(err.message || 'Could not remove member');
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
              <div className="settings-hint" style={{ margin: 0 }}>{m.email} · {m.role}</div>
            </div>
            <button
              className="icon-btn danger-hover"
              title="Remove from workspace"
              onClick={() => remove(m.id)}
            >🗑</button>
          </div>
        ))}
      </div>

      <form className="settings-add-row" onSubmit={submitAdd}>
        <input
          type="email"
          placeholder="teammate@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={adding || !email.trim()}>Add</button>
      </form>
      {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}
      <p className="settings-hint" style={{ marginTop: 10 }}>
        They need an existing account (ask them to register first) — there's no email invite system, just add them by email once they've signed up.
      </p>
    </div>
  );
}
