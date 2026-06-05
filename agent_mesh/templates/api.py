import os
import json
import asyncio
import asyncpg
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from sse_starlette.sse import EventSourceResponse
from dbos import DBOS
from main import agent_loop, init_db

app = FastAPI(title="Agent Mesh OS")

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
    handle = DBOS.start_workflow(agent_loop, context)
    return {"status": "started", "workflow_id": handle.workflow_id}

@app.get("/stream")
async def event_stream(request: Request):
    """Streams events from Postgres agent_bus using asyncpg LISTEN/NOTIFY."""
    async def event_generator():
        # Connect to Postgres
        # DBOS uses DBOS_DATABASE_URL or default local postgres
        pg_url = os.getenv("DBOS_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
        
        try:
            conn = await asyncpg.connect(pg_url)
        except Exception as e:
            yield {"event": "error", "data": f"Failed to connect to PG: {e}"}
            return

        queue = asyncio.Queue()

        def on_notify(connection, pid, channel, payload):
            queue.put_nowait(payload)
            
        await conn.add_listener('agent_bus', on_notify)
        
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield {
                        "event": "message",
                        "data": payload
                    }
                except asyncio.TimeoutError:
                    continue
        finally:
            await conn.remove_listener('agent_bus', on_notify)
            await conn.close()

    return EventSourceResponse(event_generator())
