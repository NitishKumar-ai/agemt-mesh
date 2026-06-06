import os
import json
import asyncio
import pathlib
import secrets
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from dbos import DBOS
from main import (agent_loop, generate, MODEL_PLAN, scan_suggested_tasks, self_heal_pr,
                  commitguard_workflow, _update_scan_step)
from events import bus
from github_integration import (
    GitHubConfigurationError,
    authorization_url,
    create_oauth_state,
    exchange_code,
    get_authenticated_user,
    github_config_status,
    list_repositories,
    revoke_token,
)
from store import (
    github_save_connection,
    github_get_connection,
    github_get_access_token,
    github_delete_connection,
    github_imported_count,
    github_get_imported_repos,
    github_upsert_repo,
    security_list_findings,
    security_create_finding,
    security_verify_finding,
    marketing_list_campaigns,
    marketing_get_campaign,
    marketing_create_campaign,
    marketing_update_draft,
    marketing_approve_campaign,
    marketing_list_audit_events,
    commitguard_create_scan,
    commitguard_get_scan,
    commitguard_get_scan_with_findings,
    tasks_list,
    tasks_get,
    tasks_mark_running,
    schedule_create,
    schedule_list,
    schedule_disable,
    webhook_create,
)

app = FastAPI(title="Agent Mesh OS")

ROOT_DIR = pathlib.Path(__file__).parent
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"

if FRONTEND_ASSETS.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_ASSETS)), name="frontend-assets")

# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    from main import init_db
    init_db()
    DBOS.launch()

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def get_dashboard():
    frontend_index = FRONTEND_DIST / "index.html"
    if frontend_index.exists():
        return FileResponse(str(frontend_index))
    html_path = os.path.join(os.path.dirname(__file__), "dashboard.html")
    if os.path.exists(html_path):
        with open(html_path, "r") as f:
            return f.read()
    return "dashboard.html not found"

# ── Core agent loop ───────────────────────────────────────────────────────────

@app.post("/api/run")
async def run_workflow(payload: dict):
    context = payload.get("context", "Audit target environment")
    handle = DBOS.start_workflow(agent_loop, context)
    return {"status": "started", "workflow_id": handle.workflow_id}

@app.post("/api/approve/{workflow_id}")
async def approve_workflow(workflow_id: str, payload: dict):
    DBOS.send(workflow_id, payload, "approval")
    return {"status": "event_sent"}

# ── GitHub OAuth and repositories ─────────────────────────────────────────────

@app.get("/api/github/status")
async def github_status():
    connection = github_get_connection()
    imported_count = github_imported_count()
    config = github_config_status()
    if not connection:
        return {**config, "connected": False, "account": None, "imported_count": imported_count}
    return {
        **config,
        "connected": True,
        "account": {
            "id": connection["github_user_id"],
            "login": connection["login"],
            "name": connection["name"],
            "avatar_url": connection["avatar_url"],
            "html_url": connection["html_url"],
            "scopes": connection["scopes"],
            "connected_at": connection["connected_at"],
        },
        "imported_count": imported_count,
    }


@app.get("/api/github/connect")
async def github_connect(request: Request):
    try:
        state = create_oauth_state()
        response = RedirectResponse(authorization_url(state))
    except GitHubConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    response.set_cookie(
        "github_oauth_state",
        state,
        max_age=600,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
    )
    return response


@app.get("/api/github/callback")
async def github_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    frontend_url = os.environ.get("GITHUB_FRONTEND_URL", "http://127.0.0.1:5173")
    expected_state = request.cookies.get("github_oauth_state", "")
    if error:
        return RedirectResponse(f"{frontend_url}/?github=error&reason={error}")
    if not code or not state or not expected_state or not secrets.compare_digest(state, expected_state):
        raise HTTPException(status_code=400, detail="Invalid GitHub OAuth state")

    try:
        token_payload = await exchange_code(code)
        token = token_payload["access_token"]
        user = await get_authenticated_user(token)
        github_save_connection(user, token, token_payload.get("scope", ""))
    except GitHubConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"GitHub OAuth failed: {exc}") from exc

    response = RedirectResponse(f"{frontend_url}/?github=connected")
    response.delete_cookie("github_oauth_state")
    return response


