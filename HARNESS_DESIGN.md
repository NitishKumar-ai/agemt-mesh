# Agent Harness & Loop Design

Survey of the harness architectures of the strongest open-source agents, distilled
into a design for Agent Mesh. Companion to `ARCHITECTURE.md` (infra) and
`harness.py` / `loop.py` (implementation).

## What we learned from the field

### OpenHands (V1 SDK) — event-sourced loop
- Everything is a typed event: `MessageEvent`, `ActionEvent`, `ObservationEvent`,
  `AgentErrorEvent`. The event log is append-only and the single source of truth;
  replaying it reconstructs the conversation.
- The `Agent` is a **stateless** reasoning-action step executor; a `Conversation`
  owns state and calls `agent.step()` in a loop.
- Each `step()`: (1) run pending confirmed actions, (2) condense context if needed,
  (3) query LLM, (4) parse response into action(s) or a message, (5) gate on
  confirmation if risky, (6) execute tools → observations.
- A `Condenser` compresses history when the context window approaches limits;
  a `SecurityAnalyzer` scores action risk *before* execution.

### SWE-agent / mini-swe-agent — radical minimalism
- The entire control loop is ~100 lines: **Query → Execute → Observe**, repeat.
- Three swappable protocols: `Agent` (loop + history), `Model` (LLM + cost
  tracking), `Environment` (executes actions, returns output + exit code).
- All state lives in one linear message list. No graph, no nested state machines.
- Termination via a small exception hierarchy (`LimitsExceeded`, exit messages);
  cost limits are checked **every step**, not per phase.
- The ACI insight: agents need *compact, reliable* tools with concise output —
  tool ergonomics matter more than tool count.

### smolagents — ReAct with periodic re-planning
- One `MultiStepAgent` base: each step = reasoning + tool call(s), looping until a
  `final_answer` tool is called or `max_steps` is hit.
- Memory is a list of typed steps (task, planning, action) serialized to messages
  via `write_memory_to_messages()` — memory and prompt are decoupled.
- `planning_interval`: every N steps the agent pauses to re-plan, which fights
  drift on long tasks without paying planning cost every step.

### Claude Agent SDK / Claude Code — gather → act → verify
- The loop is framed as three phases repeated until done: **gather context**,
  **take action**, **verify work**. Verification (rules, tests, second-model
  review) is a first-class loop phase, not an afterthought.
- The harness owns the loop, tool dispatch, and context management; agent authors
  supply tools and prompts only.

### Anthropic, "Effective harnesses for long-running agents"
- Compaction alone is insufficient for long tasks: persist progress in the
  *environment* (progress file, git commits, feature list with completion state)
  so a fresh context can resume.
- Verify like a user (end-to-end), checkpoint often, never let the model declare
  victory without the feature list agreeing.

## Synthesis — what Agent Mesh adopts

| Pattern | Source | Where it lands here |
|---|---|---|
| Typed action/observation events, append-only | OpenHands | `loop.py` step records → `events.py` bus + `safety_record_trace` |
| Stateless step executor, state owned by caller | OpenHands | `AgentLoop.step()` pure-ish; history owned by `LoopState` |
| Linear message history, ~100-line loop | mini-swe-agent | `AgentLoop.run()` |
| Model/Environment/Agent separation | mini-swe-agent | `generate_tracked` (model) / `Tool.run` (environment) / `AgentLoop` |
| Per-step cost & limit checks | mini-swe-agent | killswitch + budget checked **every step**, not per phase |
| `final_answer` tool + `max_steps` | smolagents | built-in `finish` tool; `LoopConfig.max_steps` |
| Periodic re-planning | smolagents | outer plan→execute→review retry loop already does this; `planning_interval` reserved for Phase 2 |
| Risk gate before execution | OpenHands `SecurityAnalyzer` | CriticGate evaluates each **action** before its tool runs |
| Gather → act → verify | Claude Agent SDK | outer 3-pass loop (plan / execute / review) retained |
| Durable checkpoints | Anthropic post | DBOS journal already replays workflows; each loop step is a DBOS step |

## Resulting architecture

Two nested loops:

```
run_agent (DBOS workflow — durable, replayable)
└─ retry loop (attempt ≤ max_retries)            ← gather→act→verify
   ├─ plan()          frames w/ thought + justification
   ├─ approval gate   DBOS.recv, 24h suspend
   ├─ CriticGate      plan-level frame screening (Track B)
   ├─ EXECUTE = AgentLoop.run()                  ← the new inner loop
   │    step:
   │      1. killswitch + budget check           (every step)
   │      2. LLM ← system + goal + linear history
   │      3. parse → ToolCall | finish | message
   │      4. CriticGate(action)                  (pre-execution risk gate)
   │      5. tool.run(args) → Observation        (truncated to obs_char_limit)
   │      6. append Action+Observation to history, emit events
   │    until: finish | max_steps | BudgetExceeded | KillswitchEngaged
   └─ review()        verdict; fail → feed issues into next attempt's context
```

### Components (`loop.py`)
- **`Tool`** — name, description, JSON-schema-ish params, `run(args) -> str`,
  `risk_level`. Replaces the old `get_tools() -> list[str]` name stubs.
- **`ToolRegistry`** — per-agent tool set; always injects `finish(result)`.
- **`Action` / `Observation` / `LoopStep`** — typed records, all serializable;
  every step is emitted on the event bus and persisted via the safety store.
- **`LoopState`** — linear history of steps (mini-swe-agent style), owned by the
  caller, so the loop itself stays stateless and DBOS-replayable.
- **`AgentLoop`** — the ~100-line driver. Pluggable `llm` callable and
  `critic` callable so tests run without network and CriticGate stays optional.

### Context management
Phase 1: per-observation truncation (`obs_char_limit`) plus drop-oldest-step
truncation when the rendered prompt exceeds `history_char_budget` — the
mini-swe-agent approach. An LLM condenser (OpenHands-style) is Phase 2.

### Backward compatibility
`BaseAgent.get_tools()` returning strings keeps working: the harness falls back
to the legacy single-shot execute. Agents that override `get_tool_objects()`
(returning `Tool` instances) get the real loop. Migration is per-agent.

## Sources
- [OpenHands SDK agent architecture](https://docs.openhands.dev/sdk/arch/agent);
  [OpenHands paper](https://arxiv.org/pdf/2407.16741);
  [OpenHands Software Agent SDK paper](https://arxiv.org/pdf/2511.03690)
- [mini-swe-agent architecture overview](https://deepwiki.com/SWE-agent/mini-swe-agent/1.1-architecture-overview);
  [SWE-agent ACI paper](https://arxiv.org/pdf/2405.15793)
- [smolagents conceptual guide (ReAct)](https://huggingface.co/docs/smolagents/en/conceptual_guides/react);
  [smolagents agents.py](https://github.com/huggingface/smolagents/blob/main/src/smolagents/agents.py)
- [Claude Agent SDK — how the agent loop works](https://platform.claude.com/docs/en/agent-sdk/agent-loop)
- [Anthropic — effective harnesses for long-running agents](https://anthropic.com/engineering/effective-harnesses-for-long-running-agents)
