import Icon, { Logo } from '../components/Icon.jsx';

// Illustrative sample rows for the hero preview — not real task data, and
// labeled as such in the UI (see the "a look inside" caption below).
const PREVIEW_ROWS = [
  { title: 'Fix login redirect on iOS', done: true, chips: ['HAL App', 'frontend'] },
  { title: 'Ship v2.3 build to testers', done: false, chips: ['Tomorrow', 'HAL App'], dueChip: 0 },
  { title: 'Wire training data pipeline', done: true, chips: ['IEMA AI'] },
  { title: 'Update storefront checkout copy', done: false, chips: ['Fri', 'IEM BrandStore'], dueChip: 0 },
];

const FEATURES = [
  {
    icon: 'grid',
    title: 'Board and list, both',
    body: 'Drag tasks across a Kanban board by status, or work a flat list grouped by section — same data, whichever view fits the moment.',
  },
  {
    icon: 'check',
    title: 'Sub-tasks',
    body: 'Break one task into a checklist without spinning up a whole new ticket for each step.',
  },
  {
    icon: 'bolt',
    title: 'Quick-add, in plain English',
    body: null, // rendered specially below, to include a <code> snippet
  },
  {
    icon: 'gear',
    title: 'Every workflow, editable',
    body: "Rename, recolor, and reorder every status, priority, label, and person. It's your workflow, not a template you adapt to.",
  },
  {
    icon: 'users',
    title: 'Shared workspaces',
    body: "Invite a teammate in by email and they're looking at the same board, the same tasks, the same day.",
  },
  {
    icon: 'server',
    title: 'Self-hosted, on purpose',
    body: "Runs on a droplet behind our own domain, HTTPS handled automatically. Nobody else's outage takes it down.",
  },
];

const PROJECTS = [
  { name: 'HAL App', color: '#6366f1', desc: 'Mobile build — the project that pushed us to stop trusting a database with a row limit.' },
  { name: 'IEMA AI', color: '#8b5cf6', desc: 'The AI-side workstream, tracked alongside everything else instead of in its own tool.' },
  { name: 'IEM BrandStore', color: '#0ea5e9', desc: 'The largest board here — proof this holds up past a handful of tasks.' },
  { name: 'Grant In Aid', color: '#3f8f6f', desc: 'Smaller and slower-moving, and still worth a real board instead of a stray note.' },
];

export default function Landing({ onSignIn }) {
  return (
    <div className="landing">
      <header className="landing-rail landing-header">
        <div className="landing-wrap landing-rail-row">
          <div className="landing-brand"><Logo size={26} /> Punchlist</div>
          <div className="landing-spacer" />
          <button className="landing-btn-ghost" onClick={onSignIn}>Sign in</button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-wrap landing-hero-grid">
            <div>
              <h1>The list you clear<br />before you call it done.</h1>
              <p className="landing-hero-sub">
                Punchlist is a self-hosted task tracker built for one small engineering team —
                no per-seat pricing, no storage tier, no vendor to negotiate with. Just a
                $6-a-month server, running software we actually own.
              </p>
              <div className="landing-hero-cta">
                <button className="landing-btn-amber" onClick={onSignIn}>
                  Open Punchlist
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12,5 19,12 12,19" /></svg>
                </button>
                <div className="landing-hero-meta"><span className="landing-dot" /> todo.arunavakundu.com · self-hosted · unlimited</div>
              </div>
            </div>

            <div className="landing-preview" aria-hidden="true">
              <div className="landing-preview-head">
                <span className="landing-preview-dots"><span /><span /><span /></span>
                &nbsp;a look inside — illustrative, not live data
              </div>
              <div className="landing-preview-body">
                {PREVIEW_ROWS.map((row) => (
                  <div className={`landing-prow ${row.done ? 'done' : ''}`} key={row.title}>
                    <span className="landing-pcheck">
                      {row.done && <Icon name="check" size={11} />}
                    </span>
                    <div>
                      <div className="landing-ptitle">{row.title}</div>
                      <div className="landing-pmeta">
                        {row.chips.map((c, i) => (
                          <span className={`landing-pchip ${i === row.dueChip ? 'due' : ''}`} key={c}>{c}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="landing-preview-foot">
                <span>Board · List · Sub-tasks</span>
                <span>4 people · 4 projects</span>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-why">
          <div className="landing-wrap landing-why-grid">
            <h2>Why not just use Notion?</h2>
            <div>
              <p>
                We tracked engineering work in a Notion database for a while. It worked, right up
                until it didn't — every plan has <strong>a storage cap, a row limit, or a per-seat
                price</strong> attached to it somewhere. Punchlist has none of those, because there's
                no vendor between the team and the server.
              </p>
              <p>
                The old Notion <em>Dev Tasks</em> and <em>Projects</em> databases were imported once,
                on day one, so nothing from before the move was lost.
              </p>
              <div className="landing-stat-row">
                <div className="landing-stat"><b>95</b><span>tasks migrated</span></div>
                <div className="landing-stat"><b>4</b><span>projects</span></div>
                <div className="landing-stat"><b>$6</b><span>per month, flat</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-features">
          <div className="landing-wrap">
            <h2>Everything a punch list needs</h2>
            <p className="landing-section-sub">Not a Notion clone with fewer features — the parts of a task tracker this team actually uses, and nothing pretending to be enterprise software.</p>
            <div className="landing-feature-grid">
              {FEATURES.map((f) => (
                <div className="landing-feature" key={f.title}>
                  <div className="landing-feature-icon"><Icon name={f.icon} size={19} /></div>
                  <h3>{f.title}</h3>
                  {f.title === 'Quick-add, in plain English' ? (
                    <p>Type <code>tomorrow #HAL App @frontend p1</code> and Punchlist parses the due date, project, label, and priority for you.</p>
                  ) : (
                    <p>{f.body}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-projects">
          <div className="landing-wrap">
            <h2>What's actually tracked in here</h2>
            <p className="landing-section-sub">Four real projects, one shared workspace called IEMA.</p>
            <ul className="landing-plist">
              {PROJECTS.map((p) => (
                <li key={p.name}>
                  <span className="landing-pdot" style={{ background: p.color }} />
                  <span className="landing-pname">{p.name}</span>
                  <span className="landing-pdesc">{p.desc}</span>
                </li>
              ))}
            </ul>
            <div className="landing-credit">— built and used by Arunava, Debashish &amp; Soumi</div>
          </div>
        </section>
      </main>

      <footer className="landing-rail landing-footer">
        <div className="landing-wrap landing-foot-row">
          <div className="landing-foot-colophon">
            Node.js + Express + SQLite, React + Vite frontend.<br />
            Deployed on a DigitalOcean droplet behind Caddy — automatic HTTPS, no CDN, no third party in between.
          </div>
          <button className="landing-btn-amber" onClick={onSignIn}>Open Punchlist</button>
        </div>
      </footer>
    </div>
  );
}
