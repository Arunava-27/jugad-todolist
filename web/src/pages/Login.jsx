import { useState } from 'react';
import { api } from '../lib/api.js';
import PasswordInput from '../components/PasswordInput.jsx';
import { Logo } from '../components/Icon.jsx';

export default function Login({ onLoggedIn, onSwitchToRegister, onBack, inviteInfo }) {
  const [email, setEmail] = useState(inviteInfo?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 'password' -> normal sign-in; 'twoFactor' -> password already checked,
  // waiting on a TOTP/recovery code; 'forgotPassword' -> the "email me a
  // reset link" mini-form, reachable without leaving this screen.
  const [step, setStep] = useState('password');
  const [pendingToken, setPendingToken] = useState(null);
  const [code, setCode] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.login(email, password);
      if (result.twoFactorRequired) {
        setPendingToken(result.pendingToken);
        setStep('twoFactor');
      } else {
        onLoggedIn(result);
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function submitTwoFactor(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.login2fa(pendingToken, code);
      onLoggedIn(result);
    } catch (err) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  async function submitForgotPassword(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.requestPasswordReset(resetEmail);
      setResetSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'forgotPassword') {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={submitForgotPassword}>
          <button type="button" className="login-brand" onClick={onBack} title="Back to Punchlist"><Logo size={26} /><h1>Punchlist</h1></button>
          {resetSent ? (
            <>
              <p className="login-sub">If an account exists for {resetEmail}, a reset link is on its way — check your inbox.</p>
              <button type="button" onClick={() => { setStep('password'); setResetSent(false); }}>Back to sign in</button>
            </>
          ) : (
            <>
              <p className="login-sub">Enter your email and we'll send you a link to reset your password.</p>
              <label>
                Email
                <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} autoFocus />
              </label>
              {error && <div className="login-error">{error}</div>}
              <button type="submit" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
              <button type="button" className="link-btn" onClick={() => setStep('password')}>Back to sign in</button>
            </>
          )}
        </form>
      </div>
    );
  }

  if (step === 'twoFactor') {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={submitTwoFactor}>
          <button type="button" className="login-brand" onClick={onBack} title="Back to Punchlist"><Logo size={26} /><h1>Punchlist</h1></button>
          <p className="login-sub">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
          <label>
            Code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              autoComplete="one-time-code"
              placeholder="123456"
            />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" disabled={loading || !code}>{loading ? 'Verifying…' : 'Verify'}</button>
          <button type="button" className="link-btn" onClick={() => { setStep('password'); setCode(''); setError(''); }}>Back to sign in</button>
        </form>
      </div>
    );
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
        <button type="button" className="link-btn" onClick={() => { setResetEmail(email); setStep('forgotPassword'); setError(''); }}>Forgot password?</button>
        {!inviteInfo && <button type="button" className="link-btn" onClick={onSwitchToRegister}>No account? Register</button>}
      </form>
    </div>
  );
}
