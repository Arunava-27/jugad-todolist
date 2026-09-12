import { useState } from 'react';

const TOPICS = [
  'Getting started',
  'Tasks & quick-add',
  'List & board views',
  'Customizing your workflow',
  'People & roles',
  'Stakeholders',
  'Admin',
];

export default function Guides({ isOwnerOrAdmin }) {
  const [topic, setTopic] = useState(TOPICS[0]);

  return (
    <div className="settings-page">
      <div className="settings-body">
        <nav className="settings-tabs">
          {TOPICS.map((t) => (
            <button key={t} className={topic === t ? 'active' : ''} onClick={() => setTopic(t)}>{t}</button>
          ))}
        </nav>

        <div className="settings-panel guide-content">
          {topic === 'Getting started' && (
            <>
              <h3>How Punchlist is organized</h3>
              <p className="settings-hint">The hierarchy, top to bottom, before anything else.</p>

              <ol>
                <li><strong>Organization</strong> — your whole company. You get one by registering without an invite link; you become its owner.</li>
                <li><strong>Workspace</strong> — a team or area within the org (e.g. "Engineering", "Marketing"). Only the owner creates workspaces, from the sidebar's workspace switcher.</li>
                <li><strong>Project</strong> — a body of work inside a workspace (e.g. "Website Revamp"). Opening one lands you on its <strong>Overview</strong> — description, <a href="#" onClick={(e) => { e.preventDefault(); setTopic('Customizing your workflow'); }}>stage</a>, timeline, progress, team, and stakeholders — with List and Board one click away.</li>
                <li><strong>Task</strong> — the actual work. Belongs to a project (or sits in the Inbox with no project), can have a due date, priority, labels, assignees, sub-tasks, and attachments.</li>
              </ol>

              <h3>Your first few minutes</h3>
              <ul>
                <li>Create a workspace (owner only) from the workspace switcher at the top of the sidebar.</li>
                <li>Add a project from the "Projects" section header in the sidebar.</li>
                <li>Click <strong>+ Add task</strong> at the top of any view to create your first task — try typing something like <code>Fix login bug tomorrow p1</code> and watch it parse itself (more on that in "Tasks &amp; quick-add").</li>
                <li>Invite your team from Settings → Members, or centrally from Admin (see "People &amp; roles").</li>
              </ul>
            </>
          )}

          {topic === 'Tasks & quick-add' && (
            <>
              <h3>Creating tasks</h3>
              <p className="settings-hint">The fastest way in is the quick-add bar — it understands plain English.</p>

              <p>Type a task the way you'd say it, and Punchlist pulls the structured bits out automatically:</p>
              <div className="guide-example">
                <code>Redesign checkout flow tomorrow #Website @frontend p1</code>
                <div className="guide-example-breakdown">
                  <span><code>tomorrow</code> → due date</span>
                  <span><code>#Website</code> → project</span>
                  <span><code>@frontend</code> → label</span>
                  <span><code>p1</code> → priority (p1 highest, p5 lowest)</span>
                </div>
              </div>

              <h4>Dates it understands</h4>
              <p><code>today</code>, <code>tomorrow</code>, <code>yesterday</code>, <code>in 3 days</code>, <code>in 2 weeks</code>, a weekday name like <code>friday</code> or <code>fri</code> (means the next upcoming one), <code>next monday</code>, an ISO date like <code>2026-09-15</code>, or <code>9/15</code>.</p>

              <h4>Projects &amp; labels</h4>
              <p><code>#</code> followed by a project name matches it against your real projects (longest match wins, so multi-word names like <code>#Grant In Aid</code> work). <code>@</code> followed by a word adds that label — repeat it for more than one.</p>

              <p>Anything the quick-add bar detects shows up as a preview chip before you submit, and the date/priority/project pickers below the text box always win if you touch them — so you can type loosely and fine-tune with the pickers.</p>

              <h3>Sub-tasks</h3>
              <p>Open a task and use the checklist inside its modal to break it into steps. Sub-tasks are lightweight — a title and a checkbox, no separate status/priority of their own — and stay tucked inside their parent rather than cluttering the main list.</p>

              <h3>Assignees &amp; attachments</h3>
              <p>Assign a task to real teammates from the task modal — click their name to toggle them on or off (their domain, if they have one, shows right on the chip). Drop image attachments onto a task from the same modal; they show as thumbnails.</p>

              <h3>Comments &amp; activity</h3>
              <p>Every task has an <strong>Activity</strong> tab alongside Details. It's one timeline, oldest first: your comments, plus a system-logged history of real changes — status, priority, due date, who got assigned or unassigned, completed/reopened. You can delete your own comments; the change history can't be edited, by anyone.</p>

              <h3>Finding what's assigned to you</h3>
              <p>The sidebar's <strong>Assigned to me</strong> smart view shows only your own open tasks across every project. On <strong>All tasks</strong> or inside a project, the "Everyone" dropdown at the top of the page narrows the list to one person at a time.</p>
            </>
          )}

          {topic === 'List & board views' && (
            <>
              <h3>Three ways to look at a project</h3>
              <p>Open any project and switch between <strong>Overview</strong>, <strong>List</strong>, and <strong>Board</strong> at the top of the page — Overview is where you land; List and Board show the same underlying tasks in different shapes.</p>

              <h4>Overview</h4>
              <p>The project's home screen — description, stage, timeline, a progress bar, who's on the team, and who has stakeholder access, all editable right there. See "Getting started".</p>

              <h4>List view</h4>
              <p>Tasks grouped into <strong>sections</strong> you define (e.g. "Backlog", "In Review") — independent of status. Drag a task between sections, or drag the section handles to reorder them, from Settings or directly in the list.</p>

              <h4>Board view</h4>
              <p>A Kanban board with one column per <strong>status</strong> (Not started / In progress / Done, or whatever you've customized them to — see "Customizing your workflow"). Drag a card to a different column to change its status; drag a column to reorder it.</p>

              <h4>Smart views</h4>
              <p>The sidebar's <strong>Today</strong>, <strong>Upcoming</strong>, <strong>Assigned to me</strong>, <strong>Inbox</strong>, and <strong>All tasks</strong> cut across every project — Today shows anything due on or before today, Inbox shows tasks with no project.</p>

              <h4>Dashboard</h4>
              <p>Manager, admin, and owner only. A workspace-wide rollup — project counts by stage, what's overdue and in which project, and a capacity view of who's carrying how much — for whoever's actually running the place rather than working one project at a time. Click an overdue project to open it directly.</p>

              <h4>Capacity</h4>
              <p>Each open task's estimated hours are summed per person and compared against a weekly capacity (40 hours by default; override it per person in Admin → Users). It's a rough gauge, not a schedule — it ignores due dates entirely, and a task with no estimate still counts toward that person's task total but adds nothing to the hours figure. A bar past 80% turns amber; past 100%, red.</p>
            </>
          )}

          {topic === 'Customizing your workflow' && (
            <>
              <h3>Statuses &amp; priorities</h3>
              <p>Settings → Workflow. Rename, recolor, reorder, add, or remove either list — they're not fixed. One status is marked <strong>Done</strong> (completing a task moves it there) and one is the <strong>Default</strong> for new tasks.</p>

              <h3>Labels</h3>
              <p>Settings → Labels. Free-form tags for filtering and grouping — recolor and reorder the same way.</p>

              <h3>Projects</h3>
              <p>Settings → Projects. Rename, recolor, reorder, archive (hides it from the sidebar without deleting anything), or delete (its tasks move to the Inbox, they're never deleted with the project).</p>

              <h4>Project stage</h4>
              <p>Each project also carries a lifecycle stage — <strong>Planning → Active → On Hold → Testing → Launched</strong> — set from the same Projects list, or from the project's own Overview. It's shown as a badge at the top of the project view. This is separate from both task statuses (which drive the board columns) and the Archived flag (which just controls sidebar visibility).</p>
              <p>Description, start/target dates, team, and stakeholders aren't in Settings at all — those live on the project's own <strong>Overview</strong> tab (see "List &amp; board views").</p>
            </>
          )}

          {topic === 'People & roles' && (
            <>
              <h3>The five roles</h3>
              <p className="settings-hint">Every person has a role within each workspace they belong to (and a separate rank within the organization overall — see "Admin").</p>
              <ul>
                <li><strong>Owner</strong> — full control everywhere in the organization; creates workspaces.</li>
                <li><strong>Admin</strong> — manages a workspace's members, invites, and settings.</li>
                <li><strong>Manager</strong> — runs the day-to-day: projects, sections, task assignment. Can't touch membership or workspace settings.</li>
                <li><strong>Developer</strong> — the default contributor role: create, edit, and complete tasks.</li>
                <li><strong>Viewer</strong> — read-only. Sees everything, changes nothing.</li>
              </ul>

              <h3>Inviting people</h3>
              <p>Settings → Members (per workspace) or centrally from Admin → Users → "Manage access" (across every workspace at once, owner/admin only). Add someone already registered by email and they're in immediately; add a new email and they get an invite link by email.</p>

              <h3>Domains</h3>
              <p>A domain is a label for someone's discipline — Frontend, Backend, QA, Cloud/DevOps, whatever fits your team. It's purely descriptive (doesn't grant or restrict anything) and is set from Admin → Users, from a list the owner manages in Admin → Domains.</p>
            </>
          )}

          {topic === 'Stakeholders' && (
            <>
              <h3>Read-only access to one project</h3>
              <p>A stakeholder isn't a workspace member — they're scoped to a single project, and see only its stage, dates, progress, and team, never individual tasks, descriptions, or attachments. Use this for a client, an executive, or anyone who needs "where do things stand" without the working detail.</p>

              <h4>Adding one</h4>
              <p>Open the project → Overview and scroll to Stakeholders. An existing account is added right away; a new email gets an invite that creates an account scoped to just that project — they never see the rest of the workspace.</p>

              <h4>What a stakeholder sees</h4>
              <p>Signing in takes them straight to a simple read-only dashboard: project name, current stage, timeline, a completion bar, a breakdown by status, and who's on the team — nothing more.</p>
            </>
          )}

          {topic === 'Admin' && (
            <>
              {isOwnerOrAdmin ? (
                <>
                  <h3>The Admin screen</h3>
                  <p className="settings-hint">Owner and admin only — reached from the shield icon in the sidebar.</p>
                  <ul>
                    <li><strong>Users</strong> — every account in the organization: change role, set domain, deactivate/reactivate, and (owner only) permanently delete.</li>
                    <li><strong>Manage access</strong> — expand a user's row to add, remove, or re-role them across every workspace in the org from one place.</li>
                    <li><strong>Workspaces</strong> — every workspace in the org, with a shortcut to open any of them.</li>
                    <li><strong>Domains</strong> — the org-wide list of disciplines (see "People &amp; roles").</li>
                    <li><strong>Organization</strong> — rename the organization itself.</li>
                  </ul>
                  <h4>Deleting an account</h4>
                  <p>Permanent and owner-only — an admin can deactivate someone but not delete them. Deleting requires typing the account's exact email to confirm, and the organization always needs at least one owner left standing.</p>
                </>
              ) : (
                <p className="settings-hint">The Admin screen is only visible to your organization's owner and admins — ask one of them if you need something changed there.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
