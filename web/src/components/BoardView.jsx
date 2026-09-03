import { useState } from 'react';
import { formatDueDate, colorFor } from '../lib/format.js';

export default function BoardView({ tasks, statuses, priorities, loading, onUpdateTask, onOpenTask }) {
  const [dragOverStatus, setDragOverStatus] = useState(null);

  if (loading) return <div className="empty-state">Loading tasks…</div>;

  const columns = statuses.map((s) => ({
    status: s.name,
    color: s.color,
    tasks: tasks.filter((t) => t.status === s.name),
  }));

  function handleDrop(e, status) {
    e.preventDefault();
    setDragOverStatus(null);
    const taskId = Number(e.dataTransfer.getData('text/task-id'));
    if (!taskId) return;
    onUpdateTask(taskId, { status });
  }

  return (
    <div className="board-view">
      {columns.map((col) => (
        <div
          key={col.status}
          className={`board-column ${dragOverStatus === col.status ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverStatus(col.status); }}
          onDragLeave={() => setDragOverStatus(null)}
          onDrop={(e) => handleDrop(e, col.status)}
        >
          <div className="board-column-title">
            <span className="dot" style={{ background: col.color }} /> {col.status} <span className="nav-count">{col.tasks.length}</span>
          </div>
          <div className="board-column-body">
            {col.tasks.map((task) => (
              <div
                key={task.id}
                className="board-card"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/task-id', String(task.id))}
                onClick={() => onOpenTask(task)}
              >
                <div className="board-card-title">{task.title}</div>
                <div className="task-meta">
                  {task.priority && (
                    <span className="chip" style={{ background: colorFor(priorities, task.priority) + '22', color: colorFor(priorities, task.priority) }}>
                      {task.priority.replace(/^[^\s]+\s/, '')}
                    </span>
                  )}
                  {task.due_date && <span className="chip due-chip">{formatDueDate(task.due_date)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
