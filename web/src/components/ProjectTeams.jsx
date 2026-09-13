import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { confirmDialog, alertDialog } from '../lib/dialogs.js';
import { colorForPerson, initials } from '../lib/format.js';
import Icon from './Icon.jsx';

// Named rosters assembled to work THIS project — e.g. "Core Team", "QA
// Team" — pulling people in across domains (frontend/backend/cloud/QA/...)
// to meet whatever this project actually needs. Independent of `domains`
// (a label, not a group) and of the "who's currently assigned a task here"
// readout elsewhere on Overview (that's computed, this is deliberate). A
// project can have zero, one, or several teams.
export default function ProjectTeams({ projectId, members, readOnly }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingTeam, setAddingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#6366f1');
  const [dragTeamId, setDragTeamId] = useState(null);
  const [dragOverTeamId, setDragOverTeamId] = useState(null);
  const [pickerFor, setPickerFor] = useState(null); // team id whose "add member" picker is open
  const [pickerUserId, setPickerUserId] = useState('');

  const refresh = useCallback(() => {
    api.listTeams(projectId).then(setTeams).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function submitNewTeam(e) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setAddingTeam(true);
    try {
      await api.createTeam({ project_id: projectId, name: newTeamName.trim(), color: newTeamColor });
      setNewTeamName('');
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not create team');
    } finally {
      setAddingTeam(false);
    }
  }

  async function renameTeam(team, name) {
    if (!name.trim() || name.trim() === team.name) return;
    try {
      await api.updateTeam(team.id, { name: name.trim() });
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not rename team');
      refresh(); // revert the input to the real name
    }
  }

  async function recolorTeam(team, color) {
    await api.updateTeam(team.id, { color });
    refresh();
  }

  async function deleteTeam(team) {
    const ok = await confirmDialog(`Delete "${team.name}"? This only removes the team roster — nobody's task assignments change.`, { title: 'Delete team', danger: true });
    if (!ok) return;
    try {
      await api.deleteTeam(team.id);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not delete team');
    }
  }

  function handleDrop(targetId) {
    setDragOverTeamId(null);
    if (!dragTeamId || dragTeamId === targetId) { setDragTeamId(null); return; }
    const ids = teams.map((t) => t.id);
    const from = ids.indexOf(dragTeamId);
    const to = ids.indexOf(targetId);
    setDragTeamId(null);
    if (from === -1 || to === -1) return;
    const reordered = [...teams];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setTeams(reordered); // optimistic
    Promise.all(reordered.map((t, idx) => api.updateTeam(t.id, { sort_order: idx }))).then(refresh).catch(refresh);
  }

  async function addMember(team) {
    if (!pickerUserId) return;
    try {
      await api.addTeamMember(team.id, Number(pickerUserId));
      setPickerUserId('');
      setPickerFor(null);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not add them to the team');
    }
  }

  async function removeMember(team, userId) {
    try {
      await api.removeTeamMember(team.id, userId);
      refresh();
    } catch (err) {
      alertDialog(err.message || 'Could not remove them from the team');
    }
  }

  if (loading) return <div className="settings-hint">Loading teams…</div>;

  return (
    <div className="team-list">
      {teams.map((team) => {
        const availableMembers = (members || []).filter((m) => !team.members.some((tm) => tm.id === m.id));
        return (
          <div
            className={`team-card ${dragOverTeamId === team.id ? 'drag-over' : ''}`}
            key={team.id}
            onDragOver={(e) => { if (!readOnly) { e.preventDefault(); setDragOverTeamId(team.id); } }}
            onDragLeave={() => setDragOverTeamId((cur) => (cur === team.id ? null : cur))}
            onDrop={(e) => { if (!readOnly) { e.preventDefault(); handleDrop(team.id); } }}
          >
            <div className={`team-card-header ${!readOnly ? 'reorderable' : ''}`} draggable={!readOnly} onDragStart={() => setDragTeamId(team.id)}>
              {!readOnly && <span className="drag-handle" title="Drag to reorder"><Icon name="grip" size={14} /></span>}
              <input type="color" value={team.color || '#6366f1'} onChange={(e) => recolorTeam(team, e.target.value)} disabled={readOnly} title="Color" />
              <input
                className="team-name-input"
                defaultValue={team.name}
                onBlur={(e) => renameTeam(team, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                disabled={readOnly}
              />
              {!readOnly && (
                <button className="icon-btn danger-hover" onClick={() => deleteTeam(team)} title="Delete team">
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>

            <div className="team-roster">
              {team.members.length === 0 && <span className="settings-hint" style={{ margin: 0 }}>Nobody on this team yet.</span>}
              {team.members.map((m) => (
                <span className="team-member-chip" key={m.id}>
                  <span className="avatar" style={{ background: colorForPerson(m.name) }}>{initials(m.name)}</span>
                  {m.name}
                  {m.domain_name && <span className="domain-tag" style={{ color: m.domain_color, borderColor: m.domain_color }}>{m.domain_name}</span>}
                  {!readOnly && (
                    <button className="team-member-remove" onClick={() => removeMember(team, m.id)} title={`Remove ${m.name}`}>
                      <Icon name="x" size={10} />
                    </button>
                  )}
                </span>
              ))}
            </div>

            {!readOnly && (
              pickerFor === team.id ? (
                <div className="team-add-member">
                  <select value={pickerUserId} onChange={(e) => setPickerUserId(e.target.value)}>
                    <option value="">Add a member…</option>
                    {availableMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}{m.domain_name ? ` — ${m.domain_name}` : ''}</option>
                    ))}
                  </select>
                  <button onClick={() => addMember(team)} disabled={!pickerUserId}>Add</button>
                  <button className="ghost" onClick={() => { setPickerFor(null); setPickerUserId(''); }}>Cancel</button>
                </div>
              ) : (
                availableMembers.length > 0 && (
                  <button className="quick-add-trigger" onClick={() => setPickerFor(team.id)}><Icon name="plus" size={13} /> Add member</button>
                )
              )
            )}
          </div>
        );
      })}

      {teams.length === 0 && readOnly && <p className="settings-hint">No teams assembled for this project yet.</p>}

      {!readOnly && (
        <form className="settings-add-row" onSubmit={submitNewTeam}>
          <input type="color" value={newTeamColor} onChange={(e) => setNewTeamColor(e.target.value)} />
          <input
            type="text"
            placeholder="New team name (e.g. Core Team)"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
          />
          <button type="submit" disabled={addingTeam || !newTeamName.trim()}>Add team</button>
        </form>
      )}
    </div>
  );
}
