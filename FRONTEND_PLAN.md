# Frontend Plan — Agent Mesh OS

## Goal

Build Agent Mesh OS into a production-ready agent workspace with an experience closer to Codex or Claude: the user starts from a conversational command surface, watches the agent work step by step, reviews proposed actions, and inspects files, logs, artifacts, and approvals without leaving the flow.

The dashboard still matters, but it should become the secondary overview. The primary product experience is a focused agent session.

This plan follows `DESIGN.md`: Apple Developer-inspired refined minimalism, Inter for UI, JetBrains Mono for logs/code, spacious layouts, restrained Apple blue actions, semantic status colors, glass navigation/header surfaces, and first-class light/dark mode.

## Product Positioning

Agent Mesh OS is not a generic terminal dashboard. It is an operations cockpit for autonomous developer/security agents.

Primary users:
- Founder/operator running agents locally or on a small server.
- Developer reviewing proposed agent actions.
- Security-minded evaluator watching sandboxed code execution and approval gates.
- Future team admin managing agents, credentials, budgets, and schedules.

Core product promise:
- Tell the agent what outcome you want.
- Watch the plan, tool calls, logs, and results unfold in one thread.
- Review risky actions before they happen.
- Inspect changed files, sandbox output, and artifacts beside the conversation.
- Resume durable sessions after crashes without losing context.

## Current Frontend State

Existing `dashboard.html` already covers useful MVP surfaces:
- Overview metrics.
- Suggested tasks from TODO/FIXME scans.
- Scheduled tasks.
- Self-healing PR events.
- Live activity feed via `/stream`.
- Approval UI for DBOS workflow gates.

Key gaps before production:
- Visual direction has drifted from `DESIGN.md` into a darker command-center SaaS style.
- Navigation and page hierarchy are MVP-level, not task-complete operator workflows.
- There is no persistent workflow detail page.
- Approval decisions lack evidence, risk level, affected files, rollback notes, and audit history.
- Schedules cannot be paused, edited, deleted through implemented API support.
- There is no settings/admin surface for models, keys, budgets, sandbox policy, or kill switch scope.
- Error, loading, disconnected, empty, retrying, and degraded states need systematic treatment.

## Information Architecture

Use a durable app shell with a translucent top bar and compact left rail. The default route should open the latest or new agent session, not an analytics dashboard.

Primary workspace layout:
- Left rail: sessions, agents, tasks, schedules, settings.
- Center: conversation/run transcript.
- Right pane: context, files, diffs, approvals, logs, artifacts.
- Bottom composer: prompt input, context attachments, model/agent selector, run controls.

Primary sections:

1. **Session**
   - Chat-first agent thread.
   - Durable workflow timeline embedded into the transcript.
   - Tool calls, approval cards, diffs, logs, and final artifacts.
   - Resume, stop, retry, approve, reject, and continue controls.

2. **Sessions**
   - List of past and active agent sessions.
   - Filters: active, blocked, failed, completed.
   - Search across prompts, files, events, and outputs.

3. **Overview**
   - System health summary.
   - Active workflows.
   - Recent approvals.
   - Agent roster.
   - Cost/token/sandbox usage summary when backend data exists.

4. **Workflows**
   - Canonical list of all DBOS workflow runs.
   - Filters: running, blocked, failed, completed, timed out.
   - Workflow detail view with plan, execute, review timeline.
   - Replay/retry actions where supported.

5. **Approvals**
   - Queue of blocked workflows requiring human action.
   - Diff/evidence viewer.
   - Risk classification and affected resources.
   - Approve, reject, request changes, or stop workflow.

6. **Agents**
   - Agent cards for CommitGuard, Scheduler, SelfHeal, Research, and future agents.
   - Capability list, model route, sandbox policy, current status.
   - Per-agent activity, failure rate, average duration, and recent outputs.

7. **Tasks**
   - Suggested tasks discovered from code comments.
   - Confidence, rationale, file location, status, and run history.
   - Bulk scan, filter, sort, and start workflow.

8. **Schedules**
   - Recurring natural-language automation.
   - Create, pause, edit, delete, run now.
   - Last run, next run, last status, and linked workflow history.

9. **Self-Healing PRs**
   - Render webhook events and repair attempts.
   - Build logs, generated diagnosis, patch preview, pushed commit link when available.
   - Failed repair diagnostics.

10. **Activity**
   - Full live event stream.
   - Searchable, filterable by agent/workflow/event type.
   - JSON detail drawer for raw payloads.

11. **Settings**
   - Model providers and routing policy.
   - Sandbox provider status.
   - Observability/Langfuse config status.
   - Token/cost budgets.
   - Approval policy.
   - Kill switch scope and audit log.

## Core Screens

### Agent Session

Purpose: deliver the Codex/Claude-like working experience.

Layout:
- Left session rail: new session, recent sessions, blocked sessions, pinned runs.
- Center transcript:
  - User prompts.
  - Agent reasoning summaries, not raw hidden chain of thought.
  - Plan cards.
  - Tool call cards.
  - Approval request cards.
  - Result/artifact cards.
  - Error and retry cards.
