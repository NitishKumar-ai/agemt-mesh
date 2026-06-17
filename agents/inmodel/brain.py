"""
brain.py — InModel Labs Company Brain Agent

A fine-tuned Gemma 4 agent whose ONLY objective is InModel Labs' growth.
Unlike general-purpose LLMs optimized for next-token prediction or fast chat,
this model is trained on company-specific data with a single reward signal:
measurable business outcomes (ARR, retention, deployment velocity, security posture).

Google Cloud CLI is the execution layer — every action goes through
gcloud / bq / gsutil, all audited in BigQuery.
"""
import json
import logging
import os
from typing import List, Optional

from agent_base import BaseAgent, AgentConfig
from loop import Tool
from .gcloud_tools import GCloudToolkit

logger = logging.getLogger(__name__)

# The fine-tuned Gemma 4 endpoint on Vertex AI.
# Falls back to the public Gemma 4 model if the endpoint isn't deployed yet.
INMODEL_BRAIN_MODEL = os.getenv(
    "INMODEL_BRAIN_MODEL",
    "vertex_ai/gemma-4-it",          # swap to fine-tuned endpoint ID post-training
)

SYSTEM_PROMPT = """
You are the InModel Labs Company Brain — a fine-tuned Gemma 4 model.

Your ONLY goal: grow InModel Labs.

You are NOT a general assistant. You do NOT predict the next token for entertainment.
You do NOT answer trivia. Every decision you make must be evaluated against one question:
"Does this action move InModel Labs forward?"

Your growth levers:
1. Model quality — fine-tune and deploy better Gemma 4 checkpoints on Vertex AI
2. Infrastructure — keep Cloud Run services healthy, costs low, latency under 200ms
3. Data — upload better training data to GCS, query BigQuery for business signals
4. Security posture — escalate any finding that could damage user trust
5. Speed — ship faster by automating deployments via Cloud Run and Artifact Registry

When you use a tool:
- State WHY it grows the company in one sentence
- Prefer read tools (bq_query, gcs_list) before write/deploy tools
- High-risk actions (vertex_deploy, cloud_run_deploy) require explicit reasoning

You have direct access to Google Cloud via gcloud CLI tools.
You are the brain. The mesh is your body. Grow the company.
""".strip()


