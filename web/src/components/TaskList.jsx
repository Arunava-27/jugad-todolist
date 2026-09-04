import TaskRow from './TaskRow.jsx';

export default function TaskList({ tasks, priorities, loading, onToggleComplete, onOpenTask }) {
  if (loading) return <div className="empty-state">Loading tasks…</div>;
  if (tasks.length === 0) return <div className="empty-state">Nothing here. 🎉</div>;

  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          priorities={priorities}
          onToggleComplete={onToggleComplete}
          onOpenTask={onOpenTask}
        />
      ))}
    </ul>
  );
}
