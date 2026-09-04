import { useState } from 'react';
import { api } from '../lib/api.js';
import SettingsList from '../components/SettingsList.jsx';
import MembersPanel from '../components/MembersPanel.jsx';
import { ACCENT_PRESETS, getTheme, getAccent, setTheme, setAccent } from '../lib/theme.js';

const TABS = ['Appearance', 'Workflow', 'Labels', 'People', 'Members', 'Projects'];

export default function Settings({ statuses, priorities, labels, assignees, projects, workspaceId, currentUserId, onChange }) {
  const [tab, setTab] = useState('Appearance');
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
                    style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--border)', padding: 0 }}
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

          {tab === 'People' && (
            <>
              <h3>People</h3>
              <p className="settings-hint">Assignees shown as colored initials on tasks. Drag the handle to reorder.</p>
              <SettingsList
                items={assignees}
                reorderable
                addPlaceholder="New person's name"
                onCreate={(data) => api.createAssignee(data).then(onChange)}
                onUpdate={(id, patch) => api.updateAssignee(id, patch).then(onChange)}
                onDelete={(id) => api.deleteAssignee(id).then(onChange)}
                onReorder={(ordered) => Promise.all(ordered.map((item, idx) => api.updateAssignee(item.id, { sort_order: idx }))).then(onChange)}
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
              <p className="settings-hint">Rename, recolor, archive, or delete projects.</p>
              <div className="settings-list">
                {projects.map((p) => (
                  <div className="settings-row" key={p.id}>
                    <input
                      type="color"
                      value={p.color || '#6366f1'}
                      onChange={(e) => api.updateProject(p.id, { color: e.target.value }).then(onChange)}
                    />
                    <input
                      type="text"
                      defaultValue={p.name}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value.trim() !== p.name) {
                          api.updateProject(p.id, { name: e.target.value.trim() }).then(onChange);
                        }
                      }}
                    />
                    <div className="settings-row-flags">
                      <label>
                        <input
                          type="checkbox"
                          checked={!!p.is_archived}
                          onChange={(e) => api.updateProject(p.id, { is_archived: e.target.checked }).then(onChange)}
                        /> Archived
                      </label>
                    </div>
                    <button
                      className="icon-btn danger-hover"
                      title="Delete project (tasks become unassigned, not deleted)"
                      onClick={() => {
                        if (confirm(`Delete "${p.name}"? Its tasks will move to Inbox, not be deleted.`)) {
                          api.deleteProject(p.id).then(onChange);
                        }
                      }}
                    >🗑</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
