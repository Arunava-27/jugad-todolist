import { PRIORITY_COLORS, formatDueDate, isOverdue, initials } from '../lib/format.js';

export default function TaskList({ tasks, loading, onToggleComplete, onOpenTask }) {
  if (loading) return <div className="empty-state">Loading tasks…</div>;
  if (tasks.length === 0) return <div className="empty-state">Nothing here. 🎉</div>;

  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <li key={task.id} className={`task-row ${task.is_completed ? 'completed' : ''}`}>
          <button
            className="task-checkbox"
            style={{ borderColor: PRIORITY_COLORS[task.priority] || '#94a3b8' }}
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
                <span key={l} className="chip label-chip">{l}</span>
              ))}
              {task.status && task.status !== 'Not started' && (
                <span className="chip status-chip">{task.status}</span>
              )}
            </div>
          </div>

          {task.assignees.length > 0 && (
            <div className="task-assignees">
              {task.assignees.map((a) => (
                <span key={a} className="avatar" title={a}>{initials(a)}</span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
