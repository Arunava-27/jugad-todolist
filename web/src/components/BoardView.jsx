import { useState } from 'react';
import { formatDueDate, colorFor, colorForPerson, initials } from '../lib/format.js';
import Icon from './Icon.jsx';

export default function BoardView({ tasks, statuses, priorities, loading, onUpdateTask, onOpenTask, onReorderStatuses, canManage }) {
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [dragColumnStatus, setDragColumnStatus] = useState(null);

  if (loading) return <div className="empty-state">Loading tasks…</div>;

  const columns = statuses.map((s) => ({
    status: s.name,
    color: s.color,
    tasks: tasks.filter((t) => t.status === s.name),
  }));

  function reorderColumns(fromStatus, toStatus) {
    const names = statuses.map((s) => s.name);
    const from = names.indexOf(fromStatus);
    const to = names.indexOf(toStatus);
    if (from === -1 || to === -1) return;
    const reordered = [...statuses];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onReorderStatuses(reordered);
  }

  function handleDrop(e, status) {
    e.preventDefault();
    setDragOverStatus(null);
    // Two independent drag sources can land here: a task card (identified via
    // dataTransfer, since it may be dropped from a fresh drag with no prior
    // state) or a column header being reordered (tracked via local state,
    // since column identity doesn't need to survive outside this component).
    const taskId = Number(e.dataTransfer.getData('text/task-id'));
    if (taskId) {
      onUpdateTask(taskId, { status });
    } else if (dragColumnStatus && dragColumnStatus !== status) {
      reorderColumns(dragColumnStatus, status);
    }
    setDragColumnStatus(null);
  }

  return (
    <div className="board-view">
      {columns.map((col) => (
        <div
          key={col.status}
          className={`board-column ${dragOverStatus === col.status ? 'drag-over' : ''}`}
          style={{ '--column-accent': col.color }}
          onDragOver={(e) => { e.preventDefault(); setDragOverStatus(col.status); }}
          onDragLeave={() => setDragOverStatus(null)}
          onDrop={(e) => handleDrop(e, col.status)}
        >
          <div
            className="board-column-title"
            draggable={canManage}
            onDragStart={canManage ? () => setDragColumnStatus(col.status) : undefined}
            onDragEnd={canManage ? () => setDragColumnStatus(null) : undefined}
            title={canManage ? 'Drag to reorder columns' : undefined}
          >
            {canManage && <span className="drag-handle"><Icon name="grip" size={14} /></span>}
            {col.status} <span className="nav-count">{col.tasks.length}</span>
          </div>
          <div className="board-column-body">
            {col.tasks.map((task) => (
              <div
                key={task.id}
                className="board-card"
                style={{ '--priority-accent': task.priority ? colorFor(priorities, task.priority) : undefined }}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/task-id', String(task.id))}
                onClick={() => onOpenTask(task)}
              >
                <div className="board-card-title">{task.title}</div>
                <div className="task-meta">
                  {task.priority && (
                    <span className="chip" style={{ background: colorFor(priorities, task.priority) + '22', color: colorFor(priorities, task.priority), borderColor: 'transparent' }}>
                      {task.priority.replace(/^[^\s]+\s/, '')}
                    </span>
                  )}
                  {task.due_date && <span className="chip due-chip">{formatDueDate(task.due_date)}</span>}
                  {task.subtask_count > 0 && (
                    <span className="chip"><Icon name="check" size={11} /> {task.subtask_completed_count}/{task.subtask_count}</span>
                  )}
                  {task.labels.map((l) => (
                    <span key={l.name} className="chip label-chip" style={{ background: (l.color || '#94a3b8') + '26', color: l.color }}>{l.name}</span>
                  ))}
                </div>
                {task.members.length > 0 && (
                  <div className="task-assignees board-card-assignees">
                    {task.members.map((m) => (
                      <span key={m.id} className="avatar" style={{ background: colorForPerson(m.name) }} title={m.name}>{initials(m.name)}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
