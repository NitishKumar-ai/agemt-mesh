"""
loop.py — Inner agentic loop: typed tools + iterative action→observation steps.

Design distilled from OpenHands (typed events, stateless step executor),
mini-swe-agent (linear history, per-step limit checks, ~100-line driver),
smolagents (finish tool + max_steps), and the Claude Agent SDK
(gather→act→verify). See HARNESS_DESIGN.md for the survey and rationale.

This module has no DBOS or store dependencies: the harness injects the LLM
callable, the critic gate, and the pre-step checks (killswitch/budget), so the
loop is replayable inside a DBOS step and testable without network or DB.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class LoopError(Exception):
    pass


class ActionBlocked(LoopError):
    """Raised internally when the critic blocks an action; recorded, not fatal."""


# ── Tools ────────────────────────────────────────────────────────────────────

@dataclass
class Tool:
    """A callable capability exposed to the agent.

    `run` takes the parsed args dict and returns the observation text.
    `risk_level` feeds the critic gate ("low" | "medium" | "high").
    """
    name: str
    description: str
    parameters: Dict[str, str] = field(default_factory=dict)  # arg name → description
    run: Callable[[Dict[str, Any]], str] = lambda args: ""
    risk_level: str = "low"

    def render(self) -> str:
        params = ", ".join(f"{k}: {v}" for k, v in self.parameters.items()) or "none"
        return f"- {self.name}({params}): {self.description}"


FINISH_TOOL = "finish"


def _finish_run(args: Dict[str, Any]) -> str:
    return str(args.get("result", ""))


class ToolRegistry:
    """Per-agent tool set. `finish` is always present so the loop can terminate."""

    def __init__(self, tools: Optional[List[Tool]] = None):
        self._tools: Dict[str, Tool] = {}
        for t in tools or []:
            self.register(t)
        if FINISH_TOOL not in self._tools:
            self.register(Tool(
                name=FINISH_TOOL,
                description="Call when the goal is complete. Ends the loop.",
                parameters={"result": "final answer / summary of what was accomplished"},
                run=_finish_run,
            ))

    def register(self, tool: Tool):
        self._tools[tool.name] = tool

    def get(self, name: str) -> Optional[Tool]:
        return self._tools.get(name)

    def names(self) -> List[str]:
        return list(self._tools)

    def render_for_prompt(self) -> str:
        return "\n".join(t.render() for t in self._tools.values())


# ── Typed step records ───────────────────────────────────────────────────────

@dataclass
class Action:
    tool: str
    args: Dict[str, Any] = field(default_factory=dict)
    thought: str = ""
    raw: str = ""

    def to_dict(self) -> dict:
        return {"tool": self.tool, "args": self.args, "thought": self.thought}


@dataclass
class Observation:
    content: str
    success: bool = True
    tool: str = ""

    def to_dict(self) -> dict:
        return {"content": self.content, "success": self.success, "tool": self.tool}


@dataclass
class LoopStep:
    index: int
    action: Action
    observation: Observation

    def to_dict(self) -> dict:
        return {
            "step": self.index,
            "action": self.action.to_dict(),
            "observation": self.observation.to_dict(),
        }


@dataclass
class LoopState:
    """Linear history of steps — the only mutable state of a run."""
    steps: List[LoopStep] = field(default_factory=list)
    finished: bool = False
    final_result: str = ""
    stop_reason: str = ""

    def outcomes(self) -> List[dict]:
        """Render in the shape BaseAgent.review() already consumes."""
        return [
            {
                "step": f"{s.action.tool}({json.dumps(s.action.args, default=str)[:120]})",
                "result": s.observation.content[:300],
                "status": "success" if s.observation.success else "failed",
            }
            for s in self.steps
        ]


# ── Config ───────────────────────────────────────────────────────────────────

@dataclass
class LoopConfig:
    max_steps: int = 15
    obs_char_limit: int = 2000          # truncate each observation fed back
    history_char_budget: int = 24000    # drop oldest steps beyond this
    max_parse_failures: int = 3         # consecutive unparseable LLM replies
    condense_threshold: int = 16000     # condense history via LLM when beyond this
    planning_interval: int = 5          # re-evaluate plan every N steps


# ── Action parsing ───────────────────────────────────────────────────────────

_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


def parse_action(raw: str) -> Optional[Action]:
    """Parse an LLM reply into an Action.

    Expected shape: {"thought": "...", "tool": "...", "args": {...}}.
    Tolerates code fences and surrounding prose; returns None if no tool call
    can be recovered.
    """
    clean = re.sub(r"```[a-z]*\n?", "", raw).strip().strip("`")
    match = _JSON_BLOCK.search(clean)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    tool = data.get("tool") or data.get("action")
    if not tool or not isinstance(tool, str):
        return None
    args = data.get("args") or data.get("arguments") or {}
    if not isinstance(args, dict):
        args = {"input": args}
    return Action(tool=tool, args=args, thought=str(data.get("thought", "")), raw=raw)


# ── The loop ─────────────────────────────────────────────────────────────────

_SYSTEM_TEMPLATE = """You are an autonomous agent working step by step toward a goal.

