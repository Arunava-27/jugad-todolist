import { useState } from 'react';
import { api } from '../lib/api.js';
import PasswordInput from '../components/PasswordInput.jsx';
import { Logo } from '../components/Icon.jsx';

export default function Register({ onRegistered, onSwitchToLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.register(email, name, password, workspaceName);
      onRegistered(result);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand"><Logo size={26} /><h1>Punchlist</h1></div>
        <p className="login-sub">Create your account</p>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </label>
        <label>
          Workspace name <span className="field-hint">(optional — you can rename it later)</span>
          <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder={name ? `${name}'s Workspace` : 'My Workspace'} />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
        <button type="button" className="link-btn" onClick={onSwitchToLogin}>Already have an account? Sign in</button>
      </form>
    </div>
  );
}