@app.delete("/api/github/connection")
async def github_disconnect():
    try:
        connection = github_get_connection()
        if connection:
            token = github_get_access_token()
            await revoke_token(token)
            github_delete_connection()
    except GitHubConfigurationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not revoke GitHub connection: {exc}") from exc
    return {"status": "disconnected"}


@app.get("/api/github/repositories")
async def github_repositories():
    try:
        token = github_get_access_token()
        return {"repositories": await list_repositories(token)}
    except GitHubConfigurationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not load GitHub repositories: {exc}") from exc


@app.get("/api/github/imported-repositories")
async def github_imported_repositories():
    return {"repositories": github_get_imported_repos()}


@app.post("/api/github/imported-repositories")
async def github_import_repository(payload: dict):
    repo_id = payload.get("repository_id")
    if not isinstance(repo_id, int):
        raise HTTPException(status_code=400, detail="repository_id must be an integer")
    try:
        token = github_get_access_token()
        repository = next((r for r in await list_repositories(token) if r["id"] == repo_id), None)
    except GitHubConfigurationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not verify GitHub repository: {exc}") from exc
    if not repository:
        raise HTTPException(status_code=404, detail="Repository not found for connected GitHub account")
    github_upsert_repo(repository)
    return {"status": "imported", "repository": repository}

# ── Marketing arm ─────────────────────────────────────────────────────────────

@app.get("/api/security/findings")
async def list_security_findings():
    return {"findings": security_list_findings()}


@app.post("/api/security/findings")
async def create_security_finding(payload: dict):
    title = str(payload.get("title", "")).strip()
    summary = str(payload.get("summary", "")).strip()
    evidence = str(payload.get("evidence", "")).strip()
    severity = str(payload.get("severity", "medium")).strip().lower()
    source_agent = str(payload.get("source_agent", "CommitGuardAgent")).strip()
    repository = str(payload.get("repository", "")).strip()
    if not title or not summary or not evidence:
        raise HTTPException(status_code=400, detail="title, summary, and evidence are required")
    if severity not in {"low", "medium", "high", "critical"}:
        raise HTTPException(status_code=400, detail="severity must be low, medium, high, or critical")
    finding_id = security_create_finding(source_agent, title, summary, evidence, severity, repository)
    return {"status": "review_required", "finding_id": finding_id}


@app.post("/api/security/findings/{finding_id}/verify")
async def verify_security_finding(finding_id: int, payload: dict):
    verified_by = str(payload.get("verified_by", "operator")).strip() or "operator"
    if not security_verify_finding(finding_id, verified_by):
        raise HTTPException(status_code=404, detail="Finding not found")
    return {"status": "verified"}


@app.get("/api/marketing/campaigns")
async def list_marketing_campaigns():
    return {"campaigns": marketing_list_campaigns()}


@app.post("/api/marketing/campaigns")
async def create_marketing_campaign(payload: dict):
    name = str(payload.get("name", "")).strip()
    audience = str(payload.get("audience", "")).strip()
    finding_summary = str(payload.get("finding_summary", "")).strip()
    value_proposition = str(payload.get("value_proposition", "")).strip()
    channel = str(payload.get("channel", "email")).strip()
    source_finding_id = payload.get("source_finding_id")
    if not name or not audience or not finding_summary:
        raise HTTPException(status_code=400, detail="name, audience, and finding_summary are required")
    if not isinstance(source_finding_id, int):
        raise HTTPException(status_code=400, detail="source_finding_id from a verified finding is required")
    if channel not in {"email", "linkedin", "report"}:
        raise HTTPException(status_code=400, detail="channel must be email, linkedin, or report")
    try:
        campaign_id, _ = marketing_create_campaign(
            source_finding_id, name, audience, finding_summary, value_proposition, channel
        )
    except ValueError as exc:
        msg = str(exc)
        if msg == "source_finding_not_found":
            raise HTTPException(status_code=404, detail="Source finding not found") from exc
        if msg == "source_finding_not_verified":
            raise HTTPException(status_code=409, detail="Source finding must be verified before campaign creation") from exc
        raise
    return {"status": "created", "campaign_id": campaign_id}


