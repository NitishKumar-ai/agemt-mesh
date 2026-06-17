"""
benchmarks/run_benchmarks.py — Performance benchmarking suite for Agent Mesh.
"""
import os
import sys

# 1. Initialize DBOS BEFORE anything else
from dbos import DBOS, DBOSConfig
DBOS(
    config=DBOSConfig(
        name="agent-mesh-benchmarks",
        database_url="sqlite:///agent_mesh_benchmarks.sqlite",
    )
)

import json
import time
import logging
from typing import Dict, List
import litellm

# 2. Set API keys and DB URLs
if os.getenv("GEMINI_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY")

os.environ["APP_DATABASE_URL"] = "sqlite:///agent_mesh_benchmarks.sqlite"

# 3. Import app logic and mock transactions for benchmarking
import api
from harness import run_agent, list_agents_info
from unittest.mock import MagicMock

# Mock transactions and steps to avoid DBOS errors during benchmarking
import main
main.update_status = MagicMock()
main.insert_dlq = MagicMock()
import harness
harness.agent_run_record_tokens = MagicMock()
harness.agent_run_total_cost = MagicMock(return_value=0.0)
harness.agent_run_total_tokens = MagicMock(return_value=0)
harness.safety_record_trace = MagicMock()
harness.safety_record_verdict = MagicMock()
harness.safety_create_escalation = MagicMock()

# Mock harness steps to run unwrapped
harness._harness_plan = harness._harness_plan.__wrapped__
harness._harness_execute = harness._harness_execute.__wrapped__
harness._harness_review = harness._harness_review.__wrapped__
harness._harness_critic_gate = harness._harness_critic_gate.__wrapped__
harness._harness_request_approval = harness._harness_request_approval.__wrapped__

# Mock DBOS context
DBOS.workflow_id = "benchmark-run-id"
DBOS.recv = MagicMock(return_value={"approved": True})

from main import init_db
init_db()  # Create tables in benchmark sqlite

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BENCHMARK_TASKS = {
    "research": "Identify the top 3 critical CVEs from 2024 related to Python web frameworks.",
    "commitguard": "Scan this repository for hardcoded secrets: https://github.com/octocat/Hello-World",
    "marketing": "Create a LinkedIn post draft for a new zero-day finding in OpenSSL.",
    "hermes": "Delegate a research task to find CVEs and then draft a marketing post about them.",
}

def run_benchmark(agent_id: str, goal: str) -> dict:
    logger.info("Benchmarking agent: %s", agent_id)
    start_time = time.time()
    try:
        # Call unwrapped to bypass DBOS
        result = run_agent.__wrapped__(agent_id, goal, "Benchmark run")
    except Exception as e:
        logger.error("Agent run failed: %s", e)
        result = {"passed": False, "feedback": str(e)}
    end_time = time.time()
    latency = end_time - start_time
    return {
        "agent_id": agent_id,
        "goal": goal[:50] + "...",
        "passed": result.get("passed", False),
        "feedback": result.get("feedback", "N/A"),
        "latency_sec": round(latency, 2),
        "cost_usd": result.get("cost_usd", 0.0),
        "total_tokens": result.get("total_tokens", 0),
        "attempts": result.get("attempts", 0),
    }

def main():
    results = []
    agents = list_agents_info()
    for agent in agents:
        agent_id = agent["id"]
        if agent_id in BENCHMARK_TASKS:
            res = run_benchmark(agent_id, BENCHMARK_TASKS[agent_id])
            results.append(res)

    print("\n" + "="*80)
    print(f"{'AGENT ID':<15} | {'LATENCY':<10} | {'TOKENS':<10} | {'COST ($)':<10} | {'STATUS'}")
    print("-" * 80)
    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"{r['agent_id']:<15} | {r['latency_sec']:<10} | {r['total_tokens']:<10} | {r['cost_usd']:<10.4f} | {status}")
        if not r["passed"]:
            print(f"   Reason: {r['feedback']}")
    print("="*80 + "\n")

    with open("benchmarks/report.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    main()