- Right context pane:
  - Tabs: Context, Files, Diff, Logs, Artifacts, Details.
  - File tree and selected file preview.
  - Diff viewer for proposed changes.
  - Sandbox logs in JetBrains Mono.
  - Workflow metadata and raw events.
- Bottom composer:
  - Multiline prompt input.
  - Agent selector.
  - Context attach button.
  - Run/stop button.
  - Optional mode selector: Plan, Execute, Review.

Interaction feel:
- The user should never feel like they are filling out backend forms.
- Actions happen from the composer or inline cards.
- The app should continuously explain current state through compact status text: planning, waiting for approval, executing in sandbox, reviewing, completed.
- Tool calls should collapse by default, with readable summaries and expandable details.
- Approval cards should be impossible to miss and remain pinned until resolved.

### Session List

Purpose: make durable runs feel resumable.

Each row/card should show:
- Initial prompt or title.
- Agent.
- Status.
- Last activity.
- Files touched or resources involved.
- Blocked approval indicator.
- Result summary.

Primary actions:
- Resume session.
- Start similar session.
- Archive.
- Open workflow details.

### Overview

Purpose: answer "Is the mesh healthy, and what needs my attention?"

Layout:
- Top status strip: mesh health, DBOS connected, event stream connected, sandbox availability, tracing availability.
- Four metric panels: active workflows, blocked approvals, failed runs, scheduled automations.
- Main split: active workflow timeline on the left, attention queue on the right.
- Agent roster as a horizontal or right-side module, depending on viewport.

Production states:
- Healthy.
- Degraded, e.g. tracing disabled or event stream reconnecting.
- Critical, e.g. DB unavailable or kill switch engaged.
- Empty first-run state with one primary action: start CommitGuard demo.

### Workflow Detail

Purpose: make one agent run inspectable and auditable.

Sections:
- Header: workflow ID, agent, status, started time, duration, model route.
- Step timeline: planning, approval, execution, review, DLQ/failure.
- Plan panel: generated steps and confidence.
- Approval panel: current or past decision with actor/time.
- Execution panel: sandbox logs, tool calls, artifacts.
- Review panel: verdict, feedback, failed assertions.
- Raw events drawer for debugging.

### Approval Queue

Purpose: make risky decisions safe and fast.

Each approval item should show:
- Agent and workflow.
- Risk level: low, medium, high, critical.
- Proposed action summary.
- Diff or command preview.
- Affected files/services.
- Reason the agent requested approval.
- Consequence copy for approve/reject.

Actions:
- Approve.
- Reject.
- Request changes.
- Open workflow detail.
- Engage kill switch for this agent or all agents.

### Tasks

Purpose: turn code TODOs into agent-executable work.

Task card/list fields:
- Marker: TODO/FIXME/HACK/XXX.
- File and line.
- Comment.
- LLM rationale.
- Confidence score.
- Status.
- Last run and linked workflow.

Controls:
- Scan codebase.
- Filter by marker/status/confidence.
- Sort by confidence, file, newest.
- Run selected task.

### Schedules

Purpose: manage recurring autonomous work safely.

Table fields:
- Name.
- Prompt.
- Interval.
- Enabled state.
- Next run.
- Last run status.
- Linked last workflow.

Required production API work:
- `PATCH /api/schedule/{id}` for edits and pause/resume.
- `DELETE /api/schedule/{id}` for removal.
- `POST /api/schedule/{id}/run` for manual run now.

### Settings

Purpose: keep operational risk visible.

Settings groups:
- Providers: Gemini, Anthropic, E2B, Langfuse status.
- Routing: planner model, executor model, reviewer model.
- Safety: approvals required for file edits, shell commands, git push, external webhooks.
- Budgets: daily tokens, cost cap, per-agent cap.
- Data retention: event log retention and DLQ retention.

## Component System

Use reusable components before adding new page-specific styling.

Core components:
- `AppShell`
- `TopBar`
- `SideNav`
- `SessionRail`
- `SessionTranscript`
- `Composer`
- `MessageBubble`
- `AgentStepCard`
- `ToolCallCard`
- `StatusPill`
- `MetricPanel`
- `WorkflowTimeline`
- `AgentBadge`
- `RiskBadge`
- `ApprovalCard`
- `DiffViewer`
- `LogViewer`
- `DataTable`
- `EmptyState`
- `Toast`
- `Modal`
- `DetailDrawer`
- `CommandInput`
- `ContextPane`
- `FileTree`
- `ArtifactCard`

Visual rules:
- Panels use white/dark-panel surfaces from `DESIGN.md`.
- Border radius follows `DESIGN.md`, with 8px for compact controls and 12px/18px only for larger panels.
- Primary actions use Apple blue.
- Destructive actions use semantic red and require confirmation.
- Logs and diffs use JetBrains Mono.
- Avoid decorative gradients except the existing small brand mark if retained.

## Data Model For Frontend

