import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { confirmDialog, alertDialog } from '../lib/dialogs.js';

const EXPIRY_OPTIONS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: 'Never', days: null },
];

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// A personal access token lets a script, or your own Claude via the MCP
// connector, act AS you — through the exact same permission checks your
// normal session already goes through, never anything broader. Purely
// self-service: this manages only the current account's own tokens.
const MCP_URL = typeof window !== 'undefined' ? `${window.location.origin}/mcp` : '/mcp';

export default function ConnectorTokens() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [expiryDays, setExpiryDays] = useState(90);
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState(null); // { token, name } — shown exactly once
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const refresh = useCallback(() => {
    api.listTokens().then(setTokens).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function submitCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const created = await api.createToken({ name: name.trim(), expires_in_days: expiryDays });
      setFreshToken({ token: created.token, name: created.name });
      setCopied(false);
      setName('');
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not create token');
    } finally {
      setCreating(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(freshToken.token);
      setCopied(true);
    } catch {
      // clipboard access can be blocked (permissions, non-HTTPS context) —
      // the token stays selectable/visible either way, so this isn't fatal.
      alertDialog('Could not copy automatically — select and copy the token text manually.');
    }
  }

  async function revoke(token) {
    const ok = await confirmDialog(`Revoke "${token.name}"? Anything using this token will stop working immediately.`, { title: 'Revoke token', danger: true });
    if (!ok) return;
    try {
      await api.revokeToken(token.id);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not revoke token');
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      alertDialog('Could not copy automatically — select and copy the URL manually.');
    }
  }

  return (
    <div>
      <div className="mcp-url-block">
        <div className="settings-hint" style={{ margin: '0 0 4px' }}>Server URL — add this as a custom connector in Claude Desktop, Claude Code, or claude.ai, using a token below as the Bearer credential</div>
        <div className="token-reveal-value">
          <code>{MCP_URL}</code>
          <button type="button" onClick={copyUrl}>{urlCopied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>

      {freshToken && (
        <div className="token-reveal">
          <div className="token-reveal-title">"{freshToken.name}" created</div>
          <p className="settings-hint" style={{ margin: '2px 0 10px' }}>
            Copy it now — this is the only time it's shown. Punchlist doesn't store it in a form it can display again.
          </p>
          <div className="token-reveal-value">
            <code>{freshToken.token}</code>
            <button type="button" onClick={copyToken}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <button type="button" className="ghost" style={{ marginTop: 10 }} onClick={() => setFreshToken(null)}>Done</button>
        </div>
      )}

      {loading ? (
        <p className="settings-hint">Loading…</p>
      ) : (
        <div className="settings-list">
          {tokens.length === 0 && <p className="settings-hint">No tokens yet — create one below to let a script or your own Claude act as you.</p>}
          {tokens.map((t) => (
            <div className={`settings-row token-row token-row-${t.status}`} key={t.id}>
              <div style={{ flex: 1 }}>
                <div className="token-row-name">
                  {t.name}
                  <span className={`token-status-chip token-status-${t.status}`}>{t.status}</span>
                </div>
                <div className="settings-hint" style={{ margin: '2px 0 0' }}>
                  <code>{t.token_prefix}••••</code>
                  {' · created '}{formatDate(t.created_at)}
                  {t.expires_at && `, expires ${formatDate(t.expires_at)}`}
                  {t.last_used_at ? `, last used ${formatDate(t.last_used_at)}` : ', never used'}
                </div>
              </div>
              {t.status === 'active' && (
                <button className="icon-btn danger-hover" onClick={() => revoke(t)} title="Revoke">Revoke</button>
              )}
            </div>
          ))}
        </div>
      )}

      <form className="token-create-form" onSubmit={submitCreate}>
        <input
          type="text"
          placeholder="What's this for? (e.g. Claude Desktop)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={expiryDays ?? 'never'} onChange={(e) => setExpiryDays(e.target.value === 'never' ? null : Number(e.target.value))}>
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.label} value={o.days ?? 'never'}>{o.label}</option>
          ))}
        </select>
        <button type="submit" disabled={creating || !name.trim()}>{creating ? 'Creating…' : 'Create token'}</button>
      </form>
      <p className="settings-hint" style={{ marginTop: 8 }}>
        A token lets whatever holds it act as you — through your own role and permissions, nothing more. Revoke one immediately if it's ever exposed.
      </p>
    </div>
  );
}
