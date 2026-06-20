---
hide:
  - navigation
  - toc
description: AgentMesh is a permission-aware, temporal company brain built on a durable workflow engine. Ingest company sources, build a self-maintaining knowledge graph, and serve cited answers and first-party workflows with source-level permission enforcement.
---

<div class="home-wrapper">

<div class="hero">
  <div class="hero-badge">Apache 2.0 Licensed &middot; Company brain on durable execution</div>
  <h1 class="hero-title">A living memory<br/><span class="hero-highlight">for your company.</span></h1>
  <p class="hero-subtitle">Ingest sources, build a temporal knowledge graph, and answer complex questions with permission-safe, cited evidence.</p>
  <p class="hero-differentiators">No source left behind. No permission bypass. No black-box answers.</p>
  <div class="hero-actions">
    <a href="quickstart/index.html" class="btn-primary">Get Started<span class="btn-arrow">&rarr;</span></a>
    <a href="https://github.com/agentmesh-oss/agentmesh" class="repo-link" id="hero-repo-link">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <span>agentmesh-oss/agentmesh</span>
      <span class="repo-stats" id="repo-stats"></span>
    </a>
    <script>
      fetch("https://api.github.com/repos/agentmesh-oss/agentmesh")
        .then(function(r){return r.json()})
        .then(function(d){
          var el=document.getElementById("repo-stats");
          if(el&&d.stargazers_count){
            var s=d.stargazers_count>=1000?(d.stargazers_count/1000).toFixed(1)+"k":d.stargazers_count;
            var f=d.forks_count>=1000?(d.forks_count/1000).toFixed(1)+"k":d.forks_count;
            el.innerHTML='<span class="repo-stat">&#9733; '+s+'</span><span class="repo-stat"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg> '+f+'</span>';
          }
        }).catch(function(){});
    </script>
  </div>
  <div class="hero-install"><code>$ pnpm install && pnpm build</code></div>
  <div class="hero-ai-card">
    <div class="hero-ai-header">
      <div class="hero-ai-icon">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4c0 2 1.5 3 1.5 5h5c0-2 1.5-3 1.5-5a4 4 0 0 0-4-4z"/><line x1="10" y1="17" x2="14" y2="17"/><line x1="10" y1="20" x2="14" y2="20"/><line x1="11" y1="23" x2="13" y2="23"/></svg>
      </div>
      <h3>Built for trusted AI answers</h3>
    </div>
    <div class="hero-ai-body">
      <div class="hero-ai-item">
        <a href="devguide/ai/index.html" class="hero-ai-link" title="AI Cookbook — retrieval, citations, and trust workflows">AI Cookbook &rarr;</a>
        <span class="hero-ai-sub">Retrieval, citations, abstention, and confidence calibration.</span>
      </div>
      <div class="hero-ai-item">
        <a href="architecture/trust-workflows.html" class="hero-ai-link" title="Trust workflows — cited, permission-safe answers">Trust Workflows &rarr;</a>
        <span class="hero-ai-sub">Onboarding briefs, digests, incident briefs, meeting prep, account summaries.</span>
      </div>
    </div>
  </div>
</div>

<div class="value-strip">
  <div class="value-item"><div class="value-metric">Tenant-scoped</div><div class="value-label">Graph & vector reads</div></div>
  <div class="value-divider"></div>
  <div class="value-item"><div class="value-metric">Bitemporal</div><div class="value-label">Fact tracking</div></div>
  <div class="value-divider"></div>
  <div class="value-item"><div class="value-metric">Automatic</div><div class="value-label">Entity resolution</div></div>
  <div class="value-divider"></div>
  <div class="value-item"><div class="value-metric">Cited</div><div class="value-label">Every answer</div></div>
</div>

<div class="features-section">
  <div class="section-header-inline">
    <h2>Built for answers you can trust.</h2>
  </div>
  <div class="features-grid">
    <div class="feature-card feature-accent">
      <div class="feature-tag">Graph</div>
      <h3>First-class temporal knowledge graph</h3>
      <p>People, teams, projects, documents, meetings, incidents, customers, and facts are stored as a property graph in Neo4j. Every node and relationship carries provenance, valid time, and recorded time so the system knows what is true now, what used to be true, and which source changed it.</p>
      <a href="architecture/knowledge-graph.html" class="feature-link">Graph layer &rarr;</a>
    </div>
    <div class="feature-card">
      <div class="feature-tag">Permissions</div>
      <h3>Source visibility by default</h3>
      <p>Graph reads, vector search, and workflow answers are filtered by source ACLs. Unknown source state fails closed. Administrative mutations require a verified tenant admin. Identity is accepted only from verified middleware-populated <code>request.user</code>.</p>
      <a href="architecture/permissions.html" class="feature-link">Permission model &rarr;</a>
    </div>
    <div class="feature-card">
      <div class="feature-tag">Retrieval</div>
      <h3>Hybrid vector + graph retrieval</h3>
      <p>pgvector with HNSW indexes stores embeddings alongside permission metadata. Retrieval combines vector similarity, graph expansion, reranking, and confidence signals to return evidence the requesting user is allowed to see.</p>
      <a href="architecture/retrieval.html" class="feature-link">Retrieval stack &rarr;</a>
    </div>
    <div class="feature-card">
      <div class="feature-tag">Trust</div>
      <h3>Cited workflows with abstention</h3>
      <p>First-party workflows such as onboarding briefs, weekly digests, incident briefs, meeting prep, and account summaries cite every material claim. When evidence is missing or contradictory, the workflow abstains rather than hallucinating.</p>
      <a href="architecture/trust-workflows.html" class="feature-link">Trust workflows &rarr;</a>
    </div>
    <div class="feature-card">
      <div class="feature-tag">Connectors</div>
      <h3>Live source ingestion</h3>
      <p>Connector packages ingest Slack, Gmail, Google Drive, Notion, GitHub, and other sources. Raw payloads, parsed content, extracted entities, and source ACL metadata are persisted before facts become retrievable.</p>
      <a href="devguide/architecture/index.html" class="feature-link">Connectors &rarr;</a>
    </div>
    <div class="feature-card">
      <div class="feature-tag">Engine</div>
      <h3>Durable execution substrate</h3>
      <p>The retained workflow engine provides long-running execution, retries, sagas, human-in-the-loop approval, and polyglot workers. Workflows survive restarts, worker crashes, and network failures.</p>
      <a href="architecture/durable-execution.html" class="feature-link">Durable execution &rarr;</a>
    </div>
  </div>
