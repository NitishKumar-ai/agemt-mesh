"""
bridge.py — Agent Mesh → Conductor workflow bridge

Replaces DBOS as the durable execution layer. Each agent run becomes
a Conductor workflow execution with:
  - Task 1: PLAN   (LLM call → plan JSON)
  - Task 2: HUMAN  (approval gate — skipped if requires_approval=False)
  - Task 3: EXECUTE (iterative tool loop)
  - Task 4: REVIEW  (LLM verdict)

Conductor handles retries, timeouts, crash recovery, and the human
approval wait — the same guarantees DBOS gave us but with a full UI
and horizontal scale.
"""
import json
import logging
import os
import uuid
from typing import Any, Dict, Optional

from conductor.client.configuration.configuration import Configuration
from conductor.client.http.api_client import ApiClient
from conductor.client.http.api.metadata_resource_api import MetadataResourceApi
from conductor.client.http.api.workflow_resource_api import WorkflowResourceApi
from conductor.client.http.models import (
    StartWorkflowRequest,
    WorkflowDef,
    WorkflowTask,
    TaskDef,
)

logger = logging.getLogger(__name__)

CONDUCTOR_SERVER_URL = os.getenv("CONDUCTOR_SERVER_URL", "http://localhost:8080/api")
CONDUCTOR_AUTH_TOKEN = os.getenv("CONDUCTOR_AUTH_TOKEN", "")

# Workflow name prefix — all Agent Mesh workflows are namespaced
WF_PREFIX = "agent_mesh"


def _get_config() -> Configuration:
    config = Configuration(base_url=CONDUCTOR_SERVER_URL)
    if CONDUCTOR_AUTH_TOKEN:
        config.api_key = {"X-Authorization": CONDUCTOR_AUTH_TOKEN}
    return config


def _api_client() -> ApiClient:
    return ApiClient(configuration=_get_config())