Goal: {goal}
Context: {context}

Available tools:
{tools}

At each step, reply with ONLY a JSON object:
{{"thought": "your reasoning", "tool": "tool_name", "args": {{...}}}}

Rules:
- One tool call per step. The result will be shown to you as an observation.
- When the goal is complete, call {finish}(result=...) with a summary.
- If an action is blocked or fails, adapt — do not repeat it verbatim."""


class AgentLoop:
    """Query → gate → execute → observe, repeated until finish or a limit.

    The driver is stateless between `run` calls; all run state lives in the
    returned LoopState. Injected callables:
      llm(prompt) -> str                          model call (cost tracked by caller)
      critic(action_dict) -> (allowed, reason)    pre-execution risk gate, optional
      pre_step_check() -> None                    raises to halt (killswitch/budget)
      on_event(type, payload) -> None             event-bus emission, optional
    """

    def __init__(
        self,
        tools: ToolRegistry,
        llm: Callable[[str], str],
        config: Optional[LoopConfig] = None,
        critic: Optional[Callable[[dict], Tuple[bool, str]]] = None,
        pre_step_check: Optional[Callable[[], None]] = None,
        on_event: Optional[Callable[[str, dict], None]] = None,
    ):
        self.tools = tools
        self.llm = llm
        self.config = config or LoopConfig()
        self.critic = critic
        self.pre_step_check = pre_step_check
        self.on_event = on_event

    def _emit(self, event_type: str, payload: dict):
        if self.on_event:
            try:
                self.on_event(event_type, payload)
            except Exception:
                logger.exception("loop event emission failed (%s)", event_type)

    def _render_history(self, state: LoopState) -> str:
        lines: List[str] = []
        for s in state.steps:
            lines.append(
                f"Step {s.index}: {s.action.tool}({json.dumps(s.action.args, default=str)})"
            )
            obs = s.observation.content[: self.config.obs_char_limit]
            status = "ok" if s.observation.success else "FAILED"
            lines.append(f"Observation [{status}]: {obs}")
        
        history = "\n".join(lines)

        # ── LLM Condenser (OpenHands style) ──────────────────────────────────
        if len(history) > self.config.condense_threshold and len(state.steps) > 3:
            logger.info("condensing agent history (length=%d)", len(history))
            condense_prompt = (
                "You are an agent memory manager. Summarize the following execution "
                "history into a concise 'Summary of Progress'. Preserve all key "
                "data points, tool results, and failures. Use under 1000 characters.\n\n"
                f"History:\n{history}\n\nSummary:"
            )
            try:
                # We use the provided LLM for condensation
                summary = self.llm(condense_prompt)
                return f"[Summary of earlier steps]\n{summary}\n\n[Most recent steps]\n" + "\n".join(lines[-2:])
            except Exception as e:
                logger.warning("history condensation failed: %s", e)

        # Fallback: Drop oldest steps until within budget (mini-swe-agent style truncation).
        while len(history) > self.config.history_char_budget and len(lines) > 2:
            lines = lines[2:]
            history = "[earlier steps truncated]\n" + "\n".join(lines)
        return history

    def _build_prompt(self, goal: str, context: str, state: LoopState) -> str:
        system = _SYSTEM_TEMPLATE.format(
            goal=goal,
            context=context,
            tools=self.tools.render_for_prompt(),
            finish=FINISH_TOOL,
        )
        
        # ── Code-Native Instruction (smolagents pattern) ─────────────────────
        code_native_hint = ""
        if any(t.name == "python" for t in self.tools._tools.values()):
            code_native_hint = (
                "\n\nYou have a 'python' tool. You can write and execute Python code "
                "to perform complex logic, data processing, or multi-step tool calls. "
                "Use the 'python' tool for advanced tasks."
            )

        history = self._render_history(state)
        if history:
            return f"{system}{code_native_hint}\n\nProgress so far:\n{history}\n\nNext step:"
        return f"{system}{code_native_hint}\n\nFirst step:"

    def _execute(self, action: Action) -> Observation:
        tool = self.tools.get(action.tool)
        if tool is None:
            return Observation(
                content=f"Unknown tool '{action.tool}'. Available: {', '.join(self.tools.names())}",
                success=False, tool=action.tool,
            )
        if self.critic is not None:
            try:
                allowed, reason = self.critic(action.to_dict())
            except Exception as e:
                logger.exception("critic gate errored; failing closed")
                allowed, reason = False, f"critic error: {e}"
            if not allowed:
                self._emit("action_blocked", {"action": action.to_dict(), "reason": reason})
                return Observation(
                    content=f"Action blocked by safety critic: {reason}",
                    success=False, tool=action.tool,
                )
        try:
            output = tool.run(action.args)
            return Observation(content=str(output), tool=action.tool)
        except Exception as e:
            logger.warning("tool %s failed: %s", action.tool, e)
            return Observation(content=f"Tool error: {e}", success=False, tool=action.tool)

    def run(self, goal: str, context: str = "") -> LoopState:
        state = LoopState()
        parse_failures = 0

        while len(state.steps) < self.config.max_steps:
            if self.pre_step_check is not None:
                self.pre_step_check()  # raises KillswitchEngaged / BudgetExceeded

            # ── Re-planning (smolagents pattern) ─────────────────────────────
            current_context = context
            if len(state.steps) > 0 and len(state.steps) % self.config.planning_interval == 0:
                self._emit("loop_replanning", {"step": len(state.steps)})
                current_context += (
                    f"\n\n[RE-PLANNING STEP {len(state.steps)}] "
                    "You have completed several steps. Re-evaluate your overall "
                    "strategy. Are you on the right track? Adjust your plan in "
                    "your 'thought' field before picking the next tool."
                )

            raw = self.llm(self._build_prompt(goal, current_context, state))
            action = parse_action(raw)
            if action is None:
                parse_failures += 1
                if parse_failures >= self.config.max_parse_failures:
                    state.stop_reason = "unparseable_llm_output"
                    state.final_result = raw[:500]
                    break
                state.steps.append(LoopStep(
                    index=len(state.steps),
                    action=Action(tool="(none)", thought="", raw=raw),
                    observation=Observation(
                        content="Reply was not a valid tool-call JSON object. "
                                "Use {\"thought\": ..., \"tool\": ..., \"args\": {...}}.",
                        success=False,
                    ),
                ))
                continue
            parse_failures = 0

            self._emit("loop_action", {"step": len(state.steps), **action.to_dict()})

            if action.tool == FINISH_TOOL:
                state.finished = True
                state.final_result = str(action.args.get("result", ""))
                state.stop_reason = "finish"
                state.steps.append(LoopStep(
                    index=len(state.steps),
                    action=action,
                    observation=Observation(content=state.final_result, tool=FINISH_TOOL),
                ))
                self._emit("loop_finished", {
                    "steps": len(state.steps), "result": state.final_result[:300],
                })
                break

            observation = self._execute(action)
            step = LoopStep(index=len(state.steps), action=action, observation=observation)
            state.steps.append(step)
            self._emit("loop_observation", {
                "step": step.index,
                "tool": observation.tool,
                "success": observation.success,
                "content": observation.content[:300],
            })

        if not state.stop_reason:
            state.stop_reason = "max_steps"
            self._emit("loop_max_steps", {"steps": len(state.steps)})
        return state
