import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { colorForPerson, initials } from '../lib/format.js';
import { PROJECT_STAGES } from '../lib/projectStages.js';
import ProjectStakeholders from '../components/ProjectStakeholders.jsx';

// A project's home screen — the "front door" you land on when you open a
// project, before List/Board. Everything about the project itself (stage,
// description, timeline, progress, who's on it, who's watching it as a
// stakeholder) lives here instead of being scattered across two Settings
// tabs, so a project reads as a place, not just a filtered task list.
export default function ProjectOverview({ project, readOnly, onProjectChanged }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState(project.description || '');

  const refresh = useCallback(() => {
    setLoading(true);
    api.getProjectSummary(project.id).then(setSummary).catch(() => setSummary(null)).finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setDescription(project.description || ''); }, [project.id, project.description]);

  async function saveField(patch) {
    await api.updateProject(project.id, patch);
    onProjectChanged();
    refresh();
  }

  function saveDescription() {
    if ((project.description || '') !== description) saveField({ description: description || null });
  }

  const pct = summary?.task_count ? Math.round((summary.completed_count / summary.task_count) * 100) : 0;

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!summary) return <div className="empty-state">Couldn't load this project.</div>;

  return (
    <div className="project-overview">
      <div className="overview-grid">
        <div className="overview-main">
          <label className="overview-field">
            <span className="settings-hint" style={{ margin: '0 0 4px' }}>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              placeholder={readOnly ? 'No description yet.' : 'What is this project, and why does it exist?'}
              rows={3}
              disabled={readOnly}
            />
          </label>

          {summary.by_status.length > 0 && (
            <div className="overview-field">
              <span className="settings-hint" style={{ margin: '0 0 6px' }}>By status</span>
              <div className="quick-add-preview">
                {summary.by_status.map((s) => (
                  <span key={s.status} className="chip">{s.status || 'No status'} — {s.count}</span>
                ))}
              </div>
            </div>
          )}

          <div className="overview-field">
            <span className="settings-hint" style={{ margin: '0 0 6px' }}>Team</span>
            {summary.team.length === 0 ? (
              <p className="settings-hint" style={{ margin: 0 }}>No one's assigned to a task here yet.</p>
            ) : (
              <div className="overview-team">
                {summary.team.map((m) => (
                  <div key={m.id} className="overview-person">
                    <span className="avatar" style={{ background: colorForPerson(m.name) }}>{initials(m.name)}</span>
                    <span>{m.name}</span>
                    {m.domain_name && <span className="domain-tag" style={{ color: m.domain_color, borderColor: m.domain_color }}>{m.domain_name}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="overview-field">
            <span className="settings-hint" style={{ margin: '0 0 6px' }}>
              Stakeholders — read-only, high-level access for people outside the workspace
            </span>
            <ProjectStakeholders projectId={project.id} />
          </div>
        </div>

        <div className="overview-side">
          <div className="overview-stat">
            <div className="overview-label">Stage</div>
            <select value={project.status || ''} onChange={(e) => saveField({ status: e.target.value })} disabled={readOnly}>
              <option value="">No stage</option>
              {PROJECT_STAGES.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
            </select>
          </div>

          <div className="overview-stat">
            <div className="overview-label">Progress</div>
            <div className="stakeholder-progress-track"><div className="stakeholder-progress-fill" style={{ width: `${pct}%` }} /></div>
            <div className="settings-hint" style={{ margin: '4px 0 0' }}>{summary.completed_count} of {summary.task_count} tasks · {pct}%</div>
          </div>

          <div className="overview-stat">
            <div className="overview-label">Start date</div>
            <input type="date" value={project.start_date || ''} onChange={(e) => saveField({ start_date: e.target.value || null })} disabled={readOnly} />
          </div>
          <div className="overview-stat">
            <div className="overview-label">Target date</div>
            <input type="date" value={project.target_date || ''} onChange={(e) => saveField({ target_date: e.target.value || null })} disabled={readOnly} />
          </div>

          {summary.stakeholder_count > 0 && (
            <div className="overview-stat">
              <div className="overview-label">Watching</div>
              <div className="settings-hint" style={{ margin: 0 }}>{summary.stakeholder_count} stakeholder{summary.stakeholder_count === 1 ? '' : 's'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