</div>

<div class="arch-section">
  <div class="section-header-inline">
    <h2>Understand the system.</h2>
  </div>
  <div class="arch-grid">
    <a href="architecture/knowledge-graph.html" class="arch-card">
      <div class="arch-number">01</div>
      <h3>Knowledge Graph</h3>
      <p>Temporal facts, entities, relationships, corrections, and entity resolution.</p>
    </a>
    <a href="architecture/retrieval.html" class="arch-card">
      <div class="arch-number">02</div>
      <h3>Retrieval</h3>
      <p>Vector search, graph expansion, reranking, and permission filtering.</p>
    </a>
    <a href="devguide/ai/index.html" class="arch-card">
      <div class="arch-number">03</div>
      <h3>Trust Workflows</h3>
      <p>Cited answers, confidence scoring, contradiction handling, and abstention.</p>
    </a>
    <a href="architecture/system-architecture.html" class="arch-card">
      <div class="arch-number">04</div>
      <h3>System Architecture</h3>
      <p>Services, queues, persistence, connectors, and the admin dashboard.</p>
    </a>
  </div>
</div>

<div class="faq-section">
  <div class="section-header-inline">
    <h2>Frequently asked questions.</h2>
  </div>
  <div class="faq-grid">
    <details class="faq-item">
      <summary>What is AgentMesh?</summary>
      <p>AgentMesh is an open-source, permission-aware company brain. It connects to company sources, extracts entities and facts, stores them in a temporal graph, and answers questions through cited, permission-safe workflows.</p>
    </details>
    <details class="faq-item">
      <summary>Is AgentMesh open source?</summary>
      <p>Yes. AgentMesh is Apache 2.0 licensed and self-hostable, built on a battle-tested durable workflow substrate maintained under the AgentMesh OSS organization.</p>
    </details>
    <details class="faq-item">
      <summary>How does permission enforcement work?</summary>
      <p>Source ACL metadata is persisted with every fact. Graph reads, vector search, and workflow answers filter results by the caller's visible permission hashes. Unknown source state fails closed, and graph mutations require a verified tenant administrator.</p>
    </details>
    <details class="faq-item">
      <summary>What does "temporal" mean here?</summary>
      <p>Every fact tracks valid time (when it was true in the real world) and recorded time (when the system learned it). This lets AgentMesh answer questions about current belief, historical belief, and what changed when.</p>
    </details>
    <details class="faq-item">
      <summary>Which sources can AgentMesh ingest?</summary>
      <p>The nested <code>company-knowledge-os</code> workspace contains connectors for Slack, Gmail, Google Drive, Notion, GitHub, and more. Connector implementation and ACL synchronization are active areas of work; see <code>passes.md</code> Pass 3.</p>
    </details>
    <details class="faq-item">
      <summary>What are trust workflows?</summary>
      <p>First-party workflows such as onboarding briefs, weekly digests, incident briefs, meeting prep, and account summaries. Each answer is grounded in source evidence and cites its sources; the workflow abstains when evidence is insufficient or contradictory.</p>
    </details>
    <details class="faq-item">
      <summary>Can AgentMesh run durable workflows?</summary>
      <p>Yes. The retained orchestration engine supports long-running workflows, retries, sagas, human approval, dynamic tasks, and polyglot workers. State is persisted at every step so workflows survive restarts and crashes.</p>
    </details>
    <details class="faq-item">
      <summary>How do I run AgentMesh locally?</summary>
      <p>Run <code>pnpm install && pnpm build</code> in the root, then <code>cd server-lite && pnpm start</code>. The server starts on <code>http://localhost:8080</code>. See the <a href="quickstart/index.html">quickstart guide</a> for Docker, PostgreSQL, and Neo4j options.</p>
    </details>
    <details class="faq-item">
      <summary>What is the current production readiness?</summary>
      <p>The graph, vector search, entity resolution, and permission enforcement layers are implemented and tested. The active blockers are production identity, durable authorization, nested Knowledge OS repair, real connectors, queue recovery, and admin operations. See <a href="https://github.com/agentmesh-oss/agentmesh/blob/main/passes.md">passes.md</a> for the full roadmap.</p>
    </details>
    <details class="faq-item">
      <summary>How do I contribute?</summary>
      <p>Start with <a href="resources/contributing.html">Contributing guide</a> and <code>AGENTS.md</code>. Run the focused test set before opening a PR and keep changes scoped to one logical concern.</p>
    </details>
  </div>
</div>

<div class="cta-section">
  <div class="cta-content">
    <h2>Open source company brain. Community driven.</h2>
    <p>Apache-2.0 licensed. Self-hosted, no vendor lock-in. Build a knowledge layer your agents and employees can trust.</p>
    <div class="cta-actions">
      <a href="https://github.com/agentmesh-oss/agentmesh" class="btn-primary">Star on GitHub<span class="btn-arrow">&rarr;</span></a>
      <a href="resources/contributing.html" class="btn-ghost">Contributing guide</a>
    </div>
  </div>
</div>

</div>