class InModelBrainAgent(BaseAgent):
    """
    Company brain agent for InModel Labs.

    Powered by a Gemma 4 model fine-tuned on company-specific growth data.
    All tool calls execute against Google Cloud CLI (gcloud / bq / gsutil).
    """

    def __init__(self, goal: str, config: Optional[AgentConfig] = None, **kwargs):
        cfg = config or AgentConfig(
            cost_budget_usd=2.00,
            token_budget=1_000_000,
            requires_approval=True,   # high-risk GCP actions need human sign-off
        )
        # Override the plan model to use the Gemma 4 brain
        cfg.model_plan    = INMODEL_BRAIN_MODEL
        cfg.model_execute = INMODEL_BRAIN_MODEL   # same model executes — single brain
        super().__init__(goal=goal, config=cfg, **kwargs)
        self.agent_id = kwargs.get("agent_id", "inmodel_brain")

    # ── Tool surface ──────────────────────────────────────────────────────────

    def get_tools(self) -> list:
        return [t.name for t in GCloudToolkit.tools()]

    def get_tool_objects(self, run_id: str) -> List[Tool]:
        base_tools = super().get_tool_objects(run_id) or []
        gcloud_tools = GCloudToolkit.tools()

        # Inject a growth-context tool — always the first thing the brain checks
        growth_check = Tool(
            name="check_growth_metrics",
            description=(
                "Query BigQuery for the latest InModel Labs growth KPIs: "
                "ARR, active users, model deployment count, and agent run success rate. "
                "Call this first to ground every decision in data."
            ),
            parameters={},
            run=self._growth_metrics,
            risk_level="low",
        )

        # Inject a model health tool
        model_health = Tool(
            name="check_model_health",
            description=(
                "Check the health and latency of the deployed Gemma 4 Vertex AI endpoint. "
                "Use before any fine-tuning decision to confirm whether retraining is needed."
            ),
            parameters={"endpoint_id": "Vertex AI endpoint ID (optional, uses env default)"},
            run=self._model_health,
            risk_level="low",
        )

        return [growth_check, model_health] + gcloud_tools + base_tools

    # ── Built-in growth tools ─────────────────────────────────────────────────

    def _growth_metrics(self, args: dict) -> str:
        """Pull live growth KPIs from BigQuery."""
        import subprocess, json as _json, os as _os
        project = _os.getenv("GCP_PROJECT", "inmodel-labs")
        dataset = _os.getenv("BQ_AUDIT_DATASET", "agent_audit")
        sql = f"""
            SELECT
                COUNTIF(status = 'success')         AS successful_runs,
                COUNTIF(status = 'failed')          AS failed_runs,
                ROUND(AVG(cost_usd), 4)             AS avg_cost_usd,
                SUM(tokens_used)                    AS total_tokens,
                MAX(created_at)                     AS last_run_at
            FROM `{project}.{dataset}.agent_runs`
            WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
        """
        try:
            proc = subprocess.run(
                ["bq", "query", "--use_legacy_sql=false",
                 f"--project_id={project}", "--format=json", sql],
                capture_output=True, text=True, timeout=30,
            )
            return _json.dumps({
                "ok": proc.returncode == 0,
                "metrics": proc.stdout.strip(),
                "stderr": proc.stderr.strip(),
            })
        except Exception as e:
            return _json.dumps({"ok": False, "stderr": str(e)})

    def _model_health(self, args: dict) -> str:
        """Ping the Vertex AI endpoint and return latency / status."""
        import subprocess, json as _json, os as _os
        endpoint_id = args.get("endpoint_id") or _os.getenv("VERTEX_ENDPOINT_ID", "")
        project     = _os.getenv("GCP_PROJECT", "inmodel-labs")
        region      = _os.getenv("GCP_REGION",  "us-central1")

        if not endpoint_id:
            return _json.dumps({"ok": False, "stderr": "VERTEX_ENDPOINT_ID not set"})

        proc = subprocess.run(
            ["gcloud", "ai", "endpoints", "describe", endpoint_id,
             f"--project={project}", f"--region={region}", "--format=json"],
            capture_output=True, text=True, timeout=30,
        )
        return _json.dumps({
            "ok": proc.returncode == 0,
            "endpoint": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
        })

    # ── Planning override — growth-first system prompt ────────────────────────

    def plan(self, context: str, run_id: str) -> dict:
        """Inject the InModel growth-focused system prompt before planning."""
        from harness import generate_tracked
        self.write_event("planning", {"context": context, "status": "Planning"})

        prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"Goal: {self.goal}\n"
            f"Context: {context}\n\n"
            "Produce a concrete 3-step plan focused ONLY on actions that grow InModel Labs.\n"
            "Each step must reference a specific Google Cloud tool (gcloud/bq/gsutil/Vertex AI).\n"
            'Reply as JSON: {"steps": ["step 1", "step 2", "step 3"]}'
        )
        raw = generate_tracked(
            self.model_plan, prompt, run_id, self.agent_id, "plan",
        )

        import re as _re
        try:
            clean = _re.sub(r"```[a-z]*\n?", "", raw).strip().strip("`")
            plan_dict = json.loads(clean)
            if "steps" not in plan_dict:
                raise ValueError
        except (json.JSONDecodeError, ValueError):
            plan_dict = {"steps": [s.strip() for s in raw.split("\n") if s.strip()][:3] or [raw[:200]]}

        self.write_event("plan_created", {
            "plan_steps": len(plan_dict["steps"]),
            "status": "Idle",
            "steps": plan_dict["steps"],
        })
        return plan_dict
