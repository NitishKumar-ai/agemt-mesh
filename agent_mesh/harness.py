"""
harness.py — Agent loop & harness infrastructure.

Implements the plan→execute→review 3-pass agent loop from plan.md:
  - BaseAgent: abstract class with contract fields (budget, retries, killswitch)
  - AgentRegistry: maps agent_id → agent class with live status
  - run_agent(): generic DBOS workflow that drives any BaseAgent subclass
  - generate_tracked(): LLM call wrapper that records token usage per run

Contract fields (from plan.md):
  agent_id, tenant_id, model_plan, model_execute, cost_budget_usd,
  token_budget, max_retries, sandbox, requires_approval
"""

import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Type

from agent_base import BaseAgent, AgentConfig, MODEL_PLAN, MODEL_EXECUTE

from dbos import DBOS
from sqlalchemy import text

from events import bus
from loop import Tool, ToolRegistry
from store import (
    agent_run_record_tokens,
    agent_run_total_cost,
    agent_run_total_tokens,
    killswitch_get,
    KillswitchEngaged,
    safety_record_trace,
    safety_record_verdict,
    safety_create_escalation,
)

logger = logging.getLogger(__name__)


class AgentError(Exception):
    pass


class BudgetExceeded(AgentError):
    pass


# ── Token-tracked LLM call ──────────────────────────────────────────────────