class ConductorBridge:
    """
    Thin wrapper around Conductor's REST API for Agent Mesh operations.

    Registers workflow definitions and starts/monitors executions.
    All agent 3-pass workflows are pre-registered at startup.
    """

    def __init__(self):
        self._client = _api_client()
        self._workflow_api = WorkflowResourceApi(self._client)
        self._metadata_api = MetadataResourceApi(self._client)

    # ── Workflow registration ─────────────────────────────────────────────────

    def register_workflow(self, agent_id: str, requires_approval: bool = False) -> str:
        """Register a 3-pass agent workflow definition in Conductor."""
        wf_name = f"{WF_PREFIX}_{agent_id}"

        tasks = [
            # Task 1: Plan
            WorkflowTask(
                name=f"{WF_PREFIX}_plan_task",
                task_reference_name="plan",
                type="SIMPLE",
                input_parameters={
                    "agent_id": "${workflow.input.agent_id}",
                    "goal":     "${workflow.input.goal}",
                    "context":  "${workflow.input.context}",
                    "run_id":   "${workflow.input.run_id}",
                },
            ),
        ]

        if requires_approval:
            # Task 2: Human approval gate (Conductor built-in HUMAN task)
            tasks.append(
                WorkflowTask(
                    name="HUMAN",
                    task_reference_name="approval_gate",
                    type="HUMAN",
                    input_parameters={
                        "plan_steps": "${plan.output.steps}",
                        "agent_id":   "${workflow.input.agent_id}",
                        "run_id":     "${workflow.input.run_id}",
                        "risk_level": "${workflow.input.risk_level}",
                    },
                )
            )

        tasks += [
            # Task 3: Execute
            WorkflowTask(
                name=f"{WF_PREFIX}_execute_task",
                task_reference_name="execute",
                type="SIMPLE",
                input_parameters={
                    "agent_id": "${workflow.input.agent_id}",
                    "goal":     "${workflow.input.goal}",
                    "run_id":   "${workflow.input.run_id}",
                    "plan":     "${plan.output.result}",
                },
            ),
            # Task 4: Review
            WorkflowTask(
                name=f"{WF_PREFIX}_review_task",
                task_reference_name="review",
                type="SIMPLE",
                input_parameters={
                    "agent_id":        "${workflow.input.agent_id}",
                    "goal":            "${workflow.input.goal}",
                    "run_id":          "${workflow.input.run_id}",
                    "execution_result": "${execute.output.result}",
                },
            ),
        ]

        wf_def = WorkflowDef(
            name=wf_name,
            description=f"Agent Mesh 3-pass workflow for agent: {agent_id}",
            version=1,
            tasks=tasks,
            input_parameters=["agent_id", "goal", "context", "run_id", "risk_level"],
            output_parameters={
                "plan":    "${plan.output.result}",
                "result":  "${execute.output.result}",
                "verdict": "${review.output.result}",
                "run_id":  "${workflow.input.run_id}",
            },
            timeout_seconds=3600,  # 1 hour max
            restartable=True,
            workflow_status_listener_enabled=True,
            owner_email="nitishkumar44470@gmail.com",
        )

        try:
            self._metadata_api.create([wf_def])
            logger.info("Registered Conductor workflow: %s", wf_name)
        except Exception as e:
            # Already exists — update it
            try:
                self._metadata_api.update([wf_def])
                logger.info("Updated Conductor workflow: %s", wf_name)
            except Exception as update_err:
                logger.warning("Could not register/update workflow %s: %s", wf_name, update_err)

        return wf_name

    # ── Workflow execution ────────────────────────────────────────────────────

    def start_workflow(
        self,
        agent_id: str,
        goal: str,
        context: str,
        run_id: Optional[str] = None,
        risk_level: str = "medium",
    ) -> str:
        """Start a Conductor workflow execution. Returns the workflow execution ID."""
        run_id = run_id or str(uuid.uuid4())
        wf_name = f"{WF_PREFIX}_{agent_id}"

        request = StartWorkflowRequest(
            name=wf_name,
            version=1,
            correlation_id=run_id,
            input={
                "agent_id":   agent_id,
                "goal":       goal,
                "context":    context,
                "run_id":     run_id,
                "risk_level": risk_level,
            },
        )

        wf_execution_id = self._workflow_api.start_workflow(request)
        logger.info("Started Conductor workflow %s → execution %s", wf_name, wf_execution_id)
        return wf_execution_id

    def get_workflow_status(self, execution_id: str) -> Dict[str, Any]:
        """Fetch workflow status and output from Conductor."""
        try:
            wf = self._workflow_api.get_execution_status(execution_id, include_tasks=True)
            return {
                "status":  wf.status,
                "output":  wf.output or {},
                "tasks":   [{"ref": t.reference_task_name, "status": t.status} for t in (wf.tasks or [])],
                "run_id":  wf.correlation_id,
            }
        except Exception as e:
            return {"status": "FAILED", "error": str(e)}

    def terminate_workflow(self, execution_id: str, reason: str = "killswitch") -> bool:
        """Terminate a running workflow (killswitch support)."""
        try:
            self._workflow_api.terminate1(execution_id, reason=reason)
            return True
        except Exception as e:
            logger.error("Failed to terminate workflow %s: %s", execution_id, e)
            return False

    def is_healthy(self) -> bool:
        """Check if Conductor server is reachable."""
        try:
            from conductor.client.http.api.health_check_resource_api import HealthCheckResourceApi
            HealthCheckResourceApi(self._client).get_health()
            return True
        except Exception:
            return False


# ── Module-level convenience function (mirrors harness.run_agent signature) ──

_bridge: Optional[ConductorBridge] = None


def get_bridge() -> ConductorBridge:
    global _bridge
    if _bridge is None:
        _bridge = ConductorBridge()
    return _bridge


def run_agent_via_conductor(
    agent_id: str,
    goal: str,
    context: str,
    tenant_id: str = "default",
    config_overrides: Optional[dict] = None,
) -> dict:
    """
    Start an agent workflow via Conductor and return the execution ID.

    This is async by design — Conductor handles the actual execution.
    Poll get_bridge().get_workflow_status(execution_id) for results,
    or subscribe to Conductor's event/webhook callbacks.

    Returns:
        {"execution_id": str, "run_id": str, "status": "RUNNING"}
    """
    bridge = get_bridge()
    run_id = str(uuid.uuid4())

    risk_level = "medium"
    if config_overrides:
        risk_level = config_overrides.get("risk_level", "medium")

    try:
        execution_id = bridge.start_workflow(
            agent_id=agent_id,
            goal=goal,
            context=context,
            run_id=run_id,
            risk_level=risk_level,
        )
        return {
            "execution_id": execution_id,
            "run_id":       run_id,
            "status":       "RUNNING",
            "conductor_ui": f"http://localhost:5001/execution/{execution_id}",
        }
    except Exception as e:
        logger.error("Failed to start Conductor workflow for %s: %s", agent_id, e)
        # Fall back to direct DBOS execution
        logger.warning("Falling back to DBOS harness for agent %s", agent_id)
        from harness import run_agent as dbos_run_agent
        return dbos_run_agent(agent_id, goal, context, tenant_id, config_overrides)
