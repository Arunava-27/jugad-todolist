import { useEffect, useState } from 'react';
import Icon, { Logo } from '../components/Icon.jsx';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Illustrative sample rows for the hero preview — not real task data, and
// labeled as such in the UI (see the "a look inside" caption below).
const PREVIEW_ROWS = [
  { title: 'Fix mobile nav overflow', done: true, chips: ['Website', 'frontend'] },
  { title: 'Write onboarding email copy', done: false, chips: ['Tomorrow', 'Marketing'], dueChip: 0 },
  { title: 'Set up staging environment', done: true, chips: ['Backend'] },
  { title: 'QA the checkout flow', done: false, chips: ['Fri', 'Website'], dueChip: 0 },
];

const FEATURES = [
  {
    icon: 'check',
    title: 'Sub-tasks',
    body: 'Break one task into a checklist without spinning up a whole new ticket for each step.',
  },
  {
    icon: 'gear',
    title: 'Every workflow, editable',
    body: "Rename, recolor, and reorder every status, priority, and label. It's your workflow, not a template you adapt to.",
  },
  {
    icon: 'users',
    title: 'Shared workspaces',
    body: "Invite a teammate in by email and they're looking at the same board, the same tasks, the same day.",
  },
  {
    icon: 'server',
    title: 'Self-hosted, on purpose',
    body: "Runs on a droplet behind your own domain, HTTPS handled automatically. Nobody else's outage takes it down.",
  },
];

// A small illustrative board — static, but built from the app's own board
// classes (.board-column / .board-card etc.) so it's a true reflection of
// the real view, not a separate mockup that can drift out of sync with it.
const BOARD_COLUMNS = [
  { name: 'To do', accent: '#94a3b8', cards: [
    { title: 'Redesign settings page' },
    { title: 'Write API docs' },
  ] },
  { name: 'In progress', accent: '#d9a02a', cards: [
    { title: 'Fix mobile nav overflow', priority: '#d9a02a' },
  ] },
  { name: 'Done', accent: '#3f8f6f', cards: [
    { title: 'Ship v1.2 release', priority: '#3f8f6f', done: true },
    { title: 'Set up CI pipeline', priority: '#3f8f6f', done: true },
  ] },
];

const QUICK_ADD_TEXT = 'tomorrow #Website @frontend p1';
const QUICK_ADD_CHIPS = [
  { icon: 'calendar', label: 'Tomorrow' },
  { icon: 'folder', label: 'Website' },
  { icon: null, label: '#frontend' },
  { icon: 'flag', label: 'P1' },
];

function QuickAddDemo() {
  const [typed, setTyped] = useState('');
  const [showChips, setShowChips] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setTyped(QUICK_ADD_TEXT);
      setShowChips(true);
      return;
    }
    let cancelled = false;
    (async function loop() {
      while (!cancelled) {
        setShowChips(false);
        for (let i = 0; i <= QUICK_ADD_TEXT.length; i++) {
          if (cancelled) return;
          setTyped(QUICK_ADD_TEXT.slice(0, i));
          await sleep(45);
        }
        await sleep(450);
        if (cancelled) return;
        setShowChips(true);
        await sleep(3200);
        if (cancelled) return;
        for (let i = QUICK_ADD_TEXT.length; i >= 0; i--) {
          if (cancelled) return;
          setTyped(QUICK_ADD_TEXT.slice(0, i));
          await sleep(18);
        }
        await sleep(600);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="landing-demo" aria-hidden="true">
      <div className="landing-demo-input">
        <Icon name="plus" size={14} />
        <span>{typed}</span>
        <span className="landing-caret" />
      </div>
      <div className={`landing-demo-chips ${showChips ? 'show' : ''}`}>
        {QUICK_ADD_CHIPS.map((c, i) => (
          <span className="chip" key={c.label} style={{ '--i': i }}>
            {c.icon && <Icon name={c.icon} size={11} />} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BoardIllustration() {
  return (
    <div className="landing-board-frame" aria-hidden="true">
      <div className="landing-board-row">
        {BOARD_COLUMNS.map((col) => (
          <div className="board-column" key={col.name} style={{ '--column-accent': col.accent }}>
            <div className="board-column-title">{col.name} <span className="nav-count">{col.cards.length}</span></div>
            <div className="board-column-body">
              {col.cards.map((card) => (
                <div className="board-card" key={card.title} style={{ '--priority-accent': card.priority }}>
                  <div className="board-card-title" style={card.done ? { textDecoration: 'line-through', color: 'var(--ink-soft)' } : undefined}>
                    {card.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
                Punchlist is a self-hosted task tracker — board and list views, sub-tasks,
                natural-language quick-add, and full control over your own workflow. No per-seat
                pricing, no storage tier, because it runs on a server you own.
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
              </div>
            </div>
          </div>
        </section>

        <section className="landing-why">
          <div className="landing-wrap landing-why-inner">
            <h2>Most task trackers charge you for growing</h2>
            <p>
              A per-seat price that climbs with headcount. A storage cap that fills up right when
              it's least convenient. A free tier that quietly narrows every year. Punchlist skips
              all of it — it's software you run yourself, on a server that costs a flat few dollars
              a month, with nothing metered and nothing that expires.
            </p>
            <ul className="landing-benefit-list">
              <li><Icon name="check" size={14} /> No per-seat pricing</li>
              <li><Icon name="check" size={14} /> No storage cap</li>
              <li><Icon name="check" size={14} /> You own the server</li>
            </ul>
          </div>
        </section>

        <section className="landing-showcase">
          <div className="landing-wrap landing-showcase-grid">
            <div>
              <h2>Type it the way you'd say it</h2>
              <p className="landing-section-sub">
                Skip the dropdowns. Write a task the way you'd describe it out loud, and Punchlist
                reads the due date, project, label, and priority straight out of the sentence.
              </p>
            </div>
            <QuickAddDemo />
          </div>
        </section>

        <section className="landing-showcase alt">
          <div className="landing-wrap landing-showcase-grid">
            <BoardIllustration />
            <div>
              <h2>See it as a board, or see it as a list</h2>
              <p className="landing-section-sub">
                Every project is a Kanban board and a flat list at the same time — drag a card
                across statuses, or scroll a grouped list when you just need to move fast. Same
                tasks, whichever view fits the moment.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-features">
          <div className="landing-wrap">
            <h2>And everything else a punch list needs</h2>
            <div className="landing-feature-grid">
              {FEATURES.map((f) => (
                <div className="landing-feature" key={f.title}>
                  <div className="landing-feature-icon"><Icon name={f.icon} size={19} /></div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
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