@DBOS.step()
def generate_tracked(
    model: str,
    prompt: str,
    run_id: str,
    agent_id: str,
    phase: str,
    max_tokens: int = 4096,
) -> str:
    """
    LLM call via LiteLLM that records token usage to the DB.
    Returns the response text. Raises LLMError on failure.
    """
    from main import LLMError

    try:
        import litellm
        response = litellm.completion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )
        content = response.choices[0].message.content
        if not content or not content.strip():
            raise LLMError(f"Empty response from {model}")

        usage = getattr(response, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
        completion_tokens = getattr(usage, "completion_tokens", 0) or 0
        cost = _estimate_cost(model, prompt_tokens, completion_tokens)

        agent_run_record_tokens(
            run_id, agent_id, phase, model,
            prompt_tokens, completion_tokens, cost,
        )
        return content
    except LLMError:
        raise
    except Exception as e:
        logger.error("generate_tracked failed — model=%s error=%s", model, e)
        raise LLMError(f"LLM call failed ({model}): {e}") from e


_COST_TABLE = {
    "gemini/gemini-2.5-flash-lite": (0.10, 0.40),
    "anthropic/claude-sonnet-4-6": (3.00, 15.00),
    "anthropic/claude-haiku-4-5": (1.00, 5.00),
}


def _estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    for prefix, (inp_per_m, out_per_m) in _COST_TABLE.items():
        if model.startswith(prefix):
            return (prompt_tokens * inp_per_m + completion_tokens * out_per_m) / 1_000_000
    return 0.0


# ── Registry ─────────────────────────────────────────────────────────────────

@dataclass
class AgentRegistration:
    agent_cls: Type[BaseAgent]
    name: str
    description: str
    default_config: AgentConfig
    capabilities: list

_REGISTRY: Dict[str, AgentRegistration] = {}
_RUNNING: Dict[str, str] = {}  # agent_id → run_id of active run


def register_agent(
    agent_id: str,
    agent_cls: Type[BaseAgent],
    name: str,
    description: str,
    capabilities: list,
    default_config: Optional[AgentConfig] = None,
):
    cfg = default_config or AgentConfig(agent_id=agent_id)
    cfg.agent_id = agent_id
    _REGISTRY[agent_id] = AgentRegistration(
        agent_cls=agent_cls,
        name=name,
        description=description,
        default_config=cfg,
        capabilities=capabilities,
    )


def get_registry() -> Dict[str, AgentRegistration]:
    return dict(_REGISTRY)


def get_agent_status(agent_id: str) -> str:
    return "running" if agent_id in _RUNNING else "idle"


def mark_running(agent_id: str, run_id: str):
    _RUNNING[agent_id] = run_id


def mark_idle(agent_id: str):
    _RUNNING.pop(agent_id, None)


def list_agents_info() -> list:
    result = []
    for aid, reg in _REGISTRY.items():
        cfg = reg.default_config
        result.append({
            "id": aid,
            "name": reg.name,
            "description": reg.description,
            "model": cfg.model_execute or MODEL_EXECUTE,
            "sandbox": cfg.sandbox,
            "capabilities": reg.capabilities,
            "status": get_agent_status(aid),
        })
    return result


# ── Generic agent workflow ───────────────────────────────────────────────────

@DBOS.step()
def _harness_plan(agent: BaseAgent, context: str, run_id: str) -> dict:
    return agent.plan(context, run_id)


@DBOS.step()
def _harness_execute(agent: BaseAgent, plan: dict, run_id: str) -> dict:
    return agent.execute(plan, run_id)


@DBOS.step()
def _harness_review(agent: BaseAgent, result: dict, run_id: str) -> dict:
    return agent.review(result, run_id)


@DBOS.step()
def _harness_critic_gate(
    agent: BaseAgent, plan: dict, run_id: str, goal: str,
) -> dict:
    """
    Per-action CriticGate evaluation (Track B).

    Extracts trace frames from the plan, runs each through the Critic,
    and returns a gated result with verdicts per action.
    """
    from agents.safety.critic import (
        CriticGate, TraceFrame, extract_trace_frames, Verdict,
    )

    gate = CriticGate(
        critic_model=os.getenv("MODEL_CRITIC", "anthropic/claude-haiku-4-5"),
        max_recursion_depth=int(os.getenv("CRITIC_MAX_DEPTH", "2")),
        confidence_threshold=float(os.getenv("CRITIC_CONFIDENCE", "0.7")),
    )

    steps = plan.get("steps", [])
    # Pass the full plan dict as JSON so extract_trace_frames can find "frames"
    frames = extract_trace_frames(json.dumps(plan), steps, goal)

    gated_steps = []
    blocked_steps = []
    flagged_steps = []

    for frame in frames:
        verdict = gate.evaluate(frame, run_id, agent.agent_id, goal)

        safety_record_trace(run_id, agent.agent_id, frame.to_dict())
        safety_record_verdict(run_id, agent.agent_id, verdict.to_dict())

        if verdict.verdict == Verdict.PASS:
            gated_steps.append(frame.proposed_action)
        elif verdict.verdict == Verdict.FLAG:
            flagged_steps.append({
                "step": frame.proposed_action,
                "reason": verdict.reasoning,
                "confidence": verdict.confidence,
            })
            gated_steps.append(frame.proposed_action)
        else:
            blocked_steps.append({
                "step": frame.proposed_action,
                "reason": verdict.reasoning,
                "confidence": verdict.confidence,
            })
            safety_create_escalation(
                run_id, agent.agent_id, frame.frame_hash,
                None, "critic_block",
            )

    agent.write_event("critic_evaluation", {
        "status": "Executing",
        "total_steps": len(frames),
        "passed": len(gated_steps),
        "flagged": len(flagged_steps),
        "blocked": len(blocked_steps),
        "stats": gate.stats,
    })

    return {
        "gated_steps": gated_steps,
        "blocked_steps": blocked_steps,
        "flagged_steps": flagged_steps,
        "all_passed": len(blocked_steps) == 0,
        "stats": gate.stats,
    }


@DBOS.step()
def _harness_request_approval(agent: BaseAgent, payload: dict, run_id: str):
    from main import publish_event
    event_data = {
        "agent_id": agent.agent_id,
        "event_type": "approval_required",
        "payload": payload,
    }
    publish_event(agent.tenant_id, event_data)
    bus.emit(json.dumps(event_data))


@DBOS.workflow()
def run_agent(
    agent_id: str,
    goal: str,
    context: str,
    tenant_id: str = "default",
    config_overrides: Optional[dict] = None,
) -> dict:
    """
    Generic 3-pass agent workflow: plan → [approve] → execute → review.

    Retry loop: on review failure, loops back to plan up to max_retries times.
    Killswitch check before each phase.
    Budget check after each LLM-calling phase.
    DLQ on unrecoverable error.
    """
    from main import update_status, insert_dlq

    run_id = DBOS.workflow_id

    reg = _REGISTRY.get(agent_id)
    if not reg:
        insert_dlq(run_id, agent_id, f"Unknown agent: {agent_id}", {"goal": goal})
        return {"passed": False, "feedback": f"Unknown agent: {agent_id}"}

    cfg = AgentConfig(
        agent_id=reg.default_config.agent_id,
        tenant_id=tenant_id,
        model_plan=reg.default_config.model_plan,
        model_execute=reg.default_config.model_execute,
        max_retries=reg.default_config.max_retries,
        cost_budget_usd=reg.default_config.cost_budget_usd,
        token_budget=reg.default_config.token_budget,
        sandbox=reg.default_config.sandbox,
        requires_approval=reg.default_config.requires_approval,
    )
    if config_overrides:
        for k, v in config_overrides.items():
            if hasattr(cfg, k):
                setattr(cfg, k, v)

    agent = reg.agent_cls(goal=goal, config=cfg)
    mark_running(agent_id, run_id)
    update_status(run_id, agent_id, "start", "Idle")

    try:
        for attempt in range(cfg.max_retries + 1):
            # ── Plan ──
            agent.check_killswitch()
            update_status(run_id, agent_id, "planning", "Planning")
            plan = _harness_plan(agent, context, run_id)
            agent.check_budget(run_id)

            # ── Approval gate ──
            if cfg.requires_approval:
                steps_summary = "\n".join(
                    f"+ {s}" for s in plan.get("steps", [])
                )
                _harness_request_approval(agent, {
                    "context": context[:500],
                    "plan_steps": plan.get("steps", []),
                    "add": steps_summary or "+ (no steps)",
                    "sub": "- (pending approval)",
                    "risk_level": "medium",
                    "attempt": attempt + 1,
                    "agent_id": agent.agent_id,
                }, run_id)
                update_status(run_id, agent_id, "blocked", "Blocked")

                approval = DBOS.recv("approval", timeout_seconds=86400)
                if approval is None:
                    update_status(run_id, agent_id, "timeout", "Failed")
                    return {"passed": False, "feedback": "Approval timed out (24h)"}
                if not approval.get("approved"):
                    update_status(run_id, agent_id, "rejected", "Failed")
                    agent.write_event("execution_aborted", {"status": "Failed"})
                    return {"passed": False, "feedback": "Rejected by operator"}

            # ── Critic Gate (Track B) ──
            agent.check_killswitch()
            update_status(run_id, agent_id, "critic_eval", "Executing")
            gate_result = _harness_critic_gate(agent, plan, run_id, goal)
            agent.check_budget(run_id)

            if not gate_result["all_passed"]:
                blocked = gate_result["blocked_steps"]
                agent.write_event("critic_blocked", {
                    "status": "Executing",
                    "blocked_steps": blocked,
                })
                if attempt < cfg.max_retries:
                    context = (
                        f"Critic blocked {len(blocked)} action(s): "
                        f"{[b['reason'] for b in blocked[:3]]}. "
                        f"Revise plan to avoid these. Original context: {context[:300]}"
                    )
                    agent.write_event("retry", {
                        "status": "Executing",
                        "attempt": attempt + 2,
                        "issues": [b["reason"] for b in blocked],
                    })
                    continue

            # ── Execute (only critic-approved steps) ──
            gated_plan = {"steps": gate_result["gated_steps"]}
            agent.check_killswitch()
            update_status(run_id, agent_id, "executing", "Executing")
            result = agent.execute(gated_plan, run_id)
            agent.check_budget(run_id)

            # ── Review ──
            agent.check_killswitch()
            update_status(run_id, agent_id, "reviewing", "Executing")
            verdict = _harness_review(agent, result, run_id)

            if verdict.get("passed"):
                update_status(run_id, agent_id, "complete", "Success")
                cost = agent_run_total_cost(run_id)
                tokens = agent_run_total_tokens(run_id)
                agent.write_event("agent_completed", {
                    "status": "Success",
                    "attempts": attempt + 1,
                    "cost_usd": round(cost, 4),
                    "total_tokens": tokens,
                })
                return {
                    "passed": True,
                    "feedback": verdict.get("feedback", ""),
                    "attempts": attempt + 1,
                    "cost_usd": round(cost, 4),
                    "total_tokens": tokens,
                }

            if attempt < cfg.max_retries:
                issues = verdict.get("issues", [])
                context = (
                    f"Previous attempt failed. Issues: {issues}. "
                    f"Original context: {context[:300]}"
                )
                agent.write_event("retry", {
                    "status": "Executing",
                    "attempt": attempt + 2,
                    "issues": issues,
                })
            else:
                update_status(run_id, agent_id, "failed", "Failed")
                return {
                    "passed": False,
                    "feedback": verdict.get("feedback", "Review failed after max retries"),
                    "attempts": attempt + 1,
                    "issues": verdict.get("issues", []),
                }

    except (KillswitchEngaged, BudgetExceeded) as e:
        update_status(run_id, agent_id, "halted", "Failed")
        agent.write_event("agent_halted", {"status": "Failed", "reason": str(e)})
        return {"passed": False, "feedback": str(e)}
    except Exception as e:
        insert_dlq(run_id, agent_id, str(e), {"goal": goal, "context": context[:200]})
        update_status(run_id, agent_id, "dlq", "Failed")
        agent.write_event("execution_failed", {"status": "Failed", "error": str(e)})
        return {"passed": False, "feedback": f"Fatal error → DLQ: {e}"}
    finally:
        mark_idle(agent_id)

    return {"passed": False, "feedback": "Unexpected exit"}
