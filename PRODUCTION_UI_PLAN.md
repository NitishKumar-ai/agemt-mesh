# AgentMesh Production UI Plan

Last prepared: June 21, 2026

## 1. Outcome

Build a production-ready AgentMesh experience with the confidence, clarity, and visual memorability of [Hyper](https://heyhyper.ai/), without copying its brand or reducing AgentMesh to a marketing clone.

The finished product has two coordinated surfaces:

1. A public website that explains the company-brain product through a strong narrative, product demonstrations, trust signals, and conversion paths.
2. An authenticated workspace where employees ask questions, inspect evidence, run first-party workflows, connect sources, and where operators monitor ingestion, permissions, retrieval quality, and corrections.

The product workspace is the priority. The public website should only claim capabilities that the authenticated product can demonstrate.

## 2. Reference Direction

Hyper's useful design lessons are:

- A recognizable warm-black, off-white, and high-energy orange visual identity.
- Oversized, direct copy with strong contrast and generous negative space.
- Product behavior explained through animated visual systems rather than generic feature cards.
- Motion that communicates ingestion, transformation, and delivery of context.
- Editorial page composition with alternating dense and quiet sections.
- One dominant call to action per section.
- A brand voice that makes a technical infrastructure product feel fast and tangible.

AgentMesh should adapt those lessons into its own direction:

**"Evidence in motion"** — an editorial, high-trust interface where source material visibly becomes facts, relationships, cited answers, and workflows.

AgentMesh should not copy Hyper's logo, layouts, illustrations, copy, or exact orange. The differentiator is not "another company brain"; it is permission-aware temporal knowledge with evidence, corrections, confidence, and durable workflows.

## 3. Current UI Assessment

### Overall score: 4/10

The current UI proves many capabilities but is not yet a coherent product.

| Dimension | Current | Production target | Main gap |
| --- | ---: | ---: | --- |
| Product hierarchy | 4/10 | 9/10 | Fourteen top-level destinations mix employee, operator, developer, safety, and experimental tools. |
| Visual system | 4/10 | 9/10 | Multiple visual directions and repeated overrides exist across 3,717 lines of `app.css`, 631 lines of `codex.css`, page-local styles, and extensive inline styling. |
| Core company-brain UX | 4/10 | 10/10 | Asking requires an exact entity ID and does not provide a unified search, evidence inspection, or correction flow. |
| Trust and evidence | 5/10 | 10/10 | Citations and confidence exist, but their presentation is secondary and the user cannot inspect the retrieval process or temporal conflicts well. |
| Connector UX | 4/10 | 9/10 | Connector definitions are partly client-side, health and ACL state are missing, and unsupported providers can appear actionable. |
| Operations UX | 3/10 | 9/10 | The new dashboard is not routed, uses raw endpoints and inline styles, and lacks real incident, ingestion, and retrieval drill-downs. |
| Navigation and routing | 3/10 | 9/10 | The main shell uses component state instead of URL-backed navigation while orchestration pages use a second shell and route model. |
| Accessibility | 3/10 | 9/10 | Few tested semantics, native confirm/alert usage, incomplete labels, uncertain keyboard flows, and no automated accessibility suite. |
| Responsive behavior | 5/10 | 9/10 | Basic breakpoints exist, but dense tables, inspectors, graphs, modals, and workflows need intentional small-screen behavior. |
| Testability | 2/10 | 9/10 | Only one UI test file exists and there are no component, route, accessibility, or browser-level product-flow tests. |

### Specific code risks

- `App.tsx` maintains its own page state instead of using route state, preventing durable deep links and reliable browser navigation.
- `main.tsx` combines the legacy shell and separate orchestration routes, creating inconsistent information architecture.
- `AdminDashboard.tsx` and `GraphViewer.tsx` are untracked and not connected to the primary navigation.
- `GraphViewer.tsx` uses an O(n²) custom force loop, random initial placement, raw fetch calls, and many inline styles.
- `ConnectionsPage.tsx` contains a client-owned connector registry and routes several providers through assumptions that can diverge from backend capability.
- `AskPage.tsx` exposes an implementation constraint by requiring exact entity IDs.
- Native `window.confirm` and `alert` are used for a security-sensitive killswitch action.
- Styling is fragmented across global CSS, override CSS, inline styles, and component-local `<style>` tags.
- Loading, empty, error, stale, unauthorized, partial-data, and destructive-action states are not consistently modeled.

## 4. Product Information Architecture

Replace the current flat navigation with role-aware navigation.

### Employee workspace

1. **Home**
   - Personalized brief.
   - Recent company changes.
   - Suggested questions.
   - Workflow shortcuts.
   - Connector coverage notice when evidence is incomplete.

2. **Ask**
   - Natural-language prompt as the primary action.
   - Optional scope chips for team, project, account, incident, date range, and sources.
   - Answer stream with inline citations.
   - Evidence inspector.
   - Confidence and abstention explanation.
   - Contradiction and "what changed" views.
   - Feedback and correction actions.

3. **Briefs**
   - Onboarding brief.
   - Weekly digest.
   - Meeting prep.
   - Incident brief.
   - Account summary.
   - Saved, scheduled, shared, and historical runs.

4. **Knowledge**
   - Searchable entities, facts, decisions, and sources.
   - Entity profile with current state and temporal history.
   - Fact provenance and supersession chain.
   - Relationship explorer.
   - Correction and duplicate-report entry points.

5. **Activity**
   - User-relevant changes and completed workflow events.
   - Filters by team, project, account, source, and importance.

### Administrator workspace

1. **Overview**
   - Ingestion freshness.
   - Connector health.
   - permission/ACL failures.
   - retrieval quality.
   - answer trust and abstention.
   - queue and workflow health.

2. **Sources**
   - Connector catalog.
   - OAuth and configuration flows.
   - Sync status, cursor age, throughput, rate limits, and errors.
   - Content and ACL coverage.

3. **People & access**
   - Users, groups, service identities, tenants, roles, and effective grants.
   - Directory synchronization and revocation status.
   - Permission diagnostics without exposing restricted content.

4. **Knowledge quality**
   - Corrections.
   - entity merge review.
   - contradictions.
   - stale facts.
   - low-confidence extraction.

5. **Evaluation**
   - Recall@k, MRR, citation fidelity, abstention precision, calibration error, latency, and cost.
   - Evaluation dataset and regression runs.

6. **Automation**
   - Workflow definitions, executions, approvals, schedules, queues, and workers.
   - The existing Conductor-oriented pages live here under the same application shell.

7. **Audit & safety**
   - Security events.
   - privileged actions.
   - killswitch history.
   - approval decisions.
   - connector and policy changes.

### Remove or relocate

- Remove `Marketing` from the core company-brain navigation unless it is explicitly retained as a product workflow.
- Move `CommitGuard`, generic agents, and developer tools into an "Extensions" or internal-labs area.
- Consolidate `Sessions`, `Tasks`, and `Workflows` into the Briefs and Automation models.
- Do not show pages that are unsupported by backend capability.

## 5. Primary User Journeys

### Journey A: First-time workspace setup

1. User signs in through production OIDC.
2. Tenant and role are resolved before the application shell loads.
3. Admin sees a guided setup checklist.
4. Admin connects a source.
5. UI shows requested scopes, expected data, and ACL behavior before OAuth.
6. Sync progress moves through explicit states: authorizing, discovering, syncing ACLs, ingesting, indexing, ready.
7. Admin receives a verified first-answer test with visible citations.

Success criteria:

- No secret or raw token is entered into an ordinary text field for OAuth connectors.
- A source is not labeled ready before ACL metadata and searchable content are available.
- Every failure includes cause, impact, retryability, and a remediation action.

### Journey B: Ask a trusted question

1. User asks a natural-language question without knowing an entity ID.
2. UI shows interpreted scope and lets the user correct it.
3. During retrieval, the interface shows meaningful stages: finding entities, checking current facts, resolving conflicts, verifying permissions, composing.
4. Answer presents the conclusion first.
5. Material claims carry numbered citations.
6. Selecting a citation opens an evidence drawer with exact text, source metadata, date, permission status, and graph relationships.
7. Low-confidence answers explain why; insufficient evidence produces a useful abstention.
8. User can mark an answer incorrect, stale, incomplete, or permission-sensitive and start a correction.

Success criteria:

- The user can verify any material claim within two interactions.
- Restricted source titles or snippets never leak through counts, errors, autocomplete, or graph labels.
- Refreshing or sharing the URL preserves the question and answer context subject to authorization.

### Journey C: Run a first-party brief

1. User selects a workflow template.
2. A short scope form uses searchable entities instead of raw identifiers.
3. A pre-run summary shows sources, time range, recipients, and expected output.
4. The live run view shows durable progress, retries, approvals, and evidence collection.
5. The completed brief is readable, cited, exportable, and schedulable.

### Journey D: Diagnose stale knowledge

1. Operator starts on the overview dashboard.
2. A freshness alert identifies an affected connector and tenant.
3. Drill-down shows cursor age, last successful stage, queue state, permission-sync state, and recent errors.
4. Operator can retry only the failed stage or open the relevant run.
5. Audit history records the action.

### Journey E: Correct a fact

1. User selects a claim or entity.
2. UI shows current fact, history, sources, confidence, and downstream impact.
3. User proposes invalidate, replace, merge, or split.
4. Privileged corrections require explicit confirmation or approval.
5. UI tracks graph update, vector reindex, and affected-answer refresh.

## 6. Visual Design System

### Aesthetic

Use a high-contrast editorial system with technical precision:

- Calm, warm surfaces for reading and evidence.
- Near-black operational surfaces for high-density admin and workflow states.
- A single hot vermilion accent used for momentum, selection, and primary actions.
- Thin rules, restrained radii, crisp typography, and asymmetric compositions.
- Graph and ingestion visuals should look like information systems, not decorative particle effects.

### Color proposal

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `#F6F2EA` | `#141311` | Main background |
| Surface | `#FFFCF7` | `#1D1B19` | Cards, drawers, elevated regions |
| Surface strong | `#EAE3D8` | `#292622` | Active rows and secondary controls |
| Ink | `#181715` | `#FAF7F1` | Primary text |
| Muted | `#6D675F` | `#AAA39A` | Secondary text |
| Brand | `#F04419` | `#FF5A2A` | Primary action and focus |
| Success | `#18794E` | `#55C892` | Healthy and complete |
| Warning | `#A15C00` | `#E7AD55` | Degraded and incomplete |
| Danger | `#B42318` | `#F27972` | Failure and destructive action |
| Info | `#175CD3` | `#76A9FA` | Neutral system information |

All state colors must pass WCAG 2.2 AA contrast in their actual component combinations. Color must never be the only state indicator.

### Typography

- Display: **Instrument Sans**, 600-700.
- Product UI: **Geist**, 400-600.
- Data and code: **IBM Plex Mono**, 400-500.
- Use tabular numerals for metrics and timestamps.
- Self-host production fonts with preload and fallback metrics to avoid layout shift.

Type scale:

- Display: 64/64 desktop, 44/46 mobile.
- H1: 40/44.
- H2: 28/34.
- H3: 20/26.
- Body large: 17/27.
- Body: 15/23.
- UI: 13/18.
- Caption: 12/16.

### Layout

- 4 px base spacing grid.
- Product shell: 240-272 px collapsible navigation, flexible content, optional 360-440 px evidence inspector.
- Content width: 1,280 px for dashboards; 760 px for answer reading.
- Use 12-column grids for marketing and dashboards.
- Radius hierarchy: 6 px controls, 10 px panels, 16 px feature surfaces; pills only for compact statuses.
- Avoid uniform card grids. Use lists, split panes, timelines, tables, and anchored inspectors according to the data relationship.

### Motion

Motion communicates state:

- 80-120 ms for pressed and focus feedback.
- 160-220 ms for menus, tooltips, and row state changes.
- 240-360 ms for drawers and page transitions.
- Progress animations are driven by real backend stages.
- Respect `prefers-reduced-motion`.
- No infinite decorative animation inside the authenticated workspace.
- The public site may use richer motion, but it must pause off-screen and remain usable without JavaScript animation.

### Iconography and data visualization

- Continue with Lucide for general controls, wrapped by a single `Icon` primitive.
- Create a small custom set for AgentMesh concepts: fact, source, supersession, correction, permission boundary, workflow, and entity merge.
- Use consistent chart colors and legends.
- Graph visualization defaults to an explainable subgraph or timeline, not an unbounded force graph.

## 7. Public Website Plan

### Page structure

1. **Navigation**
   - Product, Workflows, Security, Pricing, Docs.
   - Sign in.
   - Primary CTA: Request access or Start setup, depending on sales model.

2. **Hero**
   - Outcome-led headline.
   - One-sentence differentiation around permission-aware, cited company memory.
   - Product animation showing sources becoming verified context.
   - Primary CTA plus a low-friction product-tour action.

3. **Problem**
   - Show fragmented, stale, permission-sensitive company knowledge.
   - Avoid generic "information is everywhere" copy; use concrete operational consequences.

4. **How AgentMesh works**
   - Connect.
   - Resolve.
   - Verify.
   - Deliver.
   - Each step maps to a real product capability.

5. **Interactive product story**
   - Demonstrate one question across Slack, Drive, GitHub, and meetings.
   - Show temporal correction and permission filtering.
   - Show the final cited answer and downstream workflow.

6. **First-party workflows**
   - Use a horizontal story or stacked demonstrations, not a generic feature grid.

7. **Trust**
   - Identity, tenant isolation, source ACLs, citations, corrections, abstention, audit trail.
   - Security claims must be reviewed against implemented behavior.

8. **Operator proof**
   - Connector health, sync freshness, retrieval evaluation, and audit screenshots.

9. **Deployment and integration**
   - Web app, API, and MCP/agent integration.

10. **Final CTA and footer**

### Marketing implementation

- Keep the marketing route separate from the authenticated application bundle.
- Add server-rendered or statically generated HTML for SEO and reliable social previews.
- Use optimized AVIF/WebP images and H.264/WebM video fallbacks.
- Add Product, SoftwareApplication, Organization, FAQ, and Breadcrumb structured data where accurate.
- Set a Lighthouse production budget of at least 95 for performance, accessibility, best practices, and SEO on key marketing pages.

## 8. Authenticated Product Shell

### Routing

- Replace component-state navigation with React Router route objects.
- Every page, selected entity, query, workflow run, filter, and inspector state receives a stable URL where appropriate.
- Add route-level authorization metadata and error boundaries.
- Consolidate the legacy shell and Conductor shell.
- Lazy-load admin, graph, and workflow-heavy routes.

Recommended route model:

```text
/home
/ask
/ask/:conversationId
/briefs
/briefs/:template
/briefs/runs/:runId
/knowledge
/knowledge/entities/:entityId
/knowledge/facts/:factId
/activity
/admin
/admin/sources
/admin/sources/:connectionId
/admin/access
/admin/quality
/admin/evaluation
/admin/automation/*
/admin/audit
/settings
```

### Shared application primitives

Create production primitives before screen rewrites:

- `AppShell`
- `Page`
- `Stack`, `Inline`, `Grid`, `SplitPane`
- `Button`, `IconButton`
- `Input`, `Textarea`, `Select`, `Combobox`, `DateRange`
- `Dialog`, `AlertDialog`, `Drawer`, `Popover`, `Tooltip`
- `Tabs`, `Menu`, `CommandPalette`
- `DataTable`, `Metric`, `ChartFrame`
- `Status`, `Badge`, `Callout`
- `Skeleton`, `EmptyState`, `ErrorState`
- `Toast` and persistent operation feedback
- `EvidenceCard`, `Citation`, `Confidence`
- `EntityChip`, `SourceIcon`, `PermissionState`

Use Radix UI primitives or React Aria for accessible interaction behavior. Keep AgentMesh styling owned locally through CSS variables and component variants.

### State and data

- Standardize API access through one typed client.
- Generate or validate types from backend contracts.
- Use TanStack Query for server state, retries, cancellation, invalidation, and optimistic updates only where safe.
- Normalize error responses into authorization, validation, conflict, unavailable, and unknown categories.
- Add route loaders only where they improve first-render behavior; avoid maintaining two unrelated fetching models.
- Replace page-owned polling loops with job/run endpoints, SSE, or WebSocket updates.

## 9. Screen Specifications

### Home

- Personalized greeting and scope.
- "Ask AgentMesh" composer.
- Changes since last visit.
- Five workflow shortcuts.
- Coverage panel listing connected sources, freshness, and blind spots.
- Recent briefs and saved entities.

### Ask and answer

- Centered prompt entry before a conversation begins.
- Conversation uses a reading-width main column.
- Right evidence pane on desktop; bottom sheet on mobile.
- Inline citation numbers, source chips, confidence explanation, and temporal context.
- "Current answer" and "How this changed" modes.
- Follow-up suggestions grounded in available entities.
- Copy, share, save as brief, report issue, and correct fact actions.

### Knowledge explorer

- Search across entities, facts, sources, and decisions.
- Facets for type, source, team, date, confidence, and status.
- Entity page uses summary, current facts, timeline, relationships, sources, and corrections tabs.
- Graph is a scoped explainability view with deterministic layout and accessible list fallback.

### Briefs

- Template gallery contains the five first-party workflows only at launch.
- Each template includes purpose, required inputs, typical sources, and output preview.
- Run detail includes durable stage progress and citations.
- Scheduling uses timezone-aware rules and a preview of the next five runs.

### Sources

- Catalog displays backend-supported connectors only.
- Connection detail shows auth status, granted scopes, source coverage, ACL coverage, last sync, cursor age, throughput, failures, and rate limits.
- Setup wizard has scope review, authorization, initial sync, verification, and completion steps.

### Operator overview

- Service-level health summary.
- Tenant/source freshness heatmap.
- Ingestion pipeline funnel.
- Retrieval trust scorecard.
- Permission and ACL failure queue.
- Queue depth, workflow latency, retry, and dead-letter summaries.
- All metrics link to filtered drill-downs.

### Corrections and entity review

- Side-by-side evidence comparison.
- Impact preview before mutation.
- Role-aware approval path.
- Audit trail.
- Completion state confirms graph and vector synchronization.

## 10. Production Quality Requirements

### Accessibility

- Meet WCAG 2.2 AA.
- Full keyboard operation for navigation, dialogs, comboboxes, tables, graph fallback, and inspectors.
- Visible focus states.
- Correct heading hierarchy and landmarks.
- Programmatic labels and descriptions.
- Live-region announcements for durable workflow progress and errors.
- Reduced-motion and high-contrast support.
- Automated axe checks plus manual screen-reader testing for primary journeys.

### Security and authorization

- Render the application only after verified identity and tenant context are available.
- Do not use client-side visibility as an authorization control.
- Hide restricted entities and source metadata entirely, not only their content.
- Add CSRF strategy where cookie authentication is used.
- Use secure headers and a restrictive CSP.
- Prevent external-source HTML from rendering unsanitized.
- Require an accessible `AlertDialog` with typed or explicit confirmation for killswitch, disconnect, correction, deletion, and privilege changes.
- Audit privileged UI actions with actor, tenant, target, reason, and result.

### Performance

Authenticated workspace budgets:

- Initial JS under 250 KB gzip for the common shell.
- Route chunks under 150 KB gzip except graph/evaluation routes.
- LCP under 2.5 seconds at the 75th percentile.
- INP under 200 ms.
- CLS under 0.1.
- Virtualize lists above 200 rows.
- Move heavy graph layout to a worker or server-computed deterministic layout.
- Avoid O(n²) client graph behavior for production datasets.

### Reliability

- Route and component error boundaries.
- Clear offline, reconnecting, stale, and partially available states.
- Idempotency keys for user-triggered workflow starts and corrections.
- No optimistic UI for privileged or destructive operations.
- Durable run status can be restored after refresh.
- Feature flags for incomplete pages and connectors.

### Internationalization and time

- Externalize user-facing strings.
- Format dates, numbers, timezones, and durations through shared utilities.
- Store schedules in canonical timezone-aware formats.
- Design layouts for 30-40% text expansion.

## 11. Testing Strategy

### Unit and component

- Vitest and React Testing Library.
- Test shared primitives, permission rendering, error mapping, confidence display, citation behavior, forms, and destructive confirmations.

### Contract

- Validate frontend requests and responses against backend schemas.
- Add fixtures for authenticated, unauthorized, forbidden, stale, partial, and fail-closed ACL cases.

### Browser end-to-end

Use Playwright for:

- OIDC sign-in callback and session expiry.
- first connector setup.
- source sync failure and retry.
- ask with citations.
- abstention.
- permission-filtered answer.
- correction proposal and approval.
- brief run, refresh recovery, and schedule.
- operator drill-down.
- killswitch confirmation.

### Visual regression

- Storybook or an equivalent isolated component harness.
- Screenshot key primitives and routes at desktop, tablet, and mobile widths.
- Include light, dark, loading, error, empty, long-content, restricted, and high-density states.

### Accessibility and performance

- axe in component and browser tests.
- Lighthouse CI on marketing and authenticated smoke routes.
- Bundle-size budgets in CI.

## 12. Delivery Plan

### Phase 0: Product truth and design foundation

Estimated effort: 1-2 weeks

- Confirm launch personas, sales motion, and retained feature scope.
- Inventory every route and backend capability.
- Mark pages as production, internal, experimental, or remove.
- Create `DESIGN.md`.
- Create Figma foundations and critical journey prototypes.
- Define content voice and product terminology.
- Establish UI acceptance criteria and analytics events.

Exit criteria:

- Approved information architecture.
- Approved visual direction.
- Capability/claim matrix.
- No unresolved top-level navigation decisions.

### Phase 1: UI platform

Estimated effort: 2-3 weeks

- Consolidate routing and shells.
- Implement design tokens and shared primitives.
- Establish typed API and error model.
- Add authentication/tenant bootstrap.
- Add permission-aware route guards.
- Add Storybook, component tests, axe, Playwright, visual regression, and bundle budgets.
- Remove page-local `<style>` blocks and begin inline-style migration.

Exit criteria:

- New shell works on desktop and mobile.
- Core primitives pass accessibility tests.
- Deep links and refresh work.
- Existing production routes can migrate incrementally.

### Phase 2: Trusted answer experience

Estimated effort: 2-3 weeks

- Rebuild Home and Ask.
- Add entity autocomplete and interpreted scope.
- Build answer, citation, evidence, confidence, abstention, conflict, and feedback components.
- Add durable conversation URLs.
- Build correction entry flow.

Backend dependencies:

- Semantic query endpoint without required raw entity ID.
- Stable source URLs and exact evidence spans.
- Structured confidence explanation.
- correction APIs and role policies.

Exit criteria:

- End-to-end cited answer journey passes.
- No restricted metadata leakage in test fixtures.
- User can verify and challenge an answer.

### Phase 3: Sources and onboarding

Estimated effort: 2-3 weeks

- Build first-run setup.
- Rebuild connector catalog and connection detail.
- Add OAuth state handling.
- Add sync-stage progress, health, scopes, ACL coverage, and remediation.
- Remove static client connector definitions.

Backend dependencies:

- Authoritative connector registry.
- OAuth lifecycle and state.
- persisted connector jobs, cursors, health, scopes, and ACL status.

Exit criteria:

- At least one connector completes setup-to-verified-answer.
- Unsupported connectors cannot appear connectable.
- Restart and failed-sync states are recoverable.

### Phase 4: Briefs and automation

Estimated effort: 3-4 weeks

- Build the five workflow templates.
- Unify workflow runs, approvals, schedules, and history.
- Migrate orchestration pages into the admin shell.
- Add real-time durable progress and recovery.

Backend dependencies:

- Stable first-party workflow contracts.
- durable schedules and recovery.
- approval and run event streams.

Exit criteria:

- All five workflows have complete happy, error, approval, and retry paths.
- Runs survive refresh and server restart.

### Phase 5: Knowledge and corrections

Estimated effort: 3-4 weeks

- Build global knowledge search.
- Entity, fact, source, decision, timeline, and relationship views.
- Replace the current graph visualizer.
- Build correction and entity-resolution review queues.

Backend dependencies:

- Search/facet endpoints.
- temporal history and provenance contracts.
- merge/split/invalidate/replace APIs with impact preview.

Exit criteria:

- Operators and permitted users can trace current state to evidence.
- Corrections visibly synchronize graph and vector state.

### Phase 6: Operations dashboard

Estimated effort: 2-3 weeks

- Build overview and drill-down dashboards.
- Add connector, ingestion, retrieval, permission, queue, and workflow metrics.
- Add evaluation regression views and audit search.
- Wire alert links to actionable filtered states.

Exit criteria:

- An operator can diagnose common stale/missing-answer causes without database access.
- Dashboard data is live, tenant-scoped, and linked to source runs.

### Phase 7: Public website

Estimated effort: 2-3 weeks

- Build the public site after the product demonstrations are stable.
- Capture real product media.
- Add SEO, structured data, analytics, privacy controls, and conversion tracking.
- Validate every claim against the capability matrix.

Exit criteria:

- Public site meets Lighthouse budgets.
- Product demonstrations use real or clearly labeled sample data.
- Security and capability claims are reviewed.

### Phase 8: Hardening and release

Estimated effort: 2 weeks

- Cross-browser and responsive QA.
- Accessibility audit.
- Performance profiling.
- Security review.
- Error telemetry and session replay with privacy controls.
- Production analytics dashboards.
- Beta feedback and usability fixes.
- Release runbook and rollback.

Exit criteria:

- No unresolved critical accessibility, security, authorization, or data-leak findings.
- Primary journeys meet performance budgets.
- Product, support, and operations teams have release documentation.

## 13. Recommended Team and Sequence

Minimum focused team:

- 1 product designer.
- 2 frontend engineers.
- 1 backend engineer dedicated to UI contracts and auth.
- 1 product/technical lead.
- Shared QA/accessibility and security support.

Expected duration:

- Focused beta: approximately 12-16 weeks if backend dependencies are staffed in parallel.
- Production release: approximately 16-22 weeks including operations, accessibility, security, and beta hardening.

Do not estimate the work as a CSS redesign. Most effort is in information architecture, route and state foundations, production backend contracts, permission-safe behavior, testing, and operational states.

## 14. Prioritized Backlog

### P0

- Production OIDC and tenant bootstrap.
- Unified URL routing and one application shell.
- Authoritative role-aware information architecture.
- Design tokens and accessible shared primitives.
- Typed API/error layer.
- Rebuilt Ask with semantic scope and evidence inspector.
- Remove unsupported connector actions.
- Loading/error/empty/unauthorized state system.
- Playwright and accessibility coverage for primary journeys.

### P1

- Connector onboarding and health.
- Five first-party briefs.
- Knowledge entity and temporal fact views.
- Corrections and entity-review flows.
- Operations overview and drill-down.
- Durable schedules, approvals, and workflow recovery UI.

### P2

- Public marketing website.
- Advanced graph exploration.
- Command palette and power-user shortcuts.
- Saved views, exports, and collaborative sharing.
- Personalization and notification preferences.

## 15. Release Gates

The UI is production-ready only when:

- Identity and tenant context are verified server-side.
- All visible capabilities are backed by real APIs.
- Unknown ACL state fails closed in every UI path.
- Core journeys are keyboard and screen-reader usable.
- Primary browser tests pass against a production-like stack.
- Marketing and product performance budgets pass.
- Privileged actions use explicit confirmation and audit logging.
- Citations resolve to permission-safe source locations.
- Refreshing a long-running workflow restores accurate state.
- Operator pages can diagnose connector, ingestion, retrieval, permission, and queue failures.
- No critical or high security/accessibility issues remain.
- `pnpm.cmd --filter agent-mesh-frontend build`, UI tests, browser tests, accessibility checks, bundle budgets, and `git diff --check` pass.

## 16. First Implementation Milestone

The first implementation milestone should be a vertical slice, not a broad reskin:

1. New route-based shell.
2. New design tokens and primitives.
3. Authenticated tenant bootstrap.
4. Home.
5. Ask.
6. Evidence inspector.
7. One real connector setup.
8. One cited answer generated from that connector.
9. One correction flow.
10. Automated browser and accessibility tests.

This slice proves the product's visual direction, trust model, backend contracts, and engineering foundation before the rest of the screens are migrated.
