import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { confirmDialog, alertDialog } from '../lib/dialogs.js';
import Icon from './Icon.jsx';

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCESS_LOG_ACTION_LABEL = {
  viewed: 'revealed the value', downloaded: 'downloaded the file', created: 'created this secret',
  updated: 'updated this secret', deleted: 'deleted this secret', shared: 'shared it with someone', unshared: 'removed someone\'s access',
};

// Encrypted, per-secret-shareable project credentials — an AWS key, a
// .pem/.json file, anything that shouldn't sit in a task description or a
// group chat. Manager+ sees and manages every secret in the project;
// anyone else sees only what's been explicitly shared with them (and can,
// if given can_reshare, extend that same secret to someone else). Viewer
// role never reaches this component at all — see ProjectOverview.jsx.
export default function ProjectSecrets({ projectId, members, canManage }) {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState({}); // secretId -> value, auto-cleared after a bit
  const [revealing, setRevealing] = useState(null);
  const [expanded, setExpanded] = useState(null); // { id, mode: 'share' | 'log' }
  const [shares, setShares] = useState([]);
  const [accessLog, setAccessLog] = useState([]);
  const [sharePickerUserId, setSharePickerUserId] = useState('');
  const [sharePickerReshare, setSharePickerReshare] = useState(false);

  const [adding, setAdding] = useState(false); // 'kv' | 'file' | false
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newFile, setNewFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    api.listSecrets(projectId).then(setSecrets).catch(() => setSecrets([])).finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function reveal(secret) {
    if (revealed[secret.id]) {
      setRevealed((r) => { const next = { ...r }; delete next[secret.id]; return next; });
      return;
    }
    setRevealing(secret.id);
    try {
      const { value } = await api.revealSecret(secret.id);
      setRevealed((r) => ({ ...r, [secret.id]: value }));
      setTimeout(() => setRevealed((r) => { if (!(secret.id in r)) return r; const next = { ...r }; delete next[secret.id]; return next; }), 30000);
    } catch (err) {
      alertDialog(err.message || 'Could not reveal this secret');
    } finally {
      setRevealing(null);
    }
  }

  async function copyValue(value) {
    try { await navigator.clipboard.writeText(value); } catch { /* clipboard may be blocked; value stays visible/selectable */ }
  }

  async function download(secret) {
    try {
      await api.downloadSecret(secret.id, secret.file_name);
    } catch (err) {
      alertDialog(err.message || 'Could not download this file');
    }
  }

  async function submitNew(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (adding === 'file') {
        if (!newFile) return;
        await api.createFileSecret(projectId, newFile, newNotes.trim() || undefined);
      } else {
        if (!newKey.trim() || !newValue) return;
        await api.createSecret({ project_id: projectId, key_name: newKey.trim(), value: newValue, notes: newNotes.trim() || undefined });
      }
      setNewKey(''); setNewValue(''); setNewNotes(''); setNewFile(null); setAdding(false);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not create this secret');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSecret(secret) {
    const ok = await confirmDialog(`Delete "${secret.key_name || secret.file_name}"? Anyone it's shared with will lose access immediately. This can't be undone.`, { title: 'Delete secret', danger: true });
    if (!ok) return;
    try {
      await api.deleteSecret(secret.id);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not delete this secret');
    }
  }

  async function toggleExpanded(secret, mode) {
    if (expanded?.id === secret.id && expanded.mode === mode) { setExpanded(null); return; }
    setExpanded({ id: secret.id, mode });
    if (mode === 'share') {
      api.listSecretShares(secret.id).then(setShares).catch(() => setShares([]));
    } else {
      api.getSecretAccessLog(secret.id).then(setAccessLog).catch(() => setAccessLog([]));
    }
  }

  async function addShare(secret) {
    if (!sharePickerUserId) return;
    try {
      await api.shareSecret(secret.id, Number(sharePickerUserId), sharePickerReshare);
      setSharePickerUserId(''); setSharePickerReshare(false);
      api.listSecretShares(secret.id).then(setShares);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not share this secret');
    }
  }

  async function removeShare(secret, userId) {
    try {
      await api.unshareSecret(secret.id, userId);
      api.listSecretShares(secret.id).then(setShares);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not remove their access');
    }
  }

  if (loading) return <div className="settings-hint">Loading…</div>;

  return (
    <div>
      <div className="settings-list">
        {secrets.length === 0 && (
          <p className="settings-hint">
            {canManage ? 'No secrets yet — add a key/value credential or a small file below.' : "Nothing's been shared with you here yet."}
          </p>
        )}
        {secrets.map((s) => {
          const canManageThisShare = canManage || s.can_reshare;
          return (
            <div key={s.id} className="secret-row-wrap">
              <div className="settings-row secret-row">
                <Icon name="lock" size={15} className="secret-lock-icon" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="token-row-name">
                    {s.kind === 'file' ? s.file_name : s.key_name}
                    <span className={`secret-kind-badge secret-kind-${s.kind}`}>{s.kind === 'file' ? 'FILE' : 'KEY/VALUE'}</span>
                  </div>
                  <div className="settings-hint" style={{ margin: '2px 0 0' }}>
                    {s.kind === 'file' && s.file_size != null && `${formatBytes(s.file_size)} · `}
                    {s.notes ? `${s.notes} · ` : ''}
                    added {formatDate(s.created_at)}{s.created_by_name ? ` by ${s.created_by_name}` : ''}
                    {s.shared_with_me && ` · shared by ${s.shared_by_name || 'a manager'}${s.can_reshare ? ' · can re-share' : ''}`}
                    {canManage && s.share_count > 0 && ` · shared with ${s.share_count}`}
                  </div>
                  {revealed[s.id] && (
                    <div className="token-reveal-value" style={{ marginTop: 6 }}>
                      <code>{revealed[s.id]}</code>
                      <button type="button" onClick={() => copyValue(revealed[s.id])}><Icon name="copy" size={13} /></button>
                    </div>
                  )}
                </div>
                <div className="secret-row-actions">
                  {s.kind === 'kv' ? (
                    <button className="icon-btn" onClick={() => reveal(s)} disabled={revealing === s.id} title={revealed[s.id] ? 'Hide' : 'Reveal'}>
                      <Icon name={revealed[s.id] ? 'eyeOff' : 'eye'} size={15} />
                    </button>
                  ) : (
                    <button className="icon-btn" onClick={() => download(s)} title="Download">
                      <Icon name="download" size={15} />
                    </button>
                  )}
                  {canManageThisShare && (
                    <button className="icon-btn" onClick={() => toggleExpanded(s, 'share')} title="Manage access">
                      <Icon name="users" size={15} />
                    </button>
                  )}
                  {canManage && (
                    <>
                      <button className="icon-btn" onClick={() => toggleExpanded(s, 'log')} title="Access log">
                        <Icon name="chart" size={15} />
                      </button>
                      <button className="icon-btn danger-hover" onClick={() => deleteSecret(s)} title="Delete">
                        <Icon name="trash" size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {expanded?.id === s.id && expanded.mode === 'share' && (
                <div className="secret-share-panel">
                  {shares.length === 0 && <p className="settings-hint" style={{ margin: '0 0 8px' }}>Not shared with anyone yet.</p>}
                  {shares.map((sh) => (
                    <div className="secret-share-row" key={sh.user_id}>
                      <span>{sh.name}</span>
                      {sh.can_reshare && <span className="secret-kind-badge secret-kind-kv">CAN RE-SHARE</span>}
                      <button className="icon-btn danger-hover" onClick={() => removeShare(s, sh.user_id)} title="Remove access">
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  ))}
                  <div className="team-add-member" style={{ marginTop: 8 }}>
                    <select value={sharePickerUserId} onChange={(e) => setSharePickerUserId(e.target.value)}>
                      <option value="">Share with…</option>
                      {(members || []).filter((m) => !shares.some((sh) => sh.user_id === m.id)).map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <label className="settings-row-flags" style={{ margin: 0 }}>
                      <input type="checkbox" checked={sharePickerReshare} onChange={(e) => setSharePickerReshare(e.target.checked)} />
                      Can re-share
                    </label>
                    <button onClick={() => addShare(s)} disabled={!sharePickerUserId}>Share</button>
                  </div>
                </div>
              )}

              {expanded?.id === s.id && expanded.mode === 'log' && (
                <div className="secret-share-panel">
                  {accessLog.length === 0 && <p className="settings-hint" style={{ margin: 0 }}>No activity logged yet.</p>}
                  {accessLog.map((entry) => (
                    <div className="secret-log-entry" key={entry.id}>
                      <span><strong>{entry.user_name || 'Someone'}</strong> {ACCESS_LOG_ACTION_LABEL[entry.action] || entry.action}</span>
                      <span className="settings-hint" style={{ margin: 0 }}>{formatDateTime(entry.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canManage && (
        adding ? (
          <form className="settings-add-row" style={{ flexWrap: 'wrap', gap: 8 }} onSubmit={submitNew}>
            {adding === 'kv' ? (
              <>
                <input type="text" placeholder="Name (e.g. AWS_SECRET_ACCESS_KEY)" value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ flex: '1 1 220px' }} />
                <input type="password" placeholder="Value" value={newValue} onChange={(e) => setNewValue(e.target.value)} style={{ flex: '1 1 220px' }} />
              </>
            ) : (
              <input type="file" onChange={(e) => setNewFile(e.target.files?.[0] || null)} style={{ flex: '1 1 220px' }} />
            )}
            <input type="text" placeholder="Notes (optional)" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} style={{ flex: '1 1 220px' }} />
            <button type="submit" disabled={saving || (adding === 'kv' ? (!newKey.trim() || !newValue) : !newFile)}>{saving ? 'Adding…' : 'Add'}</button>
            <button type="button" className="ghost" onClick={() => { setAdding(false); setNewKey(''); setNewValue(''); setNewNotes(''); setNewFile(null); }}>Cancel</button>
          </form>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="quick-add-trigger" onClick={() => setAdding('kv')}><Icon name="plus" size={13} /> Add key/value</button>
            <button className="quick-add-trigger" onClick={() => setAdding('file')}><Icon name="plus" size={13} /> Add file</button>
          </div>
        )
      )}
      {!canManage && (
        <p className="settings-hint" style={{ marginTop: 8 }}>
          Only a manager, admin, or owner can add secrets to this project. Anything shared with you shows up here.
        </p>
      )}
    </div>
  );
}
