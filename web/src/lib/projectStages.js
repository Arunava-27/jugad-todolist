// A project's lifecycle stage — independent of `is_archived` (which is
// purely a sidebar-visibility toggle) and independent of task statuses
// (which are per-workspace and drive the board columns). Stored directly in
// `projects.status`, a plain string column, so this is just the fixed
// vocabulary the UI offers rather than a separate managed list.
export const PROJECT_STAGES = [
  { value: 'Planning', color: '#94a3b8' },
  { value: 'Active', color: '#6366f1' },
  { value: 'On Hold', color: '#e2c53d' },
  { value: 'Testing', color: '#a855f7' },
  { value: 'Launched', color: '#22c55e' },
];

export function stageColor(stage) {
  return PROJECT_STAGES.find((s) => s.value === stage)?.color || '#94a3b8';
}