The frontend should eventually consume normalized resources instead of reconstructing state from event payloads.

Needed resources:
- `AgentSession`
- `SessionMessage`
- `SessionContextItem`
- `WorkflowRun`
- `WorkflowStep`
- `Agent`
- `ApprovalRequest`
- `SuggestedTask`
- `ScheduledTask`
- `WebhookEvent`
- `ActivityEvent`
- `ProviderStatus`
- `BudgetStatus`

Recommended backend API additions:
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/{id}`
- `POST /api/sessions/{id}/messages`
- `POST /api/sessions/{id}/stop`
- `GET /api/sessions/{id}/context`
- `POST /api/sessions/{id}/context`
- `GET /api/workflows`
- `GET /api/workflows/{id}`
- `GET /api/workflows/{id}/events`
- `GET /api/approvals`
- `POST /api/approvals/{id}/approve`
- `POST /api/approvals/{id}/reject`
- `GET /api/agents`
- `GET /api/providers/status`
- `POST /api/killswitch`
- `DELETE /api/killswitch`

## Interaction States

Every production screen needs these states:
- Loading skeleton.
- Empty state.
- Success state.
- Validation error.
- Server error.
- Event stream disconnected/reconnecting.
- Partial data/degraded mode.
- Permission denied or action unavailable.
- Optimistic update pending.
- Long-running action with cancellable progress.

## Responsive Behavior

Desktop:
- Left icon rail plus full content.
- Multi-column overview.
- Tables for schedules/workflows.
- Detail drawers where context should remain visible.

Tablet:
- Collapsible navigation.
- Two-column overview becomes stacked modules.
- Tables become denser cards if horizontal space is tight.

Mobile:
- Bottom navigation or collapsed drawer.
- Approval queue and workflow details are primary.
- Tables become card lists.
- Emergency stop remains reachable but protected against accidental taps.

## Accessibility Requirements

- Keyboard navigation across nav, tables, modals, approvals, and drawers.
- Visible focus states.
- ARIA labels for icon-only controls.
- Color is never the only status signal.
- Reduced-motion support.
- Log viewers and event streams must not steal focus.
- Semantic headings and landmarks.

## Implementation Direction

Near-term pragmatic path:
- Keep FastAPI backend.
- Replace the dashboard-first shell with a session-first shell.
- If staying static: split CSS/JS into `static/app.css` and `static/app.js` first.
- If moving to app framework: use Vite + React + TypeScript, keeping API calls thin and typed.

Recommendation:
- For production readiness, move to Vite + React + TypeScript once backend tests are stabilized.
- Keep the first implementation API-compatible with the existing endpoints.
- Build the UI around durable sessions and workflows, not transient event-feed-only state.

## Phased Roadmap

### Phase 1 — Stabilize Current Dashboard

- Convert the first screen into an agent session workspace.
- Add center transcript, right context pane, and bottom composer.
- Align tokens to `DESIGN.md`.
- Remove palette drift and one-off inline styles.
- Add consistent loading, empty, error, and reconnecting states.
- Fix visible product naming: use `Agent Mesh OS` or the chosen brand consistently.
- Render current SSE events as transcript step cards.
- Harden approval UI copy and action states.

### Phase 2 — Production Operator Console

- Add durable Sessions, Workflows, and Approvals as first-class sections.
- Add searchable/filterable activity log.
- Add schedule edit/pause/delete once APIs exist.
- Add provider status panels.
- Add per-agent detail pages.
- Add responsive mobile/tablet layouts.

### Phase 3 — Safety And Auditability

- Add approval history and decision audit log.
- Add kill switch state and scoped stop controls.
- Add DLQ browser with retry/replay actions.
- Add sandbox logs and artifact viewer.
- Add cost/token budget panels.

### Phase 4 — Team/Cloud Readiness

- Add auth and roles.
- Add tenant/project selector.
- Add onboarding checklist for model keys, sandbox keys, tracing, and DB setup.
- Add webhook setup guides and copied endpoint URLs.
- Add exportable audit reports.

## Open Decisions

- Final brand name: current UI says `Inmodel`, docs say `Agent Mesh OS`, and design says `CommitGuard Live Hackathon Demo`.
- Frontend stack: static HTML/CSS/JS for demo speed or Vite/React/TypeScript for production.
- Whether the immediate product is broad Agent Mesh OS or focused CommitGuard Security Console.
- Whether settings should expose raw provider configuration or only show connection status.
- Whether approvals are workflow-scoped only or support global policy rules.

## Next Implementation Slice

The highest-leverage first slice is:
- Rename visible product surface consistently.
- Reframe `dashboard.html` around a Codex/Claude-style agent session.
- Add a transcript fed by current SSE events.
- Add a persistent composer wired to `/api/run`.
- Add a right-side context pane with tabs for Details, Diff, Logs, and Events.
- Add Sessions, Workflows, and Approvals as top-level nav items.
- Add robust disconnected/reconnecting state for `/stream`.

This keeps scope contained while moving the frontend from demo dashboard toward production operator console.
