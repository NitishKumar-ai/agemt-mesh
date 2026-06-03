import os
import logging
import json
import redis
from abc import ABC, abstractmethod
from dbos import DBOS
from pydantic import BaseModel
from typing import Any, Dict

# Observability (Langfuse via OpenLLMetry)
try:
    from traceloop.sdk import Traceloop
    Traceloop.init(app_name="agent-mesh", disable_batch=True)
except ImportError:
    pass

# {{ OBSERVABILITY_INIT }}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis for event bus/memory bus
redis_client = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"), port=6379, decode_responses=True)

class Plan(BaseModel):
    steps: list[str]

class Result(BaseModel):
    data: Any

class Verdict(BaseModel):
    passed: bool
    feedback: str

def call_llm(prompt: str, model_provider: str = "gemini") -> str:
    """Call the specified LLM provider."""
    try:
        if model_provider == "gemini":
            from google import genai
            client = genai.Client()
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            return response.text
        elif model_provider == "openai":
            from openai import OpenAI
            client = OpenAI()
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}]
            )
            return response.choices[0].message.content
        elif model_provider == "anthropic":
            from anthropic import Anthropic
            client = Anthropic()
            response = client.messages.create(
                model="claude-3-7-sonnet-20250219",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}]
            )
            return response.content[0].text
        else:
            raise ValueError(f"Unknown model provider: {model_provider}")
    except Exception as e:
        logger.warning(f"{model_provider} call failed or missing API key: {e}")
        return f"Mocked {model_provider} response for: {prompt}"

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

@DBOS.transaction()
def update_status(run_id: str, agent_id: str, step: str, status: str):
    DBOS.sql_session.execute(
        "INSERT INTO agent_runs (run_id, agent_id, step, status) VALUES (%s, %s, %s, %s)",
        [run_id, agent_id, step, status]
    )
    logger.info(f"[{agent_id}] Run {run_id} - Step: {step}, Status: {status}")

class BaseAgent(ABC):
    def __init__(self, agent_id: str, tenant_id: str = "default", model_provider: str = "gemini"):
        self.agent_id = agent_id
        self.tenant_id = tenant_id
        self.model_provider = model_provider

    def write_event(self, event_type: str, payload: dict):
        stream_name = f"agent_bus:{self.tenant_id}"
        event_data = {
            "agent_id": self.agent_id,
            "event_type": event_type,
            "payload": json.dumps(payload)
        }
        try:
            redis_client.xadd(stream_name, event_data)
        except Exception as e:
            logger.error(f"Failed to write to Redis: {e}")

    @DBOS.step(retries=3)
    def plan(self, context: str) -> Plan:
        logger.info(f"[{self.agent_id}] Planning...")
        response = call_llm(f"Create a plan for {self.agent_id} given: {context}", model_provider=self.model_provider)
        plan_obj = Plan(steps=[f"Step 1 for {self.agent_id} based on: {response[:50]}..."])
        self.write_event("plan_created", plan_obj.model_dump())
        return plan_obj

    @DBOS.step(retries=3)
    def execute(self, plan: Plan) -> Result:
        logger.info(f"[{self.agent_id}] Executing...")
        # No-op tool stub
        result = Result(data={"status": "success", "executed_steps": plan.steps})
        self.write_event("execution_completed", result.model_dump())
        return result

    @DBOS.step(retries=3)
    def review(self, result: Result) -> Verdict:
        logger.info(f"[{self.agent_id}] Reviewing...")
        verdict = Verdict(passed=True, feedback="Looks good.")
        self.write_event("review_completed", verdict.model_dump())
        return verdict

    @DBOS.workflow()
    def run(self, context: str) -> Verdict:
        run_id = DBOS.workflow_id
        
        update_status(run_id, self.agent_id, "plan", "running")
        plan = self.plan(context)
        update_status(run_id, self.agent_id, "plan", "completed")

        update_status(run_id, self.agent_id, "execute", "running")
        execution = self.execute(plan)
        update_status(run_id, self.agent_id, "execute", "completed")

        update_status(run_id, self.agent_id, "review", "running")
        verdict = self.review(execution)
        update_status(run_id, self.agent_id, "review", "completed")

        return verdict

class ResearchAgent(BaseAgent):
    def __init__(self, tenant_id: str = "default", model_provider: str = "gemini"):
        super().__init__("ResearchAgent", tenant_id, model_provider)

class MLAgent(BaseAgent):
    def __init__(self, tenant_id: str = "default", model_provider: str = "gemini"):
        super().__init__("MLAgent", tenant_id, model_provider)

class MarketingAgent(BaseAgent):
    def __init__(self, tenant_id: str = "default", model_provider: str = "gemini"):
        super().__init__("MarketingAgent", tenant_id, model_provider)

class CommitGuardAgent(BaseAgent):
    def __init__(self, tenant_id: str = "default", model_provider: str = "gemini"):
        super().__init__("CommitGuardAgent", tenant_id, model_provider)

    @DBOS.step(retries=3)
    def execute(self, plan: Plan) -> Result:
        logger.info(f"[{self.agent_id}] Generating and executing code in E2B...")
        
        prompt = f"Write ONLY executable Python code to accomplish the following plan: {plan.steps}. Do not include markdown formatting or explanations. If you need libraries, assume they are available or use built-ins."
        code = call_llm(prompt, model_provider=self.model_provider)
        
        if code.startswith("```"):
            code = "\n".join(code.split("\n")[1:-1])
            
        self.write_event("code_generated", {"code": code})
        
        try:
            from e2b_code_interpreter import CodeInterpreter
            with CodeInterpreter() as sandbox:
                execution = sandbox.notebook.exec_cell(code)
                
                output = ""
                if execution.text:
                    output += execution.text + "\n"
                if execution.error:
                    output += f"Error: {execution.error.name} - {execution.error.value}\n"
                for result in execution.results:
                    if result.text:
                        output += result.text + "\n"
                
                result_obj = Result(data={"code": code, "output": output.strip()})
        except Exception as e:
            logger.error(f"E2B Execution failed: {e}")
            result_obj = Result(data={"code": code, "output": f"Execution failed: {str(e)}"})
            
        self.write_event("execution_completed", result_obj.model_dump())
        return result_obj

@DBOS.workflow()
def agent_loop(context: str) -> str:
    researcher = ResearchAgent(model_provider="anthropic")
    coder = CommitGuardAgent(model_provider="openai")
    
    r_verdict = researcher.run(context)
    if r_verdict.passed:
        c_verdict = coder.run(context + " - Apply findings")
        return f"Success. Researcher: {r_verdict.feedback}, Coder: {c_verdict.feedback}"
    return f"Failed at research: {r_verdict.feedback}"

if __name__ == "__main__":
    DBOS.launch()
    init_db()
    logger.info("Agent Mesh initialized with DBOS and Redis Streams. Agents ready.")
