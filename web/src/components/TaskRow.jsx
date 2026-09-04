import { formatDueDate, isOverdue, initials, colorFor } from '../lib/format.js';

export default function TaskRow({ task, priorities, onToggleComplete, onOpenTask, draggable, onDragStart }) {
  return (
    <li
      className={`task-row ${task.is_completed ? 'completed' : ''}`}
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, task) : undefined}
    >
      <button
        className="task-checkbox"
        style={{ borderColor: colorFor(priorities, task.priority) }}
        onClick={() => onToggleComplete(task)}
        aria-label="Toggle complete"
      >
        {task.is_completed && '✓'}
      </button>

      <div className="task-main" onClick={() => onOpenTask(task)}>
        <span className="task-title">
          {task.notion_task_number && <span className="task-num">#{task.notion_task_number}</span>}
          {task.title}
        </span>
        <div className="task-meta">
          {task.due_date && (
            <span className={`chip due-chip ${isOverdue(task.due_date, task.is_completed) ? 'overdue' : ''}`}>
              {formatDueDate(task.due_date)}
            </span>
          )}
          {task.labels.map((l) => (
            <span key={l.name} className="chip label-chip" style={{ background: (l.color || '#94a3b8') + '26', color: l.color }}>{l.name}</span>
          ))}
          {task.status && (
            <span className="chip status-chip">{task.status}</span>
          )}
        </div>
      </div>

      {task.assignees.length > 0 && (
        <div className="task-assignees">
          {task.assignees.map((a) => (
            <span key={a.name} className="avatar" style={{ background: a.color || 'var(--accent)' }} title={a.name}>{initials(a.name)}</span>
          ))}
        </div>
      )}
    </li>
  );
}
