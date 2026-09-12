import { useState } from 'react';
import { api } from '../lib/api.js';
import SettingsList from '../components/SettingsList.jsx';
import MembersPanel from '../components/MembersPanel.jsx';
import ProjectStakeholders from '../components/ProjectStakeholders.jsx';
import Icon from '../components/Icon.jsx';
import { ACCENT_PRESETS, getTheme, getAccent, setTheme, setAccent } from '../lib/theme.js';
import { PROJECT_STAGES } from '../lib/projectStages.js';
import { confirmDialog } from '../lib/dialogs.js';

const TABS = ['Appearance', 'Workflow', 'Labels', 'Members', 'Projects', 'Stakeholders'];

export default function Settings({ statuses, priorities, labels, projects, workspaceId, currentUserId, onChange }) {
  const [tab, setTab] = useState('Appearance');
  const [expandedProjectId, setExpandedProjectId] = useState(null);
  const [theme, setThemeState] = useState(getTheme());
  const [accent, setAccentState] = useState(getAccent());

  function chooseTheme(t) {
    setTheme(t);
    setThemeState(t);
  }
  function chooseAccent(c) {
    setAccent(c);
    setAccentState(c);
  }

  return (
    <div className="settings-page">
      <div className="settings-body">
        <nav className="settings-tabs">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>

        <div className="settings-panel">
          {tab === 'Appearance' && (
            <>
              <h3>Appearance</h3>
              <p className="settings-hint">Only affects how the app looks in this browser.</p>

              <div className="appearance-block">
                <div>Theme</div>
                <div className="theme-options">
                  {['system', 'light', 'dark'].map((t) => (
                    <button key={t} className={theme === t ? 'active' : ''} onClick={() => chooseTheme(t)}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="appearance-block">
                <div>Accent color</div>
                <div className="accent-swatches">
                  {ACCENT_PRESETS.map((c) => (
                    <button
                      key={c}
                      className={`accent-swatch ${accent === c ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => chooseAccent(c)}
                      title={c}
                    />
                  ))}
                  <input
                    type="color"
                    value={accent}
                    onChange={(e) => chooseAccent(e.target.value)}
                    title="Custom color"
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--line)', padding: 0 }}
                  />
                </div>
              </div>
            </>
          )}

          {tab === 'Workflow' && (
            <>
              <h3>Statuses</h3>
              <p className="settings-hint">These become your board columns, in this order. Drag the handle to reorder. The check marks which status counts as "done" and which is the default for new tasks.</p>
              <SettingsList
                items={statuses}
                reorderable
                addPlaceholder="New status name"
                onCreate={(data) => api.createStatus(data).then(onChange)}
                onUpdate={(id, patch) => api.updateStatus(id, patch).then(onChange)}
                onDelete={(id, reassignTo) => api.deleteStatus(id, reassignTo).then(onChange)}
                onReorder={(ordered) => Promise.all(ordered.map((item, idx) => api.updateStatus(item.id, { sort_order: idx }))).then(onChange)}
                renderRowExtra={(item, patch) => (
                  <>
                    <label title="Counts as completed">
                      <input type="checkbox" checked={!!item.is_done} onChange={(e) => patch({ is_done: e.target.checked })} /> Done
                    </label>
                    <label title="Default status for new tasks">
                      <input type="radio" name="default-status" checked={!!item.is_default} onChange={() => patch({ is_default: true })} /> Default
                    </label>
                  </>
                )}
              />

              <h3 style={{ marginTop: 28 }}>Priorities</h3>
              <p className="settings-hint">Shown as flags/chips on tasks. Drag the handle to reorder.</p>
              <SettingsList
                items={priorities}
                reorderable
                addPlaceholder="New priority name"
                onCreate={(data) => api.createPriority(data).then(onChange)}
                onUpdate={(id, patch) => api.updatePriority(id, patch).then(onChange)}
                onDelete={(id, reassignTo) => api.deletePriority(id, reassignTo).then(onChange)}
                onReorder={(ordered) => Promise.all(ordered.map((item, idx) => api.updatePriority(item.id, { sort_order: idx }))).then(onChange)}
              />
            </>
          )}

          {tab === 'Labels' && (
            <>
              <h3>Labels</h3>
              <p className="settings-hint">Used to tag and filter tasks. Drag the handle to reorder.</p>
              <SettingsList
                items={labels}
                reorderable
                addPlaceholder="New label name"
                onCreate={(data) => api.createLabel(data).then(onChange)}
                onUpdate={(id, patch) => api.updateLabel(id, patch).then(onChange)}
                onDelete={(id) => api.deleteLabel(id).then(onChange)}
                onReorder={(ordered) => Promise.all(ordered.map((item, idx) => api.updateLabel(item.id, { sort_order: idx }))).then(onChange)}
              />
            </>
          )}

          {tab === 'Members' && (
            <>
              <h3>Members</h3>
              <p className="settings-hint">Who has access to this workspace's projects and tasks.</p>
              <MembersPanel workspaceId={workspaceId} currentUserId={currentUserId} />
            </>
          )}

          {tab === 'Projects' && (
            <>
              <h3>Projects</h3>
              <p className="settings-hint">Rename, recolor, archive, delete, or reorder projects. Drag the handle to reorder — this is the order they show in the sidebar.</p>
              <SettingsList
                items={projects}
                reorderable
                addPlaceholder="New project name"
                onCreate={(data) => api.createProject(data).then(onChange)}
                onUpdate={(id, patch) => api.updateProject(id, patch).then(onChange)}
                onDelete={async (id) => {
                  const p = projects.find((x) => x.id === id);
                  const ok = await confirmDialog(`Delete "${p?.name}"? Its tasks will move to Inbox, not be deleted.`, { title: 'Delete project', danger: true });
                  if (!ok) return;
                  return api.deleteProject(id).then(onChange);
                }}
                onReorder={(ordered) => Promise.all(ordered.map((item, idx) => api.updateProject(item.id, { sort_order: idx }))).then(onChange)}
                renderRowExtra={(item, patch) => (
                  <>
                    <select value={item.status || ''} onChange={(e) => patch({ status: e.target.value })} title="Lifecycle stage">
                      <option value="">No stage</option>
                      {PROJECT_STAGES.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
                    </select>
                    <label title="Hide from the sidebar's main project list">
                      <input type="checkbox" checked={!!item.is_archived} onChange={(e) => patch({ is_archived: e.target.checked })} /> Archived
                    </label>
                  </>
                )}
              />
            </>
          )}

          {tab === 'Stakeholders' && (
            <>
              <h3>Stakeholders</h3>
              <p className="settings-hint">
                Grant someone read-only, high-level visibility into ONE project — stage, dates, progress,
                who's on it — without adding them to this workspace at all. Open a project to manage who
                has that access.
              </p>
              <div className="settings-list">
                {projects.map((p) => (
                  <div key={p.id}>
                    <button
                      className="settings-row"
                      style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                      onClick={() => setExpandedProjectId((cur) => (cur === p.id ? null : p.id))}
                    >
                      <span className="dot" style={{ background: p.color }} />
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <Icon name="chevron" size={14} style={{ transform: expandedProjectId === p.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                    {expandedProjectId === p.id && (
                      <div className="admin-scope-cell">
                        <ProjectStakeholders projectId={p.id} />
                      </div>
                    )}
                  </div>
                ))}
                {projects.length === 0 && <div className="settings-hint">No projects in this workspace yet.</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
