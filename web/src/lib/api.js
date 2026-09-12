const BASE = '/api';

let activeWorkspaceId = null;
export function setActiveWorkspaceId(id) {
  activeWorkspaceId = id || null;
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (activeWorkspaceId && !('X-Workspace-Id' in headers)) {
    headers['X-Workspace-Id'] = String(activeWorkspaceId);
  }
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers,
    ...options,
  });
  if (res.status === 401) {
    const err = new Error('unauthenticated');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    let body = null;
    try {
      body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    const err = new Error(message);
    err.status = res.status;
    if (body && typeof body.count === 'number') err.count = body.count;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

async function upload(path, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(BASE + path, { method: 'POST', credentials: 'include', body: formData });
  if (res.status === 401) {
    const err = new Error('unauthenticated');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    let message = `Upload failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  me: () => request('/auth/me'),
  register: (email, name, password, { inviteToken, organizationName } = {}) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password, inviteToken, organizationName }) }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  getInvite: (token) => request(`/invites/${token}`),
  acceptInvite: (token) => request(`/invites/${token}/accept`, { method: 'POST' }),

  listWorkspaces: () => request('/workspaces'),
  createWorkspace: (name) => request('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
  updateWorkspace: (id, data) => request(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteWorkspace: (id) => request(`/workspaces/${id}`, { method: 'DELETE' }),
  listWorkspaceMembers: (id) => request(`/workspaces/${id}/members`),
  addWorkspaceMember: (id, email, role) => request(`/workspaces/${id}/members`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  updateWorkspaceMember: (id, userId, role) => request(`/workspaces/${id}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeWorkspaceMember: (id, userId) => request(`/workspaces/${id}/members/${userId}`, { method: 'DELETE' }),
  revokeInvite: (id, inviteId) => request(`/workspaces/${id}/invites/${inviteId}`, { method: 'DELETE' }),

  adminGetOrganization: () => request('/admin/organization'),
  adminUpdateOrganization: (data) => request('/admin/organization', { method: 'PATCH', body: JSON.stringify(data) }),
  adminListUsers: () => request('/admin/users'),
  adminUpdateUser: (id, data) => request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  adminDeleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  adminUserMemberships: (id) => request(`/admin/users/${id}/memberships`),
  adminListWorkspaces: () => request('/admin/workspaces'),

  listProjects: () => request('/projects'),
  createProject: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),

  listTasks: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const s = qs.toString();
    return request(`/tasks${s ? `?${s}` : ''}`);
  },
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  listSubtasks: (parentTaskId) => request(`/tasks?parent_task_id=${parentTaskId}`),
  createSubtask: (parentTaskId, title) => request('/tasks', { method: 'POST', body: JSON.stringify({ title, parent_task_id: parentTaskId }) }),

  listLabels: () => request('/labels'),
  createLabel: (data) => request('/labels', { method: 'POST', body: JSON.stringify(data) }),
  updateLabel: (id, data) => request(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLabel: (id) => request(`/labels/${id}`, { method: 'DELETE' }),

  listAssignees: () => request('/assignees'),
  createAssignee: (data) => request('/assignees', { method: 'POST', body: JSON.stringify(data) }),
  updateAssignee: (id, data) => request(`/assignees/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAssignee: (id) => request(`/assignees/${id}`, { method: 'DELETE' }),

  listStatuses: () => request('/statuses'),
  createStatus: (data) => request('/statuses', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id, data) => request(`/statuses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteStatus: (id, reassignTo) => request(`/statuses/${id}${reassignTo ? `?reassign_to=${encodeURIComponent(reassignTo)}` : ''}`, { method: 'DELETE' }),

  listPriorities: () => request('/priorities'),
  createPriority: (data) => request('/priorities', { method: 'POST', body: JSON.stringify(data) }),
  updatePriority: (id, data) => request(`/priorities/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePriority: (id, reassignTo) => request(`/priorities/${id}${reassignTo ? `?reassign_to=${encodeURIComponent(reassignTo)}` : ''}`, { method: 'DELETE' }),

  uploadAttachment: (taskId, file) => upload(`/tasks/${taskId}/attachments`, file),
  deleteAttachment: (id) => request(`/attachments/${id}`, { method: 'DELETE' }),

  listSections: (projectId) => request(`/sections?project_id=${projectId}`),
  createSection: (data) => request('/sections', { method: 'POST', body: JSON.stringify(data) }),
  updateSection: (id, data) => request(`/sections/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSection: (id) => request(`/sections/${id}`, { method: 'DELETE' }),
};