@app.post("/api/marketing/campaigns/{campaign_id}/generate")
async def generate_campaign_draft(campaign_id: int):
    """
    Start the full Research → Write pipeline via marketing_pipeline workflow.
    The draft lands in the DB asynchronously; the SSE stream emits progress.
    The endpoint returns immediately with the workflow_id for tracking.
    """
    from agents.marketing.scheduler import marketing_pipeline
    campaign = marketing_get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Fetch the source finding's evidence for the researcher
    from store import security_list_findings
    findings = security_list_findings()
    evidence = ""
    for f in findings:
        if f["id"] == campaign.get("source_finding_id"):
            evidence = f.get("evidence", "")
            break

    handle = DBOS.start_workflow(marketing_pipeline, campaign_id, evidence)
    return {"status": "pipeline_started", "workflow_id": handle.workflow_id}


@app.post("/api/marketing/campaigns/{campaign_id}/approve")
async def approve_marketing_campaign(campaign_id: int, payload: dict):
    note = str(payload.get("note", "")).strip()
    result = marketing_approve_campaign(campaign_id, note)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="Campaign not found")
    if result == "no_draft":
        raise HTTPException(status_code=409, detail="Generate a draft before approval")
    return {"status": "approved"}


@app.post("/api/marketing/campaigns/{campaign_id}/schedule")
async def schedule_marketing_campaign(campaign_id: int):
    """
    Schedule an approved campaign via the SchedulerAgent (Typefully).
    Enforces rate limits and consent checks before scheduling.
    """
    from agents.marketing.scheduler import run_scheduler
    campaign = marketing_get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign["status"] != "approved":
        raise HTTPException(status_code=409, detail="Campaign must be approved before scheduling")
    result = run_scheduler(f"manual-{campaign_id}", campaign_id)
    if not result.get("ok"):
        raise HTTPException(status_code=429, detail=result.get("reason", "Scheduling blocked"))
    return {"status": "scheduled", "method": result.get("method"), "typefully_id": result.get("typefully_id")}


@app.get("/api/marketing/audit-events")
async def list_marketing_audit_events():
    events = marketing_list_audit_events()
    for e in events:
        if isinstance(e.get("payload"), str):
            e["payload"] = json.loads(e["payload"] or "{}")
    return {"events": events}

# ── Jules: Suggested Tasks ────────────────────────────────────────────────────

@app.post("/api/tasks/scan")
async def trigger_scan():
    repo_root = str(pathlib.Path(__file__).parent)
    handle = DBOS.start_workflow(scan_suggested_tasks, repo_root)
    return {"status": "started", "workflow_id": handle.workflow_id}


@app.get("/api/tasks")
async def list_tasks():
    return {"tasks": tasks_list()}


@app.post("/api/tasks/{task_id}/run")
async def run_suggested_task(task_id: int):
    row = tasks_get(task_id)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    context = f"Fix TODO at {row['file_path']}:{row['line_number']}: {row['comment']}"
    handle = DBOS.start_workflow(agent_loop, context)
    tasks_mark_running(task_id)
    return {"status": "started", "workflow_id": handle.workflow_id}


# ── Jules: Scheduled Tasks ────────────────────────────────────────────────────

_VALID_INTERVALS = {"hourly", "daily", "weekly", "monthly"}


@app.post("/api/schedule")
async def create_schedule(payload: dict):
    name     = payload.get("name", "").strip()
    prompt   = payload.get("prompt", "").strip()
    interval = payload.get("interval", "daily")
    if not name or not prompt:
        raise HTTPException(status_code=400, detail="name and prompt are required")
    if interval not in _VALID_INTERVALS:
        raise HTTPException(status_code=400, detail="interval must be hourly/daily/weekly/monthly")
    task_id = schedule_create(name, prompt, interval)
    return {"status": "created", "task_id": task_id}


@app.get("/api/schedule")
async def list_schedules():
    return {"schedules": schedule_list()}


@app.delete("/api/schedule/{task_id}")
async def delete_schedule(task_id: int):
    schedule_disable(task_id)
    return {"status": "disabled"}


# ── Jules: Self-Healing PRs ───────────────────────────────────────────────────

