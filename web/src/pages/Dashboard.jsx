import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { colorForPerson, initials } from '../lib/format.js';
import { stageColor } from '../lib/projectStages.js';

// The workspace-wide rollup for whoever's actually running it — project
// counts by stage, what's overdue and where, and who's carrying how much.
// Manager+ only (the nav entry is hidden for anyone else, and the backend
// enforces the same gate independently).
export default function Dashboard({ onOpenProject }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    api.getWorkspaceOverview().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!data) return <div className="empty-state">Couldn't load the workspace overview.</div>;

  return (
    <div className="dashboard">
      <div className="dashboard-stats">
        <div className="overview-stat">
          <div className="overview-label">Projects</div>
          <div className="dashboard-big">{data.project_count}</div>
        </div>
        <div className="overview-stat">
          <div className="overview-label">Tasks</div>
          <div className="dashboard-big">{data.task_completed}<span className="dashboard-big-of">/{data.task_total}</span></div>
          <div className="settings-hint" style={{ margin: '2px 0 0' }}>done</div>
        </div>
        <div className="overview-stat">
          <div className="overview-label">Overdue</div>
          <div className="dashboard-big" style={{ color: data.overdue_total > 0 ? 'var(--danger)' : 'inherit' }}>{data.overdue_total}</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-block">
          <h3>Projects by stage</h3>
          {data.by_stage.length === 0 ? (
            <p className="settings-hint">No projects yet.</p>
          ) : (
            <div className="dashboard-bars">
              {data.by_stage.map((s) => (
                <div className="dashboard-bar-row" key={s.stage}>
                  <span className="dashboard-bar-label">{s.stage}</span>
                  <div className="dashboard-bar-track">
                    <div className="dashboard-bar-fill" style={{ width: `${(s.count / data.project_count) * 100}%`, background: stageColor(s.stage) }} />
                  </div>
                  <span className="dashboard-bar-count">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-block">
          <h3>Overdue by project</h3>
          {data.overdue_by_project.length === 0 ? (
            <p className="settings-hint">Nothing overdue anywhere. 🎉</p>
          ) : (
            <div className="settings-list">
              {data.overdue_by_project.map((p) => (
                <button key={p.id} className="settings-row dashboard-clickable-row" onClick={() => onOpenProject(p.id)}>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span className="chip due-chip overdue">{p.count} overdue</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-block dashboard-block-wide">
          <h3>Capacity</h3>
          <p className="settings-hint" style={{ marginTop: -6 }}>
            Estimated hours on open tasks vs. a weekly capacity (set per person in Admin → Users, 40h by
            default). A rough gauge, not a schedule — it doesn't account for due dates, and a task with no
            estimate still counts toward the task total but adds 0 hours here.
          </p>
          {data.by_person.length === 0 ? (
            <p className="settings-hint">No open tasks are assigned to anyone yet.</p>
          ) : (
            <div className="dashboard-bars">
              {data.by_person.map((p) => {
                const pct = p.capacity_hours > 0 ? (p.estimated_hours / p.capacity_hours) * 100 : 0;
                const over = p.estimated_hours > p.capacity_hours;
                const near = !over && pct >= 80;
                return (
                  <div className="dashboard-bar-row" key={p.id}>
                    <span className="dashboard-bar-label dashboard-person-label">
                      <span className="avatar" style={{ background: colorForPerson(p.name) }}>{initials(p.name)}</span>
                      {p.name}
                    </span>
                    <div className="dashboard-bar-track">
                      <div
                        className="dashboard-bar-fill"
                        style={{ width: `${Math.min(100, pct)}%`, background: over ? 'var(--danger)' : near ? '#b7791f' : 'var(--accent)' }}
                      />
                    </div>
                    <span className="dashboard-bar-count" style={{ color: over ? 'var(--danger)' : undefined }}>
                      {p.estimated_hours}h / {p.capacity_hours}h
                    </span>
                    <span className="settings-hint dashboard-task-count">
                      {p.task_count} task{p.task_count === 1 ? '' : 's'}
                      {p.unestimated_count > 0 && ` (${p.unestimated_count} unestimated)`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
