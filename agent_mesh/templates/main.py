import os
import logging
import json
import time
from abc import ABC, abstractmethod
from dbos import DBOS
from pydantic import BaseModel
from typing import Any, Dict, Optional

# Observability (Langfuse via OpenLLMetry)
try:
    from traceloop.sdk import Traceloop
    Traceloop.init(app_name="agent-mesh", disable_batch=True)
except ImportError:
    pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Standardized Error Exception
class AgentMeshError(Exception):
    def __init__(self, problem: str, cause: str, fix: str, docs_link: str = "https://agentmesh.docs"):
        self.problem = problem
        self.cause = cause
        self.fix = fix
        self.docs_link = docs_link
        super().__init__(f"{problem} | Cause: {cause} | Fix: {fix} | Docs: {docs_link}")

# Escape Hatch for Model Client
class ModelClient(ABC):
    @abstractmethod
    def generate(self, prompt: str) -> str:
        pass

class GeminiClient(ModelClient):
    def generate(self, prompt: str) -> str:
        try:
            from google import genai
            client = genai.Client()
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            return response.text
        except Exception as e:
            logger.warning(f"Gemini call failed: {e}")
            return f"Mocked response for: {prompt}"

class AnthropicClient(ModelClient):
    def generate(self, prompt: str) -> str:
        try:
            from anthropic import Anthropic
            client = Anthropic()
            response = client.messages.create(
                model="claude-3-7-sonnet-20250219",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}]
            )
            return response.content[0].text
        except Exception as e:
            logger.warning(f"Anthropic call failed: {e}")
            return f"Mocked response for: {prompt}"

def get_model_client(provider: str) -> ModelClient:
    if provider == "gemini":
        return GeminiClient()
    elif provider == "anthropic":
        return AnthropicClient()
    else:
        raise AgentMeshError("Unknown model provider", f"Provider {provider} not supported.", "Use 'gemini' or 'anthropic'")

def init_db():
    with DBOS.transaction():
        DBOS.sql_session.execute(
            "CREATE TABLE IF NOT EXISTS agent_runs ("
            "id SERIAL PRIMARY KEY, "
            "run_id TEXT, "
            "agent_id TEXT, "
            "step TEXT, "
            "status TEXT, "
            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
            ")"
        )
        DBOS.sql_session.execute(
            "CREATE TABLE IF NOT EXISTS agent_events ("
            "id SERIAL PRIMARY KEY, "
            "tenant_id TEXT, "
            "payload JSONB, "
            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
            ")"
        )
        # Postgres NOTIFY trigger for SSE Dashboard
        DBOS.sql_session.execute(
            "CREATE OR REPLACE FUNCTION notify_event() RETURNS TRIGGER AS $$ "
            "BEGIN "
            "  PERFORM pg_notify('agent_bus', row_to_json(NEW)::text); "
            "  RETURN NEW; "
            "END; "
            "$$ LANGUAGE plpgsql;"
        )
        DBOS.sql_session.execute("DROP TRIGGER IF EXISTS event_notify_trigger ON agent_events;")
        DBOS.sql_session.execute(
            "CREATE TRIGGER event_notify_trigger "
            "AFTER INSERT ON agent_events "
            "FOR EACH ROW EXECUTE FUNCTION notify_event();"
        )

@DBOS.transaction()
def update_status(run_id: str, agent_id: str, step: str, status: str):
    DBOS.sql_session.execute(
        "INSERT INTO agent_runs (run_id, agent_id, step, status) VALUES (%s, %s, %s, %s)",
        [run_id, agent_id, step, status]
    )

@DBOS.transaction()
def publish_event(tenant_id: str, payload: dict):
    DBOS.sql_session.execute(
        "INSERT INTO agent_events (tenant_id, payload) VALUES (%s, %s)",
        [tenant_id, json.dumps(payload)]
    )

# Progressive Disclosure BaseAgent
class BaseAgent(ABC):
    def __init__(self, goal: str, model: str = "gemini", **kwargs):
        self.goal = goal
        self.model_provider = model
        # Advanced configs hidden in kwargs
        self.agent_id = kwargs.get("agent_id", self.__class__.__name__)
        self.tenant_id = kwargs.get("tenant_id", "default")
        self.client = get_model_client(self.model_provider)

    def write_event(self, event_type: str, payload: dict):
        event_data = {
            "agent_id": self.agent_id,
            "event_type": event_type,
            "payload": payload
        }
        publish_event(self.tenant_id, event_data)

    @abstractmethod
    def get_tools(self) -> list:
        pass

    @DBOS.step()
    def plan(self, context: str) -> dict:
        self.write_event("planning", {"context": context, "status": "Planning"})
        prompt = f"Goal: {self.goal}. Context: {context}. Create a 3-step plan."
        plan_text = self.client.generate(prompt)
        plan_dict = {"steps": [f"Step 1: {plan_text[:20]}...", "Step 2: Execute", "Step 3: Review"]}
        self.write_event("plan_created", {"plan_steps": len(plan_dict["steps"]), "status": "Idle"})
        return plan_dict

    @DBOS.step()
    def execute(self, plan: dict) -> dict:
        self.write_event("executing", {"status": "Executing"})
        time.sleep(1) # Simulating long running execution
        result = {"data": "Mocked tool execution result"}
        self.write_event("execution_completed", {"result": "Success", "status": "Idle"})
        return result

    @DBOS.step()
    def review(self, result: dict) -> dict:
        self.write_event("reviewing", {"status": "Executing"})
        verdict = {"passed": True, "feedback": "Looks good"}
        self.write_event("review_completed", {"verdict": verdict, "status": "Success"})
        return verdict

class ResearchAgent(BaseAgent):
    def get_tools(self) -> list:
        return ["web_search", "rag"]

class CommitGuardAgent(BaseAgent):
    def get_tools(self) -> list:
        # E2B Sandbox strictly proxied to github.com
        return ["e2b_sandbox_proxied", "git_diff"]

@DBOS.workflow()
def agent_loop(context: str):
    run_id = DBOS.workflow_id
    
    agent = CommitGuardAgent(goal="Audit target environment for vulnerabilities")
    
    update_status(run_id, agent.agent_id, "start", "Idle")
    
    plan = agent.plan(context)
    update_status(run_id, agent.agent_id, "planning", "Planning")
    
    # 24h HITL timeout mock
    # DBOS.sleep(86400) # real implementation would wait for event
    
    result = agent.execute(plan)
    update_status(run_id, agent.agent_id, "executing", "Executing")
    
    verdict = agent.review(result)
    if verdict.get("passed"):
        update_status(run_id, agent.agent_id, "complete", "Success")
    else:
        update_status(run_id, agent.agent_id, "failed", "Failed")
        
    return verdict
