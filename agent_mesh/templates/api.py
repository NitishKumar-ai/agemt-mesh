import os
import json
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from sse_starlette.sse import EventSourceResponse
from dbos import DBOS
import redis.asyncio as redis
from main import agent_loop, init_db

app = FastAPI(title="Agent Mesh OS")

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(redis_url, decode_responses=True)

@app.on_event("startup")
def on_startup():
    DBOS.launch()
    init_db()

@app.get("/", response_class=HTMLResponse)
async def get_dashboard():
    html_path = os.path.join(os.path.dirname(__file__), "dashboard.html")
    if os.path.exists(html_path):
        with open(html_path, "r") as f:
            return f.read()
    return "Dashboard template not found. Ensure dashboard.html is in the same directory as api.py."

@app.post("/api/run")
async def run_workflow(payload: dict):
    context = payload.get("context", "Audit target environment")
    # DBOS start_workflow executes a workflow asynchronously and returns a workflow handle
    handle = DBOS.start_workflow(agent_loop, context)
    return {"status": "started", "workflow_id": handle.workflow_id}

@app.get("/stream")
async def event_stream(request: Request):
    """Streams events from the Redis agent_bus to the frontend."""
    async def event_generator():
        last_id = "0-0"
        tenant_id = "default"
        stream_name = f"agent_bus:{tenant_id}"
        
        while True:
            if await request.is_disconnected():
                break
                
            try:
                # Block for up to 1s waiting for new messages
                messages = await redis_client.xread({stream_name: last_id}, count=10, block=1000)
                if messages:
                    for stream, msgs in messages:
                        for msg_id, msg_data in msgs:
                            last_id = msg_id
                            yield {
                                "event": "message",
                                "data": json.dumps(msg_data)
                            }
            except Exception as e:
                print(f"Redis error: {e}")
                await asyncio.sleep(1)
                
    return EventSourceResponse(event_generator())
