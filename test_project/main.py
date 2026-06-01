import os
import uuid
import logging
from dbos import DBOS

print("Observability enabled: Logging all LLM prompts to console.")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def init_db():
    with DBOS.transaction():
        DBOS.sql_session.execute(
            "CREATE TABLE IF NOT EXISTS agent_runs ("
            "run_id TEXT PRIMARY KEY, "
            "step TEXT, "
            "status TEXT"
            ")"
        )

@DBOS.step()
def update_status(run_id: str, step: str, status: str):
    DBOS.sql_session.execute(
        "INSERT INTO agent_runs (run_id, step, status) VALUES (%s, %s, %s) "
        "ON CONFLICT (run_id) DO UPDATE SET step = EXCLUDED.step, status = EXCLUDED.status",
        [run_id, step, status]
    )
    logger.info(f"Run {run_id} - Step: {step}, Status: {status}")

@DBOS.step(retries=3)
def plan_step(prompt: str) -> str:
    # Mock LLM call for planning
    logger.info("Planning...")
    return f"Plan for: {prompt}"

@DBOS.step(retries=3)
def execute_step(plan: str) -> str:
    # Mock LLM call for execution
    logger.info("Executing...")
    return f"Execution of: {plan}"

@DBOS.step(retries=3)
def review_step(execution: str) -> str:
    # Mock LLM call for reviewing
    logger.info("Reviewing...")
    return f"Review of: {execution}"

@DBOS.workflow()
def agent_loop(prompt: str) -> str:
    run_id = str(uuid.uuid4())
    
    update_status(run_id, "plan", "running")
    plan = plan_step(prompt)
    update_status(run_id, "plan", "completed")

    update_status(run_id, "execute", "running")
    execution = execute_step(plan)
    update_status(run_id, "execute", "completed")

    update_status(run_id, "review", "running")
    review = review_step(execution)
    update_status(run_id, "review", "completed")

    return review

if __name__ == "__main__":
    DBOS.launch()
    init_db()
    logger.info("Agent Mesh initialized and ready.")
