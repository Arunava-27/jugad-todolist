import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { alertDialog } from '../lib/dialogs.js';
import { colorForPerson, initials } from '../lib/format.js';
import Icon from './Icon.jsx';

function when(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// A human-readable line for a system-logged change — never client-supplied,
// always derived from what the server actually recorded (see tasks.js's
// logActivity calls), so this stays honest even if the UI copy drifts.
function describe(entry) {
  const who = entry.user_name || 'Someone';
  const meta = entry.meta || {};
  switch (entry.type) {
    case 'created': return `${who} created this task`;
    case 'status': return `${who} changed status from ${meta.from || 'none'} to ${meta.to || 'none'}`;
    case 'priority': return `${who} changed priority from ${meta.from || 'None'} to ${meta.to || 'None'}`;
    case 'due_date':
      if (!meta.from) return `${who} set the due date to ${meta.to}`;
      if (!meta.to) return `${who} cleared the due date`;
      return `${who} moved the due date from ${meta.from} to ${meta.to}`;
    case 'completed': return `${who} completed this task`;
    case 'reopened': return `${who} reopened this task`;
    case 'assignee_added': return `${who} assigned ${meta.name || 'someone'}`;
    case 'assignee_removed': return `${who} unassigned ${meta.name || 'someone'}`;
    default: return `${who} updated this task`;
  }
}

const EVENT_ICON = {
  created: 'plus', status: 'check', priority: 'flag', due_date: 'calendar',
  completed: 'check', reopened: 'x', assignee_added: 'user', assignee_removed: 'user',
};

export default function TaskActivity({ taskId, currentUserId, readOnly }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);

  const refresh = useCallback(() => {
    api.listTaskActivity(taskId).then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function submitComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    setPosting(true);
    try {
      await api.addTaskComment(taskId, comment.trim());
      setComment('');
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not post comment');
    } finally {
      setPosting(false);
    }
  }

  async function removeComment(id) {
    try {
      await api.deleteTaskActivity(taskId, id);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not delete comment');
    }
  }

  if (loading) return <div className="settings-hint">Loading…</div>;

  return (
    <div className="task-activity">
      <div className="task-activity-list">
        {entries.length === 0 && <div className="settings-hint">Nothing here yet.</div>}
        {entries.map((entry) => (
          entry.type === 'comment' ? (
            <div className="activity-comment" key={entry.id}>
              <span className="avatar" style={{ background: colorForPerson(entry.user_name || '?') }}>{initials(entry.user_name || '?')}</span>
              <div className="activity-comment-body">
                <div className="activity-comment-head">
                  <strong>{entry.user_name || 'Someone'}</strong>
                  <span className="settings-hint" style={{ margin: 0 }}>{when(entry.created_at)}</span>
                  {!readOnly && entry.user_id === currentUserId && (
                    <button className="icon-btn danger-hover activity-comment-delete" title="Delete comment" onClick={() => removeComment(entry.id)}>
                      <Icon name="trash" size={12} />
                    </button>
                  )}
                </div>
                <p>{entry.body}</p>
              </div>
            </div>
          ) : (
            <div className="activity-event" key={entry.id}>
              <Icon name={EVENT_ICON[entry.type] || 'check'} size={13} />
              <span>{describe(entry)}</span>
              <span className="settings-hint activity-event-time">{when(entry.created_at)}</span>
            </div>
          )
        ))}
      </div>

      {!readOnly && (
        <form className="activity-comment-form" onSubmit={submitComment}>
          <textarea
            placeholder="Add a comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
          />
          <button type="submit" disabled={posting || !comment.trim()}>{posting ? 'Posting…' : 'Comment'}</button>
        </form>
      )}
    </div>
  );
}
