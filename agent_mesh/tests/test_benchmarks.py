"""
tests/test_benchmarks.py — Recursive agents and performance benchmarks.
"""
import os
import json
import pytest
import litellm
from dbos import DBOS
from harness import run_agent, list_agents_info

# These benchmarks make real LLM calls. They are opt-in: provide a key via the
# GEMINI_API_KEY (or GOOGLE_API_KEY) env var to run them. Never hardcode keys.
GEMINI_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

pytestmark = pytest.mark.skipif(
    not GEMINI_KEY,
    reason="benchmarks require a live LLM key (set GEMINI_API_KEY to run)",
)

@pytest.fixture(autouse=True, scope="session")
def init_dbos():
    from dbos import DBOSConfig
    import os
    os.environ["APP_DATABASE_URL"] = "sqlite:///agent_mesh_benchmarks.sqlite"
    DBOS(config=DBOSConfig(
        name="agent-mesh-benchmarks",
        database_url="sqlite:///agent_mesh_benchmarks.sqlite",
    ))
    from main import init_db
    init_db()

@pytest.fixture(autouse=True)
def setup_gemini():
    os.environ["GOOGLE_API_KEY"] = GEMINI_KEY or ""
    os.environ["GEMINI_API_KEY"] = GEMINI_KEY or ""
    # Mock litellm to avoid real costs during tests if desired, 
    # but here we WANT to test the real key if possible.
    # For now, we'll let it run real calls.

def test_recursive_delegation():
    """
    Test that an agent can delegate to another agent recursively.
    """
    # We'll use Hermes to delegate to Research
    goal = "Research CVE-2024-0001 and then summarize it."
    result = run_agent("hermes", goal, "Recursive test")
    
    assert result["passed"] is True
    assert "cost_usd" in result
    print(f"\nRecursive Delegation Result: {result}")

def test_all_agents_benchmark():
    """
    Benchmark all agents and print performance metrics.
    """
    agents = list_agents_info()
    tasks = {
        "research": "Find recent info on Gemini 1.5 Pro.",
        "marketing": "Draft a tweet about Agent Mesh.",
        "commitguard": "Check https://github.com/octocat/Hello-World for secrets.",
    }
    
    results = []
    for agent in agents:
        aid = agent["id"]
        if aid in tasks:
            print(f"\nBenchmarking {aid}...")
            res = run_agent(aid, tasks[aid], "Benchmark")
            results.append({
                "agent": aid,
                "passed": res.get("passed"),
                "cost": res.get("cost_usd"),
                "tokens": res.get("total_tokens")
            })
    
    print("\nBenchmark Results:")
    print(json.dumps(results, indent=2))
