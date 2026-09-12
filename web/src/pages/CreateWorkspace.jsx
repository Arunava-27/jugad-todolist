import { useState } from 'react';
import { Logo } from '../components/Icon.jsx';

// Shown when a signed-in user belongs to zero workspaces — a normal state
// now that there's no predefined/default workspace created on their behalf.
// Admins land here too; they can also open any existing workspace from the
// Admin screen once one exists, but need at least this to create the first.
export default function CreateWorkspace({ userName, onCreate, onLogout }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setCreating(true);
    try {
      await onCreate(name.trim());
    } catch (err) {
      setError(err.message || 'Could not create workspace');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand"><Logo size={26} /><h1>Punchlist</h1></div>
        <p className="login-sub">
          {userName ? `${userName}, y` : 'Y'}ou're not in a workspace yet — create one to start
          adding projects and tasks.
        </p>
        <label>
          Workspace name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Engineering"
            autoFocus
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={creating || !name.trim()}>{creating ? 'Creating…' : 'Create workspace'}</button>
        <button type="button" className="link-btn" onClick={onLogout}>Log out</button>
      </form>
    </div>
  );
}
