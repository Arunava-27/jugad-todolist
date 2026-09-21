import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import PasswordInput from './PasswordInput.jsx';
import { confirmDialog, alertDialog } from '../lib/dialogs.js';

function formatDate(iso) {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Loosely labels a session row from its User-Agent — good enough to tell
// devices apart in a list, not meant to be a precise UA parse.
function describeDevice(userAgent) {
  if (!userAgent) return 'Unknown device';
  if (/iPhone|iPad/.test(userAgent)) return 'iOS';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Macintosh/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Linux/.test(userAgent)) return 'Linux';
  return 'Unknown device';
}

export default function SecuritySettings({ user, onUserChanged }) {
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const [resendBusy, setResendBusy] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  // 2FA setup wizard: null (not started) -> { secret, uri, qrDataUri } (scan
  // step) -> resolved by either enabling (recoveryCodes shown once) or cancel.
  const [setupData, setSetupData] = useState(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [disabling, setDisabling] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableBusy, setDisableBusy] = useState(false);

  const refreshSessions = useCallback(() => {
    api.listSessions().then(setSessions).catch(() => {}).finally(() => setLoadingSessions(false));
  }, []);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  async function resendVerification() {
    setResendBusy(true);
    try {
      await api.resendVerification();
      setResendSent(true);
    } catch (err) {
      alertDialog(err.message || 'Could not send verification email');
    } finally {
      setResendBusy(false);
    }
  }

  async function revokeSession(session) {
    const ok = await confirmDialog(
      session.current ? 'Sign out this device?' : 'Sign out this device? It will lose access immediately.',
      { title: 'Revoke session', danger: true }
    );
    if (!ok) return;
    try {
      await api.revokeSession(session.id);
      if (session.current) {
        window.location.reload(); // this browser's own session is gone — start over at the login screen
        return;
      }
      refreshSessions();
    } catch (err) {
      alertDialog(err.message || 'Could not revoke session');
    }
  }

  async function revokeOthers() {
    const ok = await confirmDialog('Sign out every other device? This one stays signed in.', { title: 'Sign out other sessions', danger: true });
    if (!ok) return;
    try {
      await api.revokeOtherSessions();
      refreshSessions();
    } catch (err) {
      alertDialog(err.message || 'Could not sign out other sessions');
    }
  }

  async function startSetup() {
    setSetupBusy(true);
    try {
      const data = await api.setup2fa();
      setSetupData(data);
    } catch (err) {
      alertDialog(err.message || 'Could not start two-factor setup');
    } finally {
      setSetupBusy(false);
    }
  }

  async function confirmSetup(e) {
    e.preventDefault();
    setSetupBusy(true);
    try {
      const result = await api.enable2fa(setupCode);
      setRecoveryCodes(result.recoveryCodes);
      setSetupData(null);
      setSetupCode('');
      onUserChanged();
    } catch (err) {
      alertDialog(err.message || 'Invalid code');
    } finally {
      setSetupBusy(false);
    }
  }

  async function submitDisable(e) {
    e.preventDefault();
    setDisableBusy(true);
    try {
      await api.disable2fa(disablePassword);
      setDisabling(false);
      setDisablePassword('');
      onUserChanged();
    } catch (err) {
      alertDialog(err.message || 'Incorrect password');
    } finally {
      setDisableBusy(false);
    }
  }

  return (
    <div>
      {!user.emailVerified && (
        <>
          <h3>Email verification</h3>
          <p className="settings-hint">
            {resendSent
              ? 'Verification email sent — check your inbox.'
              : `${user.email} hasn't been verified yet.`}
          </p>
          {!resendSent && (
            <button type="button" onClick={resendVerification} disabled={resendBusy}>
              {resendBusy ? 'Sending…' : 'Resend verification email'}
            </button>
          )}
        </>
      )}

      <h3 style={{ marginTop: user.emailVerified ? 0 : 28 }}>Two-factor authentication</h3>
      {recoveryCodes ? (
        <div className="token-reveal">
          <div className="token-reveal-title">Two-factor authentication enabled</div>
          <p className="settings-hint" style={{ margin: '2px 0 10px' }}>
            Save these recovery codes somewhere safe — each works once, as a way back in if you lose access to
            your authenticator app. They won't be shown again.
          </p>
          <div className="token-reveal-value" style={{ display: 'block' }}>
            {recoveryCodes.map((c) => <code key={c} style={{ display: 'block' }}>{c}</code>)}
          </div>
          <button type="button" className="ghost" style={{ marginTop: 10 }} onClick={() => setRecoveryCodes(null)}>Done</button>
        </div>
      ) : user.twoFactorEnabled ? (
        <>
          <p className="settings-hint">Enabled — a code from your authenticator app is required at sign-in.</p>
          {disabling ? (
            <form onSubmit={submitDisable} style={{ maxWidth: 320 }}>
              <label>
                Confirm your password to disable
                <PasswordInput value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} autoFocus />
              </label>
              <div className="dialog-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                <button type="submit" className="danger" disabled={disableBusy || !disablePassword}>{disableBusy ? 'Disabling…' : 'Disable 2FA'}</button>
                <button type="button" className="ghost" onClick={() => { setDisabling(false); setDisablePassword(''); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <button type="button" className="icon-btn danger-hover" onClick={() => setDisabling(true)}>Disable 2FA</button>
          )}
        </>
      ) : setupData ? (
        <form onSubmit={confirmSetup} style={{ maxWidth: 360 }}>
          <p className="settings-hint">Scan this code with your authenticator app, or enter the secret manually.</p>
          <img src={setupData.qrDataUri} alt="2FA setup QR code" width={180} height={180} style={{ display: 'block', margin: '8px 0' }} />
          <p className="settings-hint"><code>{setupData.secret}</code></p>
          <label>
            Enter the 6-digit code it shows
            <input value={setupCode} onChange={(e) => setSetupCode(e.target.value)} autoFocus autoComplete="one-time-code" placeholder="123456" />
          </label>
          <div className="dialog-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
            <button type="submit" disabled={setupBusy || !setupCode}>{setupBusy ? 'Confirming…' : 'Confirm and enable'}</button>
            <button type="button" className="ghost" onClick={() => { setSetupData(null); setSetupCode(''); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <p className="settings-hint">Not enabled. Adds a code from an authenticator app as a second step at sign-in.</p>
          <button type="button" onClick={startSetup} disabled={setupBusy}>{setupBusy ? 'Starting…' : 'Enable 2FA'}</button>
        </>
      )}

      <h3 style={{ marginTop: 28 }}>Sessions</h3>
      <p className="settings-hint">Every device currently signed into your account.</p>
      {loadingSessions ? (
        <p className="settings-hint">Loading…</p>
      ) : (
        <>
          <div className="settings-list">
            {sessions.map((s) => (
              <div className="settings-row token-row token-row-active" key={s.id}>
                <div style={{ flex: 1 }}>
                  <div className="token-row-name">
                    {describeDevice(s.user_agent)}
                    {s.current && <span className="token-status-chip token-status-active">this device</span>}
                  </div>
                  <div className="settings-hint" style={{ margin: '2px 0 0' }}>
                    {s.ip ? `${s.ip} · ` : ''}last active {formatDate(s.last_seen_at)}
                  </div>
                </div>
                <button className="icon-btn danger-hover" onClick={() => revokeSession(s)} title="Revoke">Revoke</button>
              </div>
            ))}
          </div>
          {sessions.length > 1 && (
            <button type="button" className="icon-btn danger-hover" style={{ marginTop: 10 }} onClick={revokeOthers}>
              Sign out every other device
            </button>
          )}
        </>
      )}
    </div>
  );
}
