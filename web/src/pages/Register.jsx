import { useState } from 'react';
import { api } from '../lib/api.js';
import PasswordInput from '../components/PasswordInput.jsx';
import { Logo } from '../components/Icon.jsx';

export default function Register({ onRegistered, onSwitchToLogin, onBack, inviteToken, inviteInfo }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(inviteInfo?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.register(email, name, password, inviteToken);
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
        <button type="button" className="login-brand" onClick={onBack} title="Back to Punchlist"><Logo size={26} /><h1>Punchlist</h1></button>
        <p className="login-sub">
          {inviteInfo ? `Create your account to join ${inviteInfo.workspaceName}` : "Create your account — the owner adds you to a workspace once you're signed up"}
        </p>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={!!inviteInfo} />
        </label>
        <label>
          Password
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
        {!inviteInfo && <button type="button" className="link-btn" onClick={onSwitchToLogin}>Already have an account? Sign in</button>}
      </form>
    </div>
  );
}
