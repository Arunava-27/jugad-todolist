import { useState } from 'react';
import { api } from '../lib/api.js';
import PasswordInput from '../components/PasswordInput.jsx';
import { Logo } from '../components/Icon.jsx';

export default function Login({ onLoggedIn, onSwitchToRegister }) {
  const [email, setEmail] = useState('');
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
        <div className="login-brand"><Logo size={26} /><h1>Punchlist</h1></div>
        <p className="login-sub">Sign in to your workspace</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label>
          Password
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="link-btn" onClick={onSwitchToRegister}>No account? Register</button>
      </form>
    </div>
  );
}
