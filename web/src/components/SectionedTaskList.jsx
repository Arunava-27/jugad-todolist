import { useState } from 'react';
import { api } from '../lib/api.js';
import { confirmDialog } from '../lib/dialogs.js';
import TaskRow from './TaskRow.jsx';
import Icon from './Icon.jsx';

const NO_SECTION = '__none__';

export default function SectionedTaskList({
  tasks, sections, projectId, priorities, loading, onToggleComplete, onOpenTask, onTaskMoved, onSectionsChanged, canManage,
}) {
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [dragSectionId, setDragSectionId] = useState(null);
  const [dragOverSectionId, setDragOverSectionId] = useState(null);

  if (loading) return <div className="empty-state">Loading tasks…</div>;

  const bySection = new Map();
  bySection.set(NO_SECTION, []);
  for (const s of sections) bySection.set(s.id, []);
  for (const t of tasks) {
    const key = t.section_id && bySection.has(t.section_id) ? t.section_id : NO_SECTION;
    bySection.get(key).push(t);
  }

  const groups = [{ id: NO_SECTION, name: null }, ...sections.map((s) => ({ id: s.id, name: s.name }))];

  async function submitNewSection(e) {
    e.preventDefault();
    if (!newSectionName.trim()) return;
    await api.createSection({ project_id: projectId, name: newSectionName.trim() });
    setNewSectionName('');
    setAddingSection(false);
    onSectionsChanged();
  }

  async function renameSection(section, name) {
    if (name.trim() && name.trim() !== section.name) {
      await api.updateSection(section.id, { name: name.trim() });
      onSectionsChanged();
    }
  }

  async function deleteSection(section) {
    const ok = await confirmDialog(`Delete section "${section.name}"? Its tasks move to (No section), they won't be deleted.`, { title: 'Delete section', danger: true });
    if (!ok) return;
    await api.deleteSection(section.id);
    onSectionsChanged();
  }

  function handleTaskDrop(e, targetSectionId) {
    e.preventDefault();
    const taskId = Number(e.dataTransfer.getData('text/task-id'));
    if (taskId) onTaskMoved(taskId, targetSectionId === NO_SECTION ? null : targetSectionId);
  }

  function handleSectionDrop(targetSectionId) {
    setDragOverSectionId(null);
    if (!dragSectionId || dragSectionId === targetSectionId || targetSectionId === NO_SECTION) { setDragSectionId(null); return; }
    const ids = sections.map((s) => s.id);
    const from = ids.indexOf(dragSectionId);
    const to = ids.indexOf(targetSectionId);
    setDragSectionId(null);
    if (from === -1 || to === -1) return;
    const reordered = [...sections];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    Promise.all(reordered.map((s, idx) => api.updateSection(s.id, { sort_order: idx }))).then(onSectionsChanged);
  }

  return (
    <div className="sectioned-list">
      {groups.map((g) => (
        <div
          key={g.id}
          className={`task-section ${dragOverSectionId === g.id ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverSectionId(g.id); }}
          onDragLeave={() => setDragOverSectionId((cur) => (cur === g.id ? null : cur))}
          onDrop={(e) => { handleTaskDrop(e, g.id); if (g.id !== NO_SECTION && canManage) handleSectionDrop(g.id); setDragOverSectionId(null); }}
        >
          {g.id !== NO_SECTION ? (
            <div
              className="task-section-header"
              draggable={canManage}
              onDragStart={canManage ? () => setDragSectionId(g.id) : undefined}
            >
              {canManage && <span className="drag-handle" title="Drag to reorder"><Icon name="grip" size={14} /></span>}
              <input
                className="task-section-name"
                defaultValue={g.name}
                onBlur={(e) => renameSection(sections.find((s) => s.id === g.id), e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                disabled={!canManage}
              />
              <span className="nav-count">{bySection.get(g.id).length}</span>
              {canManage && (
                <button className="icon-btn danger-hover" onClick={() => deleteSection(sections.find((s) => s.id === g.id))} title="Delete section"><Icon name="trash" size={14} /></button>
              )}
            </div>
          ) : (
            sections.length > 0 && <div className="task-section-header no-section"><span className="task-section-name">No section</span></div>
          )}

          {bySection.get(g.id).length === 0 ? (
            <div className="task-section-empty">Drop tasks here</div>
          ) : (
            <ul className="task-list">
              {bySection.get(g.id).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  priorities={priorities}
                  onToggleComplete={onToggleComplete}
                  onOpenTask={onOpenTask}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/task-id', String(task.id))}
                />
              ))}
            </ul>
          )}
        </div>
      ))}

      {canManage && (addingSection ? (
        <form className="settings-add-row" onSubmit={submitNewSection} style={{ margin: '8px 28px' }}>
          <input
            autoFocus
            placeholder="Section name"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            onBlur={() => { if (!newSectionName.trim()) setAddingSection(false); }}
          />
          <button type="submit" disabled={!newSectionName.trim()}>Add</button>
        </form>
      ) : (
        <button className="quick-add-trigger" onClick={() => setAddingSection(true)}><Icon name="plus" size={14} /> Add section</button>
      ))}
    </div>
  );
}
