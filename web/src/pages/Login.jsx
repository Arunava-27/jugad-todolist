import { useState } from 'react';
import { api } from '../lib/api.js';
import PasswordInput from '../components/PasswordInput.jsx';
import { Logo } from '../components/Icon.jsx';

export default function Login({ onLoggedIn, onSwitchToRegister, onBack, inviteInfo }) {
  const [email, setEmail] = useState(inviteInfo?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.login(email, password);
      onLoggedIn(result);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <button type="button" className="login-brand" onClick={onBack} title="Back to Punchlist"><Logo size={26} /><h1>Punchlist</h1></button>
        <p className="login-sub">
          {inviteInfo ? `Sign in to join ${inviteInfo.workspaceName}` : 'Sign in to your workspace'}
        </p>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus={!inviteInfo}
            readOnly={!!inviteInfo}
          />
        </label>
        <label>
          Password
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!!inviteInfo} />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        {!inviteInfo && <button type="button" className="link-btn" onClick={onSwitchToRegister}>No account? Register</button>}
      </form>
    </div>
  );
}
