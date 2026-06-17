"""
agent_base.py — Shared BaseAgent and AgentConfig.
Allows main.py and harness.py to share core agent logic without circular imports.
"""
import os
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from events import bus
from loop import AgentLoop, LoopConfig, ToolRegistry

logger = logging.getLogger(__name__)

# Model name config — defaults
MODEL_PLAN    = os.getenv("MODEL_PLAN",    "gemini/gemini-2.5-flash")
MODEL_EXECUTE = os.getenv("MODEL_EXECUTE", "anthropic/claude-sonnet-4-6")

@dataclass
class AgentConfig:
    agent_id: Optional[str] = None
    tenant_id: str = "default"
    model_plan: Optional[str] = None
    model_execute: Optional[str] = None
    max_retries: int = 2
    cost_budget_usd: float = 0.50
    token_budget: int = 500_000
    sandbox: Optional[str] = None
    requires_approval: bool = False

class BaseAgent(ABC):
    """
    Abstract base for all agents in the mesh.

    Subclasses must implement:
      - get_tools() → list of tool names
      - execute(plan, run_id) → result dict

    Optionally override:
      - get_tool_objects(run_id) → list of loop.Tool instances
      - plan(context, run_id) → plan dict
      - review(result, run_id) → verdict dict
    """

    def __init__(self, goal: str, config: Optional[AgentConfig] = None, **kwargs):
        self.goal = goal
        cfg = config or AgentConfig()
        self.agent_id = cfg.agent_id or kwargs.get("agent_id", self.__class__.__name__)
        self.tenant_id = cfg.tenant_id or kwargs.get("tenant_id", "default")
        self.model_plan = cfg.model_plan or MODEL_PLAN
        self.model_execute = cfg.model_execute or MODEL_EXECUTE
        self.max_retries = cfg.max_retries
        self.cost_budget_usd = cfg.cost_budget_usd
        self.token_budget = cfg.token_budget
        self.sandbox = cfg.sandbox
        self.requires_approval = cfg.requires_approval

    # ── Event helpers ────────────────────────────────────────────────────────

    def write_event(self, event_type: str, payload: dict):
        from main import publish_event
        event_data = {
            "agent_id": self.agent_id,
            "event_type": event_type,
            "payload": payload,
        }
        publish_event(self.tenant_id, event_data)
        bus.emit(json.dumps(event_data))

    # ── Abstract checks (to be injected by harness) ──────────────────────────

    def check_killswitch(self):
        """Should raise KillswitchEngaged if the global killswitch is active."""
        from store import killswitch_get, KillswitchEngaged
        if killswitch_get():
            raise KillswitchEngaged(f"Killswitch engaged — agent {self.agent_id} halted")

    def check_budget(self, run_id: str):
        """Should raise BudgetExceeded if the agent's budget is spent."""
        from store import agent_run_total_cost, agent_run_total_tokens
        from harness import BudgetExceeded
        cost = agent_run_total_cost(run_id)
        if cost >= self.cost_budget_usd:
            raise BudgetExceeded(
                f"Agent {self.agent_id} exceeded cost budget: "
                f"${cost:.4f} >= ${self.cost_budget_usd:.2f}"
            )
        tokens = agent_run_total_tokens(run_id)
        if tokens >= self.token_budget:
            raise BudgetExceeded(
                f"Agent {self.agent_id} exceeded token budget: "
                f"{tokens} >= {self.token_budget}"
            )

    # ── 3-pass methods ───────────────────────────────────────────────────────

    @abstractmethod
    def get_tools(self) -> list:
        pass

    def get_tool_objects(self, run_id: str) -> Optional[list]:
        """Return a list of loop.Tool instances to enable the iterative
        action→observation loop in execute(). The base returns a single
        `delegate_task` tool so every agent supports recursive delegation;
        subclasses call super() and extend. A subclass that returns None/[]
        falls back to legacy single-shot execution. See HARNESS_DESIGN.md."""
        # ── Recursive Delegation (all agents) ────────────────────────────────
        from harness import run_agent
        from loop import Tool

        def delegate_tool(args):
            agent_id = args.get("agent_id")
            sub_goal = args.get("goal")
            if not agent_id or not sub_goal:
                return "Error: agent_id and goal are required"
            
            logger.info("Agent %s delegating sub-task to %s", self.agent_id, agent_id)
            result = run_agent(agent_id, sub_goal, f"Delegation from {self.agent_id}: {sub_goal}", self.tenant_id)
            return json.dumps(result)

        return [
            Tool(
                name="delegate_task",
                description="Delegate a sub-task to another specialized agent (or another instance of yourself) to solve a complex goal recursively.",
                parameters={"agent_id": "ID of the agent to delegate to", "goal": "Specific sub-goal"},
                run=delegate_tool,
                risk_level="medium",
            )
        ]

    def plan(self, context: str, run_id: str) -> dict:
        """Phase 1: Planning — produce a 3-step concrete execution plan."""
        from harness import generate_tracked
        from skill_store import list_skills, get_skill_content
        self.write_event("planning", {"context": context, "status": "Planning"})

        # ── Skill Retrieval (Hermes pattern) ─────────────────────────────────
        skills_context = ""
        skills = list_skills()
        if skills:
            skills_context = "\n\nRelevant past skills (successful workflows):\n"
            for s in skills[:3]: # Limit to 3 for now
                skills_context += f"--- {s} ---\n{get_skill_content(s)}\n"

        prompt = (
            f"You are an autonomous security agent. Goal: {self.goal}\n"
            f"Context: {context}\n"
            f"{skills_context}\n\n"
            "Produce a concrete 3-step execution plan as JSON:\n"
            '{"steps": ["step 1 description", "step 2 description", "step 3 description"]}\n'
            "Reply with ONLY valid JSON."
        )
        raw = generate_tracked(
            self.model_plan, prompt, run_id, self.agent_id, "plan",
        )
        import re as _re
        try:
            clean = _re.sub(r"```[a-z]*\n?", "", raw).strip().strip("`")
            plan_dict = json.loads(clean)
            if "steps" not in plan_dict:
                raise ValueError("missing steps key")
        except (json.JSONDecodeError, ValueError):
            plan_dict = {"steps": [s.strip() for s in raw.split("\n") if s.strip()][:3] or [raw[:200]]}
        self.write_event("plan_created", {
            "plan_steps": len(plan_dict["steps"]),
            "status": "Idle",
            "steps": plan_dict["steps"]
        })
        return plan_dict

    def execute(self, plan: dict, run_id: str) -> dict:
        """
        Phase 2: Execution — execute the plan via iterative tools or single-shot.
        """
        from harness import generate_tracked
        self.write_event("executing", {
            "status": "Executing",
            "steps": plan.get("steps", []),
        })

        # Agents that expose real Tool objects get the iterative
        # action→observation loop; others fall back to legacy single-shot.
        if self.get_tool_objects(run_id):
            result = self.run_tool_loop(plan, run_id)
            self.write_event("execution_completed", {
                "result": result.get("final", "done"),
                "status": "Idle",
                "stop_reason": result.get("stop_reason"),
            })
            return result

        # Legacy: single-shot simulation via LLM
        steps_text = "\n".join(f"- {s}" for s in plan.get("steps", []))
        prompt = (
            f"You are executing this plan as an autonomous agent.\n"
            f"Goal: {self.goal}\n\n"
            f"Steps:\n{steps_text}\n\n"
            "For each step, describe what was done and the outcome. "
            'Reply as JSON: {"outcomes": [{"step": "...", "result": "...", "status": "success|failed"}]}'
        )
        raw = generate_tracked(
            self.model_execute, prompt, run_id, self.agent_id, "execute",
        )
        import re as _re
        try:
            clean = _re.sub(r"```[a-z]*\n?", "", raw).strip().strip("`")
            result = json.loads(clean)
        except (json.JSONDecodeError, ValueError):
            result = {"outcomes": [{"step": s, "result": raw[:200], "status": "success"}
                                   for s in plan.get("steps", [])]}
        self.write_event("execution_completed", {
            "result": "done", "status": "Idle",
            "outcomes": result.get("outcomes", [])
        })
        return result

    def review(self, result: dict, run_id: str) -> dict:
        """Phase 3: Review — determine if the goal was met."""
        from harness import generate_tracked
        from skill_store import save_skill
        self.write_event("reviewing", {"status": "Executing"})
        outcomes_text = json.dumps(result.get("outcomes", result), indent=2)
        prompt = (
            f"Review these execution outcomes for goal: {self.goal}\n\n"
            f"Outcomes:\n{outcomes_text}\n\n"
            "Did the execution meet the goal? Reply as JSON:\n"
            '{"passed": true/false, "feedback": "one sentence assessment", '
            '"issues": ["any problems found"]}'
        )
        raw = generate_tracked(
            self.model_plan, prompt, run_id, self.agent_id, "review",
        )
        import re as _re
        try:
            clean = _re.sub(r"```[a-z]*\n?", "", raw).strip().strip("`")
            verdict = json.loads(clean)
        except (json.JSONDecodeError, ValueError):
            verdict = {"passed": True, "feedback": raw[:200], "issues": []}
        
        # ── Self-Improvement Loop (Hermes pattern) ───────────────────────────
        if verdict.get("passed") and result.get("outcomes"):
            logger.info("Extracting successful skill from run %s", run_id)
            try:
                save_skill(
                    name=f"Skill from {run_id[:8]}",
                    description=f"Automated extraction for goal: {self.goal}",
                    steps=[o for o in result.get("outcomes", [])], # Simplified for now
                    outcomes=[o for o in result.get("outcomes", [])]
                )
            except Exception as e:
                logger.error("Failed to extract skill: %s", e)

        self.write_event("review_completed", {"verdict": verdict, "status": "Success"})
        return verdict

    # ── Inner agentic loop (see HARNESS_DESIGN.md) ───────────────────────────

    def _build_action_critic(self, run_id: str, goal: str, registry: ToolRegistry):
        """Per-action CriticGate: evaluates medium/high-risk tool calls just
        before execution (OpenHands SecurityAnalyzer pattern). Low-risk tools
        pass without an LLM call to keep step cost bounded."""
        from agents.safety.critic import CriticGate, TraceFrame, Verdict
        from harness import (
            safety_record_trace, safety_record_verdict, safety_create_escalation
        )

        gate = CriticGate(
            critic_model=os.getenv("MODEL_CRITIC", "anthropic/claude-haiku-4-5"),
            max_recursion_depth=int(os.getenv("CRITIC_MAX_DEPTH", "2")),
            confidence_threshold=float(os.getenv("CRITIC_CONFIDENCE", "0.7")),
        )

        def critic(action: dict):
            tool = registry.get(action.get("tool", ""))
            if tool is None or tool.risk_level == "low":
                return True, "low risk"
            frame = TraceFrame(
                step_index=0,
                thought=action.get("thought", ""),
                proposed_action=f"{action['tool']}({json.dumps(action.get('args', {}), default=str)})",
                justification=action.get("thought", ""),
            )
            verdict = gate.evaluate(frame, run_id, self.agent_id, goal)
            safety_record_trace(run_id, self.agent_id, frame.to_dict())
            safety_record_verdict(run_id, self.agent_id, verdict.to_dict())
            if verdict.verdict in (Verdict.PASS, Verdict.FLAG):
                return True, verdict.reasoning
            safety_create_escalation(
                run_id, self.agent_id, frame.frame_hash, None, "critic_block",
            )
            return False, verdict.reasoning

        return critic

    def run_tool_loop(self, plan: dict, run_id: str) -> dict:
        """Drive the iterative tool loop for this agent's Tool objects."""
        from harness import generate_tracked
        registry = ToolRegistry(self.get_tool_objects(run_id))

        def llm(prompt: str) -> str:
            return generate_tracked(
                self.model_execute, prompt, run_id, self.agent_id, "execute",
            )

        def pre_step_check():
            self.check_killswitch()
            self.check_budget(run_id)

        def on_event(event_type: str, payload: dict):
            self.write_event(event_type, {"status": "Executing", **payload})

        agent_loop = AgentLoop(
            tools=registry,
            llm=llm,
            config=LoopConfig(
                max_steps=int(os.getenv("LOOP_MAX_STEPS", "15")),
            ),
            critic=self._build_action_critic(run_id, self.goal, registry),
            pre_step_check=pre_step_check,
            on_event=on_event,
        )

        steps_text = "\n".join(f"- {s}" for s in plan.get("steps", []))
        state = agent_loop.run(self.goal, context=f"Approved plan:\n{steps_text}")
        return {
            "outcomes": state.outcomes(),
            "final": state.final_result,
            "finished": state.finished,
            "stop_reason": state.stop_reason,
        }
