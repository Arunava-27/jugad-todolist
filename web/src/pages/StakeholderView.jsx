import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Logo } from '../components/Icon.jsx';
import { stageColor } from '../lib/projectStages.js';
import { colorForPerson, initials } from '../lib/format.js';

// The landing view for someone who's a stakeholder on one or more projects
// but not a member of any workspace — a project-scoped, read-only lane
// entirely separate from the normal workspace UI. Deliberately shows only
// high-level progress (stage, dates, completion, who's on it), never
// individual task titles, descriptions, or attachments.
export default function StakeholderView({ userName, projects, onLogout }) {
  const [selectedId, setSelectedId] = useState(projects[0]?.id ?? null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    api.getProjectSummary(selectedId).then(setSummary).catch(() => setSummary(null)).finally(() => setLoading(false));
  }, [selectedId]);

  const pct = summary?.task_count ? Math.round((summary.completed_count / summary.task_count) * 100) : 0;

  return (
    <div className="stakeholder-shell">
      <header className="stakeholder-header">
        <div className="login-brand"><Logo size={24} /><h1>Punchlist</h1></div>
        <div className="stakeholder-header-right">
          <span className="settings-hint" style={{ margin: 0 }}>{userName} — stakeholder view</span>
          <button className="ghost" onClick={onLogout}>Log out</button>
        </div>
      </header>

      <div className="stakeholder-body">
        <nav className="stakeholder-list">
          {projects.map((p) => (
            <button
              key={p.id}
              className={`nav-item ${selectedId === p.id ? 'active' : ''}`}
              onClick={() => setSelectedId(p.id)}
            >
              <span className="nav-item-label">{p.name}</span>
            </button>
          ))}
        </nav>

        <main className="stakeholder-detail">
          {loading && <div className="settings-hint">Loading…</div>}
          {!loading && summary && (
            <>
              <div className="stakeholder-title-row">
                <h2>{summary.name}</h2>
                {summary.status && (
                  <span className="chip status-chip" style={{ background: stageColor(summary.status) + '26', color: stageColor(summary.status) }}>
                    {summary.status}
                  </span>
                )}
              </div>
              <div className="settings-hint" style={{ margin: '2px 0 18px' }}>{summary.workspace_name}</div>

              {summary.description && <p className="stakeholder-description">{summary.description}</p>}

              <div className="stakeholder-stats">
                {(summary.start_date || summary.target_date) && (
                  <div className="stakeholder-stat">
                    <div className="settings-hint" style={{ margin: 0 }}>Timeline</div>
                    <div>{summary.start_date || '—'} → {summary.target_date || '—'}</div>
                  </div>
                )}
                <div className="stakeholder-stat">
                  <div className="settings-hint" style={{ margin: 0 }}>Progress</div>
                  <div className="stakeholder-progress">
                    <div className="stakeholder-progress-track">
                      <div className="stakeholder-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span>{summary.completed_count}/{summary.task_count} tasks ({pct}%)</span>
                  </div>
                </div>
              </div>

              {summary.by_status.length > 0 && (
                <div className="stakeholder-stat" style={{ marginTop: 18 }}>
                  <div className="settings-hint" style={{ margin: '0 0 6px' }}>By status</div>
                  <div className="quick-add-preview">
                    {summary.by_status.map((s) => (
                      <span key={s.status} className="chip">{s.status || 'No status'} — {s.count}</span>
                    ))}
                  </div>
                </div>
              )}

              {summary.team.length > 0 && (
                <div className="stakeholder-stat" style={{ marginTop: 18 }}>
                  <div className="settings-hint" style={{ margin: '0 0 6px' }}>Team</div>
                  <div className="task-assignees">
                    {summary.team.map((m) => (
                      <span key={m.id} className="avatar" style={{ background: colorForPerson(m.name) }} title={m.domain_name ? `${m.name} — ${m.domain_name}` : m.name}>{initials(m.name)}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
