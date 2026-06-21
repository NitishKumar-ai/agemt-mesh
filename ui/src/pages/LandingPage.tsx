import { useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Menu,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const DOCS_URL = '/api/docs';

const sourceNames = ['Slack', 'Drive', 'Gmail', 'GitHub', 'Notion', 'Calendar'];

const workflows = [
  ['01', 'Onboard', 'Give a new hire the context people usually learn after six months.'],
  ['02', 'Prepare', 'Walk into every meeting knowing the history, decisions, and open actions.'],
  ['03', 'Understand', 'Reconstruct incidents, projects, and accounts from evidence—not memory.'],
  ['04', 'Stay current', 'See what changed this week without reading every message and document.'],
];

const connectorCards = [
  { name: 'Notion', glyph: 'N', color: '#111111', sx: '-390px', sy: '-170px', ox: '-410px', oy: '-165px', originY: '-180px', rot: '-9deg', delay: '-0.3s' },
  { name: 'Airtable', glyph: 'A', color: '#f6b73c', sx: '-325px', sy: '-92px', ox: '-270px', oy: '-170px', originY: '-180px', rot: '7deg', delay: '-1.1s' },
  { name: 'Slack', glyph: 'S', color: '#611f69', sx: '-145px', sy: '-125px', ox: '-125px', oy: '-165px', originY: '-180px', rot: '-12deg', delay: '-1.8s' },
  { name: 'GitHub', glyph: 'GH', color: '#24292f', sx: '115px', sy: '-172px', ox: '125px', oy: '-165px', originY: '-180px', rot: '9deg', delay: '-2.5s' },
  { name: 'Stripe', glyph: 'S', color: '#635bff', sx: '245px', sy: '-115px', ox: '265px', oy: '-165px', originY: '-180px', rot: '-6deg', delay: '-3.1s' },
  { name: 'HubSpot', glyph: 'H', color: '#ff7a59', sx: '360px', sy: '-165px', ox: '405px', oy: '-165px', originY: '-180px', rot: '10deg', delay: '-3.8s' },
  { name: 'Excel', glyph: 'X', color: '#217346', sx: '-420px', sy: '42px', ox: '-405px', oy: '-25px', originY: '0px', rot: '-5deg', delay: '-4.4s' },
  { name: 'Clay', glyph: 'C', color: '#f16f45', sx: '-270px', sy: '12px', ox: '-265px', oy: '-25px', originY: '0px', rot: '11deg', delay: '-5s' },
  { name: 'Figma', glyph: 'F', color: '#f24e1e', sx: '-92px', sy: '68px', ox: '-125px', oy: '-25px', originY: '0px', rot: '8deg', delay: '-5.6s' },
  { name: 'Linear', glyph: 'L', color: '#5e6ad2', sx: '150px', sy: '15px', ox: '125px', oy: '-25px', originY: '0px', rot: '-8deg', delay: '-6.2s' },
  { name: 'Gmail', glyph: 'M', color: '#ea4335', sx: '315px', sy: '32px', ox: '265px', oy: '-25px', originY: '0px', rot: '5deg', delay: '-6.8s' },
  { name: 'Drive', glyph: 'D', color: '#0f9d58', sx: '425px', sy: '65px', ox: '405px', oy: '-25px', originY: '0px', rot: '-10deg', delay: '-7.3s' },
  { name: 'Meta', glyph: 'M', color: '#0866ff', sx: '-350px', sy: '150px', ox: '-350px', oy: '135px', originY: '180px', rot: '-7deg', delay: '-7.8s' },
  { name: 'Google', glyph: 'G', color: '#4285f4', sx: '-205px', sy: '165px', ox: '-195px', oy: '135px', originY: '180px', rot: '5deg', delay: '-8.2s' },
  { name: 'Salesforce', glyph: 'SF', color: '#00a1e0', sx: '220px', sy: '165px', ox: '195px', oy: '135px', originY: '180px', rot: '7deg', delay: '-8.6s' },
  { name: 'OpenAI', glyph: 'AI', color: '#111111', sx: '385px', sy: '155px', ox: '350px', oy: '135px', originY: '180px', rot: '-4deg', delay: '-8.9s' },
];

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'AgentMesh — The company brain that remembers';
    document.body.classList.add('atlas-page');

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        }
      },
      { threshold: 0.14 },
    );
    document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    if (window.location.hash) {
      window.requestAnimationFrame(() => {
        document.querySelector(window.location.hash)?.scrollIntoView();
      });
    }

    return () => {
      observer.disconnect();
      document.body.classList.remove('atlas-page');
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="atlas-landing">
      <div className="atlas-frame atlas-frame--top" />
      <nav className="atlas-nav" aria-label="Primary navigation">
        <a className="atlas-brand" href="#top" aria-label="AgentMesh home">
          <span><Network size={16} /></span>
          AgentMesh
        </a>
        <div className="atlas-nav__links">
          <a href="#story">Story</a>
          <a href="#memory">Memory</a>
          <a href="#workflows">Workflows</a>
          <a href="#trust">Trust</a>
          <a href={DOCS_URL} target="_blank" rel="noreferrer">Docs</a>
        </div>
        <div className="atlas-nav__actions">
          <a href="/api/social-studio/oauth/scalekit/scalekit/login">Sign in</a>
          <Link className="atlas-button atlas-button--small" to="/home">
            Open AgentMesh <ArrowRight size={13} />
          </Link>
        </div>
        <button
          className="atlas-menu-button"
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        {menuOpen && (
          <div className="atlas-mobile-menu">
            <a href="#story" onClick={() => setMenuOpen(false)}>Story</a>
            <a href="#memory" onClick={() => setMenuOpen(false)}>Memory</a>
            <a href="#workflows" onClick={() => setMenuOpen(false)}>Workflows</a>
            <a href="#trust" onClick={() => setMenuOpen(false)}>Trust</a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Docs</a>
            <Link to="/home">Open AgentMesh <ArrowRight size={14} /></Link>
          </div>
        )}
      </nav>

      <main id="top">
        <section className="atlas-hero">
          <div className="atlas-release">Introducing AgentMesh</div>
          <h1>The company brain<br />that remembers.</h1>
          <p>
            Your company already has the answers. AgentMesh finds what is current, remembers how it
            changed, and shows the evidence behind it.
          </p>
          <Link className="atlas-button" to="/home">
            Explore AgentMesh <ArrowRight size={15} />
          </Link>
          <a className="atlas-scroll-cue" href="#story" aria-label="Continue to the story">
            <ChevronDown size={19} />
          </a>
        </section>

        <section className="atlas-meet" id="story">
          <div className="atlas-centered-heading" data-reveal>
            <span>Meet AgentMesh</span>
            <h2>Ask your company<br />a question.</h2>
            <p>Get one current answer instead of searching through ten disconnected tools.</p>
          </div>

          <div className="atlas-product-scene" data-reveal>
            <div className="scene-glow scene-glow--one" />
            <div className="scene-glow scene-glow--two" />
            <div className="atlas-browser">
              <header>
                <div><i /><i /><i /></div>
                <span>AgentMesh</span>
                <span><ShieldCheck size={12} /> Permission-aware</span>
              </header>
              <div className="atlas-browser__body">
                <aside>
                  <div className="browser-mark"><Network size={17} /></div>
                  <button className="is-selected" type="button"><Sparkles size={15} /> Ask</button>
                  <button type="button"><Search size={15} /> Knowledge</button>
                  <button type="button"><Clock3 size={15} /> Changes</button>
                  <div className="browser-sources">
                    <small>Connected sources</small>
                    {sourceNames.slice(0, 4).map((source) => (
                      <span key={source}><i>{source[0]}</i>{source}</span>
                    ))}
                  </div>
                </aside>
                <div className="browser-conversation">
                  <div className="browser-question">
                    <small>You</small>
                    <p>Why did the Atlas launch move to August?</p>
                  </div>
                  <div className="browser-answer">
                    <div className="browser-answer__status">
                      <ShieldCheck size={14} /> High confidence <span>94%</span>
                    </div>
                    <p>
                      The launch moved from July 15 to August 1 after the June 7 planning meeting
                      identified an unresolved enterprise permission risk.<sup>1</sup> The updated
                      roadmap replaced the earlier date the next morning.<sup>2</sup>
                    </p>
                    <div className="browser-citations">
                      <button type="button"><b>1</b><span>Planning meeting<small>June 7</small></span></button>
                      <button type="button"><b>2</b><span>Product roadmap<small>June 8</small></span></button>
                    </div>
                  </div>
                  <div className="browser-input">
                    <span>Ask a follow-up</span><ArrowRight size={15} />
                  </div>
                </div>
                <aside className="browser-evidence">
                  <small>Evidence</small>
                  <strong>Planning meeting</strong>
                  <span>June 7 · 10:32 AM</span>
                  <blockquote>
                    “Move the release to August 1 until enterprise permission review is complete.”
                  </blockquote>
                  <footer><Check size={12} /> Visible to you</footer>
                </aside>
              </div>
            </div>
            <p className="atlas-scene-caption">
              One answer, connected across every place your company works.
            </p>
          </div>
        </section>

        <section className="atlas-story atlas-story--dark" id="memory">
          <div className="atlas-story__intro" data-reveal>
            <span>The problem</span>
            <h2>Companies don&apos;t forget.<br />Their tools do.</h2>
            <p>
              A decision starts in a meeting, changes in Slack, lands in a document, and becomes
              code. A month later, every tool remembers a different version.
            </p>
          </div>
          <div className="atlas-chaos-scene" data-reveal>
            <div className="connector-grid" />
            <div className="connector-guide connector-guide--top" />
            <div className="connector-guide connector-guide--middle" />
            <div className="connector-guide connector-guide--bottom" />
            <div className="connector-guide connector-guide--vertical" />

            <div className="connector-node connector-node--top"><i /><span>Ingest</span></div>
            <div className="connector-node connector-node--middle"><i /><span>Resolve</span></div>
            <div className="connector-node connector-node--bottom"><i /><span>Deliver</span></div>

            <div className="connector-packet connector-packet--top-left" />
            <div className="connector-packet connector-packet--top-right" />
            <div className="connector-packet connector-packet--middle-left" />
            <div className="connector-packet connector-packet--middle-right" />
            <div className="connector-packet connector-packet--bottom-left" />
            <div className="connector-packet connector-packet--bottom-right" />

            <div className="connector-card-layer">
              {connectorCards.map((connector) => (
                <div
                  className="connector-card-orbit"
                  key={connector.name}
                  style={{
                    '--scatter-x': connector.sx,
                    '--scatter-y': connector.sy,
                    '--organize-x': connector.ox,
                    '--organize-y': connector.oy,
                    '--origin-y': connector.originY,
                    '--scatter-rot': connector.rot,
                    '--burst-delay': connector.delay,
                  } as CSSProperties}
                >
                  <article className="connector-card">
                    <i style={{ '--connector-color': connector.color } as CSSProperties}>
                      {connector.glyph}
                    </i>
                    <strong>{connector.name}</strong>
                    <span />
                  </article>
                </div>
              ))}
            </div>

            <div className="connector-burst-label">
              <Network size={19} />
              <span>Sources become shared memory</span>
            </div>
          </div>
        </section>

        <section className="atlas-statement">
          <div data-reveal>
            <span>Search finds words.</span>
            <h2>AgentMesh understands<br />what changed.</h2>
          </div>
          <p data-reveal>
            It connects people, projects, decisions, customers, incidents, and sources in a
            temporal knowledge graph—so it knows what is true now, what used to be true, and why.
          </p>
        </section>

        <section className="atlas-time">
          <div className="atlas-time__copy" data-reveal>
            <span>Memory with time built in</span>
            <h2>Every fact has a history.</h2>
            <p>
              Ask what the company believes now. Ask what it believed last Tuesday. See the source
              that changed the answer and the older fact it replaced.
            </p>
          </div>
          <div className="atlas-time__visual" data-reveal>
            <div className="time-track">
              <div className="time-line" />
              <article className="time-entry time-entry--old">
                <i />
                <small>June 1</small>
                <strong>July 15</strong>
                <span>Roadmap v3</span>
                <em>Superseded</em>
              </article>
              <article className="time-entry time-entry--decision">
                <i />
                <small>June 7</small>
                <strong>Decision changed</strong>
                <span>Planning meeting</span>
                <em>Evidence</em>
              </article>
              <article className="time-entry time-entry--current">
                <i />
                <small>June 8 → now</small>
                <strong>August 1</strong>
                <span>Roadmap v4</span>
                <em>Current truth</em>
              </article>
            </div>
          </div>
        </section>

        <section className="atlas-trust" id="trust">
          <div className="atlas-centered-heading" data-reveal>
            <span>Built for trust</span>
            <h2>Don&apos;t just get an answer.<br />Know why it&apos;s true.</h2>
            <p>
              Every important claim carries its evidence, permissions, confidence, and history.
              When the evidence is weak, AgentMesh says so.
            </p>
          </div>
          <div className="atlas-trust-demo" data-reveal>
            <div className="trust-answer">
              <header><ShieldCheck size={17} /><strong>Verified answer</strong><span>94%</span></header>
              <p>The August 1 date is current. It replaced the earlier July 15 plan after the June 7 permission review.</p>
              <footer><span>2 independent sources</span><span>Permission checked</span></footer>
            </div>
            <div className="trust-source trust-source--one">
              <b>1</b><span>Planning meeting<small>Exact supporting passage</small></span>
            </div>
            <div className="trust-source trust-source--two">
              <b>2</b><span>Roadmap v4<small>Current source of truth</small></span>
            </div>
            <div className="trust-contradiction">
              <CircleAlert size={14} /><span>Older July 15 date detected and excluded</span>
            </div>
          </div>
        </section>

        <section className="atlas-workflows" id="workflows">
          <div className="atlas-workflows__heading" data-reveal>
            <span>One memory, useful everywhere</span>
            <h2>Stop rebuilding context.</h2>
          </div>
          <div className="atlas-workflow-list">
            {workflows.map(([number, title, description], index) => (
              <article key={title} data-reveal style={{ '--delay': `${index * 70}ms` } as CSSProperties}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
                <ArrowRight size={18} />
              </article>
            ))}
          </div>
        </section>

        <section className="atlas-final">
          <div className="atlas-final__orb"><Network size={37} /></div>
          <h2 data-reveal>Your company should never have to rediscover what it already knows.</h2>
          <p data-reveal>Give every person and every AI agent the context of your most experienced teammate.</p>
          <Link className="atlas-button atlas-button--light" to="/home">
            Open AgentMesh <ArrowRight size={15} />
          </Link>
        </section>
      </main>

      <footer className="atlas-footer">
        <a className="atlas-brand" href="#top"><span><Network size={16} /></span>AgentMesh</a>
        <p>Permission-aware memory for companies and AI agents.</p>
        <div><a href="#story">Product</a><a href="#trust">Trust</a><a href={DOCS_URL} target="_blank" rel="noreferrer">Docs</a><Link to="/home">Workspace</Link></div>
      </footer>
      <div className="atlas-frame atlas-frame--bottom" />
    </div>
  );
}
