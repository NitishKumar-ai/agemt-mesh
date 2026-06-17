"""
workers.py — Conductor worker tasks for Agent Mesh

Each worker polls Conductor for its task type, executes it, and reports
back. This is the Python side of the Conductor integration — workers
run alongside FastAPI and call the existing agent logic directly.

Start with:
    python3 -m conductor.workers

Or via the Makefile:
    make conductor-workers
"""
import json
import logging
import os

from conductor.client.configuration.configuration import Configuration
from conductor.client.automator.task_handler import TaskHandler
from conductor.client.worker.worker_task import worker_task

from agent_base import AgentConfig
from harness import _REGISTRY, generate_tracked

logger = logging.getLogger(__name__)

CONDUCTOR_SERVER_URL = os.getenv("CONDUCTOR_SERVER_URL", "http://localhost:8080/api")
WF_PREFIX = "agent_mesh"


# ── Plan worker ───────────────────────────────────────────────────────────────

@worker_task(task_definition_name=f"{WF_PREFIX}_plan_task")
def plan_task(agent_id: str, goal: str, context: str, run_id: str) -> dict:
    """Execute the Plan phase for any registered agent."""
    reg = _REGISTRY.get(agent_id)
    if not reg:
        raise ValueError(f"Unknown agent: {agent_id}")

    cfg = AgentConfig(agent_id=agent_id)
    agent = reg.agent_cls(goal=goal, config=cfg)
    plan = agent.plan(context, run_id)
    return {"result": json.dumps(plan), "steps": plan.get("steps", [])}


# ── Execute worker ────────────────────────────────────────────────────────────

@worker_task(task_definition_name=f"{WF_PREFIX}_execute_task")
def execute_task(agent_id: str, goal: str, run_id: str, plan: str) -> dict:
    """Execute the Execute phase for any registered agent."""
    reg = _REGISTRY.get(agent_id)
    if not reg:
        raise ValueError(f"Unknown agent: {agent_id}")

    cfg = AgentConfig(agent_id=agent_id)
    agent = reg.agent_cls(goal=goal, config=cfg)

    plan_dict = json.loads(plan) if isinstance(plan, str) else plan
    result = agent.execute(plan_dict, run_id)
    return {"result": json.dumps(result)}


# ── Review worker ─────────────────────────────────────────────────────────────

@worker_task(task_definition_name=f"{WF_PREFIX}_review_task")
def review_task(agent_id: str, goal: str, run_id: str, execution_result: str) -> dict:
    """Execute the Review phase for any registered agent."""
    reg = _REGISTRY.get(agent_id)
    if not reg:
        raise ValueError(f"Unknown agent: {agent_id}")

    cfg = AgentConfig(agent_id=agent_id)
    agent = reg.agent_cls(goal=goal, config=cfg)

    result_dict = json.loads(execution_result) if isinstance(execution_result, str) else execution_result
    verdict = agent.review(result_dict, run_id)
    return {"result": json.dumps(verdict), "passed": verdict.get("passed", False)}


# ── Worker process entry point ─────────────────────────────────────────────────

def start_workers():
    """Start polling all Agent Mesh Conductor workers."""
    config = Configuration(base_url=CONDUCTOR_SERVER_URL)
    auth_token = os.getenv("CONDUCTOR_AUTH_TOKEN", "")
    if auth_token:
        config.api_key = {"X-Authorization": auth_token}

    handler = TaskHandler(
        workers=[plan_task, execute_task, review_task],
        configuration=config,
        scan_for_annotated_workers=False,
    )

    logger.info("Starting Agent Mesh Conductor workers → %s", CONDUCTOR_SERVER_URL)
    handler.start_processes()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    start_workers()
