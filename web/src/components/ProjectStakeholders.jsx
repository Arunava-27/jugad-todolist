import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { alertDialog } from '../lib/dialogs.js';
import { colorForPerson, initials } from '../lib/format.js';
import Icon from './Icon.jsx';

// Who can see this ONE project's high-level status (stage, dates, progress,
// team) without being a member of the workspace at all — a client, an exec,
// anyone who just needs "where do things stand", not the task board. See
// server/src/routes/projectSummary.js for exactly what they get to see.
export default function ProjectStakeholders({ projectId }) {
  const [stakeholders, setStakeholders] = useState([]);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(() => {
    api.listStakeholders(projectId).then(setStakeholders).catch(() => {});
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function submitAdd(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    setError('');
    setNotice('');
    try {
      const result = await api.addStakeholder(projectId, email.trim());
      setEmail('');
      if (result.status === 'invited') {
        setNotice(result.emailSent
          ? `Invite emailed to ${result.email}.`
          : `Invite created for ${result.email}, but email couldn't be sent — share this link with them: ${result.inviteLink}`);
      }
      refresh();
    } catch (err) {
      setError(err.message || 'Could not add stakeholder');
    } finally {
      setAdding(false);
    }
  }

  async function remove(userId) {
    try {
      await api.removeStakeholder(projectId, userId);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not remove stakeholder');
    }
  }

  return (
    <div className="admin-scope-panel">
      {stakeholders.map((s) => (
        <div className="settings-row" key={s.id}>
          <span className="avatar" style={{ background: colorForPerson(s.name) }}>{initials(s.name)}</span>
          <div style={{ flex: 1 }}>
            <div>{s.name}</div>
            <div className="settings-hint" style={{ margin: 0 }}>{s.email}</div>
          </div>
          <button className="icon-btn danger-hover" title="Remove stakeholder access" onClick={() => remove(s.id)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      {stakeholders.length === 0 && <div className="settings-hint">No stakeholders yet — they'll see this project's stage, dates, and progress, nothing more.</div>}

      <form className="settings-add-row" onSubmit={submitAdd} style={{ marginTop: 10 }}>
        <input
          type="email"
          placeholder="stakeholder@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={adding || !email.trim()}>{adding ? 'Adding…' : 'Add'}</button>
      </form>
      {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}
      {notice && <div className="settings-hint" style={{ marginTop: 8 }}>{notice}</div>}
      <p className="settings-hint" style={{ marginTop: 8 }}>
        Already have an account here? They're added right away. Otherwise we email them a link to create
        one — they'll only ever see this project's stage, dates, and progress, never the task board.
      </p>
    </div>
  );
}