@app.post("/webhook/render")
async def render_webhook(request: Request):
    body        = await request.json()
    event_type  = body.get("type", "unknown")
    branch      = body.get("branch", "")
    build_logs  = body.get("logs", "")
    pr_diff     = body.get("diff", "")

    webhook_id = webhook_create("render", event_type, branch, body)

    if event_type == "build.failed" and branch:
        handle = DBOS.start_workflow(self_heal_pr, webhook_id, branch, build_logs, pr_diff)
        return {"status": "healing", "workflow_id": handle.workflow_id}
    elif event_type == "build.success":
        return {"status": "acknowledged"}
    return {"status": "ignored", "type": event_type}


# ── SSE stream ────────────────────────────────────────────────────────────────

@app.get("/stream")
async def event_stream(request: Request):
    async def event_generator():
        queue = bus.get_queue()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield {"event": "message", "data": payload}
                except asyncio.TimeoutError:
                    continue
        finally:
            bus.remove_queue(queue)
    return EventSourceResponse(event_generator())


# ── CommitGuard Arm ───────────────────────────────────────────────────────────

_CG_RUNNING: set[str] = set()  # Phase 1: enforce one scan at a time


@app.post("/api/commitguard/scan")
async def commitguard_scan(payload: dict):
    repo_url = str(payload.get("repo_url", "")).strip()
    max_findings = int(payload.get("max_findings", 5))

    if not repo_url.startswith("https://github.com/"):
        raise HTTPException(status_code=400, detail="repo_url must start with https://github.com/")
    if max_findings < 1 or max_findings > 20:
        raise HTTPException(status_code=400, detail="max_findings must be between 1 and 20")

    if _CG_RUNNING:
        raise HTTPException(status_code=429, detail="A scan is already running. Try again when it completes.")

    connection = github_get_connection()
    if not connection:
        raise HTTPException(status_code=401, detail="Connect GitHub first (GET /api/github/connect)")
    token = github_get_access_token()

    import uuid
    job_id = str(uuid.uuid4())
    github_login = connection["login"]

    commitguard_create_scan(job_id, repo_url, github_login)

    _CG_RUNNING.add(job_id)
    handle = DBOS.start_workflow(commitguard_workflow, job_id, repo_url, max_findings, token)

    return {"job_id": job_id, "status": "queued",
            "eta": "2-10 min depending on finding count",
            "workflow_id": handle.workflow_id}


@app.get("/api/commitguard/status/{job_id}")
async def commitguard_status(job_id: str):
    row = commitguard_get_scan(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Scan not found")
    row["findings_truncated"] = bool(row["findings_truncated"])
    if row["status"] == "complete":
        _CG_RUNNING.discard(job_id)
    return row


@app.get("/api/commitguard/stream/{job_id}")
async def commitguard_stream(job_id: str, request: Request):
    if not commitguard_get_scan(job_id):
        raise HTTPException(status_code=404, detail="Scan not found")

    async def generator():
        queue = bus.get_queue()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    raw = await asyncio.wait_for(queue.get(), timeout=1.0)
                    # Server-side filter: only yield events for this job_id
                    try:
                        data = json.loads(raw)
                        if data.get("payload", {}).get("job_id") == job_id:
                            yield {"event": "message", "data": raw}
                    except (json.JSONDecodeError, AttributeError):
                        pass
                except asyncio.TimeoutError:
                    continue
        finally:
            bus.remove_queue(queue)
    return EventSourceResponse(generator())


@app.get("/api/commitguard/findings/{job_id}")
async def commitguard_findings(job_id: str):
    data = commitguard_get_scan_with_findings(job_id)
    if not data:
        raise HTTPException(status_code=404, detail="Scan not found")
    data["findings_truncated"] = bool(data["findings_truncated"])
    for f in data["findings"]:
        f["issue_filed"] = bool(f["issue_filed"])
    return data


# ── Sessions ──────────────────────────────────────────────────────────────────

@app.get("/api/sessions")
async def list_sessions():
    """Return recent agent runs grouped by run_id, newest first."""
    from sqlalchemy import text as sql
    rows = DBOS.sql_session.execute(sql("""
        SELECT
            run_id,
            MIN(agent_id)    AS agent_id,
            MIN(created_at)  AS started_at,
            MAX(created_at)  AS updated_at,
            MAX(step)        AS last_step,
            MAX(status)      AS status,
            COUNT(*)         AS step_count
        FROM agent_runs
        GROUP BY run_id
        ORDER BY MAX(created_at) DESC
        LIMIT 100
    """)).mappings().all()
    return {"sessions": [dict(r) for r in rows]}


@app.get("/api/sessions/{run_id}")
async def get_session(run_id: str):
    """Return all steps for a single run_id."""
    from sqlalchemy import text as sql
    rows = DBOS.sql_session.execute(sql("""
        SELECT id, run_id, agent_id, step, status, created_at
        FROM agent_runs
        WHERE run_id = :run_id
        ORDER BY created_at ASC
    """), {"run_id": run_id}).mappings().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"steps": [dict(r) for r in rows]}


