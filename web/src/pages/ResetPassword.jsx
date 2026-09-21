import { useState } from 'react';
import { api } from '../lib/api.js';
import PasswordInput from '../components/PasswordInput.jsx';
import { Logo } from '../components/Icon.jsx';

export default function ResetPassword({ token, onDone, onBack }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError("Passwords don't match");
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message || 'This reset link is invalid or has expired');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <button type="button" className="login-brand" onClick={onBack} title="Back to Punchlist"><Logo size={26} /><h1>Punchlist</h1></button>
        {done ? (
          <>
            <p className="login-sub">Your password has been changed. Any other signed-in devices have been signed out.</p>
            <button type="button" onClick={onDone}>Sign in</button>
          </>
        ) : (
          <>
            <p className="login-sub">Choose a new password.</p>
            <label>
              New password
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoFocus />
            </label>
            <label>
              Confirm new password
              <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Reset password'}</button>
          </>
        )}
      </form>
    </div>
  );
}
