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

async function upload(path, files) {
  const formData = new FormData();
  for (const file of files) formData.append('files', file);
  // Not strictly required by the attachments routes themselves (self-scoped,
  // see server/src/index.js's mount-order comment for why) — sent anyway so
  // this doesn't silently break again if a route ever ends up depending on
  // it, same as every other request() call already does.
  const headers = {};
  if (activeWorkspaceId) headers['X-Workspace-Id'] = String(activeWorkspaceId);
  const res = await fetch(BASE + path, { method: 'POST', credentials: 'include', headers, body: formData });
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

// Secrets' downloads are behind requireWorkspace (unlike attachments, which
// are self-scoped and can use a plain <a href>) — a bare link can't carry
// the X-Workspace-Id header, so this fetches the bytes with credentials +
// that header and triggers a synthetic save via a throwaway object URL.
async function downloadFile(path, filename) {
  const headers = {};
  if (activeWorkspaceId) headers['X-Workspace-Id'] = String(activeWorkspaceId);
  const res = await fetch(BASE + path, { credentials: 'include', headers });
  if (res.status === 401) {
    const err = new Error('unauthenticated');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    let message = `Download failed: ${res.status}`;
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
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  listTokens: () => request('/tokens'),
  createToken: (data) => request('/tokens', { method: 'POST', body: JSON.stringify(data) }),
  revokeToken: (id) => request(`/tokens/${id}`, { method: 'DELETE' }),

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

  adminListDomains: () => request('/admin/domains'),
  adminCreateDomain: (data) => request('/admin/domains', { method: 'POST', body: JSON.stringify(data) }),
  adminUpdateDomain: (id, data) => request(`/admin/domains/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  adminDeleteDomain: (id, reassignTo) => request(`/admin/domains/${id}${reassignTo ? `?reassign_to=${encodeURIComponent(reassignTo)}` : ''}`, { method: 'DELETE' }),

  listProjects: () => request('/projects'),
  createProject: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  getProjectSummary: (id) => request(`/project-summary/${id}`),
  getWorkspaceOverview: () => request('/overview'),

  listStakeholders: (projectId) => request(`/projects/${projectId}/stakeholders`),
  addStakeholder: (projectId, email) => request(`/projects/${projectId}/stakeholders`, { method: 'POST', body: JSON.stringify({ email }) }),
  removeStakeholder: (projectId, userId) => request(`/projects/${projectId}/stakeholders/${userId}`, { method: 'DELETE' }),

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

  listTaskActivity: (taskId) => request(`/tasks/${taskId}/activity`),
  addTaskComment: (taskId, body) => request(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  deleteTaskActivity: (taskId, activityId) => request(`/tasks/${taskId}/activity/${activityId}`, { method: 'DELETE' }),

  listLabels: () => request('/labels'),
  createLabel: (data) => request('/labels', { method: 'POST', body: JSON.stringify(data) }),
  updateLabel: (id, data) => request(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLabel: (id) => request(`/labels/${id}`, { method: 'DELETE' }),

  listStatuses: () => request('/statuses'),
  createStatus: (data) => request('/statuses', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id, data) => request(`/statuses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteStatus: (id, reassignTo) => request(`/statuses/${id}${reassignTo ? `?reassign_to=${encodeURIComponent(reassignTo)}` : ''}`, { method: 'DELETE' }),

  listPriorities: () => request('/priorities'),
  createPriority: (data) => request('/priorities', { method: 'POST', body: JSON.stringify(data) }),
  updatePriority: (id, data) => request(`/priorities/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePriority: (id, reassignTo) => request(`/priorities/${id}${reassignTo ? `?reassign_to=${encodeURIComponent(reassignTo)}` : ''}`, { method: 'DELETE' }),

  uploadAttachments: (taskId, files) => upload(`/tasks/${taskId}/attachments`, files),
  updateAttachment: (id, data) => request(`/attachments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  reorderAttachments: (taskId, order) => request(`/tasks/${taskId}/attachments/reorder`, { method: 'PATCH', body: JSON.stringify({ order }) }),
  deleteAttachment: (id) => request(`/attachments/${id}`, { method: 'DELETE' }),

  listSections: (projectId) => request(`/sections?project_id=${projectId}`),
  createSection: (data) => request('/sections', { method: 'POST', body: JSON.stringify(data) }),
  updateSection: (id, data) => request(`/sections/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSection: (id) => request(`/sections/${id}`, { method: 'DELETE' }),

  listTeams: (projectId) => request(`/teams?project_id=${projectId}`),
  createTeam: (data) => request('/teams', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id, data) => request(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTeam: (id) => request(`/teams/${id}`, { method: 'DELETE' }),
  addTeamMember: (teamId, userId) => request(`/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  removeTeamMember: (teamId, userId) => request(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),

  listSecrets: (projectId) => request(`/secrets?project_id=${projectId}`),
  createSecret: (data) => request('/secrets', { method: 'POST', body: JSON.stringify(data) }),
  createFileSecret: (projectId, file, notes) => {
    const formData = new FormData();
    formData.append('project_id', String(projectId));
    formData.append('file', file);
    if (notes) formData.append('notes', notes);
    const headers = {};
    if (activeWorkspaceId) headers['X-Workspace-Id'] = String(activeWorkspaceId);
    return fetch(BASE + '/secrets/files', { method: 'POST', credentials: 'include', headers, body: formData }).then(async (res) => {
      if (!res.ok) {
        let message = `Request failed: ${res.status}`;
        try { const body = await res.json(); if (body?.error) message = body.error; } catch { /* ignore */ }
        const err = new Error(message); err.status = res.status; throw err;
      }
      return res.json();
    });
  },
  updateSecret: (id, data) => request(`/secrets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSecret: (id) => request(`/secrets/${id}`, { method: 'DELETE' }),
  revealSecret: (id) => request(`/secrets/${id}/reveal`),
  downloadSecret: (id, filename) => downloadFile(`/secrets/${id}/download`, filename),
  listSecretShares: (id) => request(`/secrets/${id}/shares`),
  shareSecret: (id, userId, canReshare) => request(`/secrets/${id}/shares`, { method: 'POST', body: JSON.stringify({ user_id: userId, can_reshare: !!canReshare }) }),
  unshareSecret: (id, userId) => request(`/secrets/${id}/shares/${userId}`, { method: 'DELETE' }),
  getSecretAccessLog: (id) => request(`/secrets/${id}/access-log`),
};