# ── Workflows ─────────────────────────────────────────────────────────────────

@app.get("/api/workflows")
async def list_workflows():
    """Return agent_runs + DLQ events for the Workflows page."""
    from sqlalchemy import text as sql
    runs = DBOS.sql_session.execute(sql("""
        SELECT
            run_id,
            MIN(agent_id)   AS agent_id,
            MIN(created_at) AS started_at,
            MAX(created_at) AS updated_at,
            MAX(step)       AS last_step,
            MAX(status)     AS status,
            COUNT(*)        AS step_count
        FROM agent_runs
        GROUP BY run_id
        ORDER BY MAX(created_at) DESC
        LIMIT 100
    """)).mappings().all()
    dlq = DBOS.sql_session.execute(sql("""
        SELECT id, run_id, agent_id, error, created_at
        FROM dlq_events
        ORDER BY created_at DESC
        LIMIT 50
    """)).mappings().all()
    return {"workflows": [dict(r) for r in runs], "dlq": [dict(r) for r in dlq]}


@app.post("/api/workflows/{run_id}/retry")
async def retry_workflow(run_id: str):
    """Re-queue a failed run by re-submitting it as a new agent_loop workflow."""
    from sqlalchemy import text as sql
    row = DBOS.sql_session.execute(sql(
        "SELECT MAX(step) AS last_step FROM agent_runs WHERE run_id = :rid"
    ), {"rid": run_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")
    context = f"Retry of workflow {run_id} — last step: {row['last_step']}"
    handle = DBOS.start_workflow(agent_loop, context)
    return {"status": "retried", "new_workflow_id": handle.workflow_id}


# ── Approvals ─────────────────────────────────────────────────────────────────

@app.get("/api/approvals")
async def list_approvals():
    """Return agent_events with event_type approval_required, newest first."""
    from sqlalchemy import text as sql
    rows = DBOS.sql_session.execute(sql("""
        SELECT id, tenant_id AS run_id, payload, created_at
        FROM agent_events
        WHERE payload::text LIKE '%approval_required%'
        ORDER BY created_at DESC
        LIMIT 100
    """)).mappings().all()
    parsed = []
    for r in rows:
        try:
            payload = json.loads(r["payload"]) if isinstance(r["payload"], str) else r["payload"]
        except (json.JSONDecodeError, TypeError):
            payload = {}
        parsed.append({
            "id": r["id"],
            "run_id": r["run_id"],
            "payload": payload,
            "created_at": r["created_at"],
        })
    return {"approvals": parsed}


# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/settings")
async def get_settings():
    """Return current runtime settings (env-sourced, read-only at runtime)."""
    import main as _main
    return {
        "model_plan": _main.MODEL_PLAN,
        "model_execute": _main.MODEL_EXECUTE,
        "e2b_configured": bool(os.environ.get("E2B_API_KEY")),
        "github_configured": bool(os.environ.get("GITHUB_CLIENT_ID")),
        "traceloop_configured": bool(os.environ.get("TRACELOOP_API_KEY")),
        "langfuse_configured": bool(os.environ.get("LANGFUSE_PUBLIC_KEY")),
        "commitguard_webhook": os.environ.get("COMMITGUARD_WEBHOOK_URL", ""),
    }
