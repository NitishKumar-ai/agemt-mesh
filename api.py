import os
from dotenv import load_dotenv
load_dotenv(override=True)
import json
import asyncio
import logging
import pathlib
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, Query, File, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
from dbos import DBOS, DBOSConfig  # noqa: F401
from dbos._error import DBOSNonExistentWorkflowError
from main import (agent_loop, generate, MODEL_PLAN, scan_suggested_tasks, self_heal_pr,
                  commitguard_workflow, _update_scan_step,
                  HermesAgent, MLInternAgent, run_social_studio_autopost_task)
from harness import (
    BaseAgent, AgentConfig, register_agent, list_agents_info,
    run_agent as harness_run_agent,
)
from loop import Tool
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
    connection_save,
    connection_get,
    connection_list,
    connection_delete,
    connection_update_status,
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
    marketing_list_audience_embeddings,
    marketing_save_audience_embedding,
    commitguard_create_scan,
    commitguard_get_scan,
    commitguard_get_scan_with_findings,
    tasks_list,
    tasks_get,
    tasks_mark_running,
    schedule_create,
    schedule_list,
    schedule_get,
    schedule_disable,
    schedule_enable,
    schedule_update,
    webhook_create,
    sessions_list,
    sessions_get,
    workflows_list,
    workflows_get_last_step,
    approvals_list,
    approval_get_history,
    record_approval_decision,
    killswitch_get,
    killswitch_get_full_state,
    killswitch_set,
    safety_list_verdicts,
    safety_list_traces,
    safety_list_escalations,
    safety_resolve_escalation,
    safety_stats,
    ss_list_accounts,
    ss_get_account,
    ss_get_account_token,
    ss_connect_account,
    ss_disconnect_account,
    ss_list_posts,
    ss_get_post,
    ss_create_posts,
    ss_update_post_content,
    ss_mark_post_scheduled,
    ss_list_platform_posts,
    ss_get_platform_post,
    ss_create_platform_posts,
    ss_update_platform_post_caption,
    ss_mark_platform_post_scheduled,
    ss_get_analytics_summary,
    ss_get_account_metrics,
    ss_get_top_posts,
    ss_get_calendar_posts,
    ss_upsert_metric_snapshot,
)

# ── Startup / Shutdown ────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan handler — runs init_db then yields to DBOS lifespan."""
    from main import init_db
    bus.set_loop(asyncio.get_running_loop())
    init_db()          # plain function, no DBOS context needed
    yield


async def on_startup():
    """Legacy shim kept for TestClient compatibility in unit tests."""
    from main import init_db
    bus.set_loop(asyncio.get_running_loop())
    init_db()


app = FastAPI(title="Agent Mesh OS", lifespan=lifespan)

# Initialize DBOS with the SQLite app database so all @transaction functions
# run against the same file as the raw DDL above.
DBOS(
    config=DBOSConfig(
        name="agent-mesh",
        database_url="sqlite:///agent_mesh.sqlite",
    ),
    fastapi=app,
)

ROOT_DIR = pathlib.Path(__file__).parent
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"

if FRONTEND_ASSETS.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_ASSETS)), name="frontend-assets")

DBOS.launch()

# ── Agent Registry ───────────────────────────────────────────────────────────
# Register all known agents so the harness can dispatch by agent_id.

from harness import MODEL_PLAN as _H_MODEL_PLAN, MODEL_EXECUTE as _H_MODEL_EXECUTE


class _CommitGuardAgent(BaseAgent):
    def get_tools(self) -> list:
        return ["scan_repo", "verify_finding", "file_github_issue", "delegate_task"]

    def get_tool_objects(self, run_id: str) -> list:
        from main import cg_scan, cg_verify, cg_file_issue
        import json
        import os
        tools = super().get_tool_objects(run_id) or []

        def scan_tool(args):
            repo_url = args.get("repo_url")
            if not repo_url:
                return "Error: repo_url is required"
            tmpdir = f"/tmp/commitguard-{run_id}"
            # cg_scan is a DBOS step
            findings, truncated = cg_scan(repo_url, tmpdir, 5)
            return json.dumps({"findings": findings, "truncated": truncated})

        def verify_tool(args):
            finding = args.get("finding")
            repo_url = args.get("repo_url")
            if not finding or not repo_url:
                return "Error: finding and repo_url are required"
            # cg_verify is a DBOS step
            result = cg_verify(finding, repo_url)
            return json.dumps(result)

        def file_issue_tool(args):
            finding = args.get("finding")
            repo_url = args.get("repo_url")
            if not finding or not repo_url:
                return "Error: finding and repo_url are required"
            github_token = args.get("github_token") or os.environ.get("GITHUB_TOKEN", "")
            # cg_file_issue is a DBOS step
            result = cg_file_issue(finding, repo_url, github_token)
            return json.dumps(result)

        tools.extend([
            Tool(
                name="scan_repo",
                description="Clone a repository and run static analysis (Semgrep) to find potential vulnerabilities.",
                parameters={"repo_url": "HTTPS URL of the GitHub repository"},
                run=scan_tool,
                risk_level="medium",
            ),
            Tool(
                name="verify_finding",
                description="Verify a security finding by executing a proof-of-concept in a secure E2B sandbox.",
                parameters={"finding": "The finding dictionary to verify", "repo_url": "The repository URL"},
                run=verify_tool,
                risk_level="high",
            ),
            Tool(
                name="file_github_issue",
                description="File a GitHub issue for a confirmed vulnerability.",
                parameters={
                    "finding": "The verified finding dictionary",
                    "repo_url": "The repository URL",
                    "github_token": "Optional GitHub access token"
                },
                run=file_issue_tool,
                risk_level="medium",
            )
        ])
        return tools


class _MarketingAgent(BaseAgent):
    def get_tools(self) -> list:
        return ["research_finding", "generate_content", "schedule_campaign", "delegate_task"]

    def get_tool_objects(self, run_id: str) -> list:
        from agents.marketing.researcher import run_researcher
        from agents.marketing.content_writer import run_content_writer
        from agents.marketing.scheduler import run_scheduler
        import json
        tools = super().get_tool_objects(run_id) or []

        def research_tool(args):
            brief = run_researcher(
                run_id,
                args.get("campaign_id", 0),
                args.get("audience", ""),
                args.get("channel", "email"),
                args.get("finding_summary", ""),
                args.get("evidence", ""),
            )
            return json.dumps(brief)

        def content_tool(args):
            draft = run_content_writer(
                run_id,
                args.get("campaign_id", 0),
                args.get("channel", "email"),
                args.get("campaign_name", ""),
                args.get("value_proposition", ""),
                args.get("finding_summary", ""),
                args.get("research_brief", {}),
            )
            return json.dumps(draft)

        def schedule_tool(args):
            result = run_scheduler(run_id, args.get("campaign_id", 0))
            return json.dumps(result)

        tools.extend([
            Tool(
                name="research_finding",
                description="Research an audience and a security finding to create a research brief.",
                parameters={
                    "campaign_id": "ID of the campaign",
                    "audience": "Target audience",
                    "channel": "Marketing channel",
                    "finding_summary": "Summary of the finding",
                    "evidence": "Evidence text"
                },
                run=research_tool,
                risk_level="low",
            ),
            Tool(
                name="generate_content",
                description="Generate marketing content (draft) based on a research brief.",
                parameters={
                    "campaign_id": "ID of the campaign",
                    "channel": "Marketing channel",
                    "campaign_name": "Name of the campaign",
                    "value_proposition": "Value proposition",
                    "finding_summary": "Summary of the finding",
                    "research_brief": "The research brief dictionary"
                },
                run=content_tool,
                risk_level="low",
            ),
            Tool(
                name="schedule_campaign",
                description="Schedule an approved campaign for delivery (e.g., via Typefully).",
                parameters={"campaign_id": "ID of the campaign"},
                run=schedule_tool,
                risk_level="medium",
            )
        ])
        return tools


class _SchedulerAgent(BaseAgent):
    def get_tools(self) -> list:
        return ["cron_execution", "self_healing", "delegate_task"]


class _SelfHealAgent(BaseAgent):
    def get_tools(self) -> list:
        return ["build_diagnosis", "patch_generation", "pr_creation", "delegate_task"]


class _ResearchAgent(BaseAgent):
    def get_tools(self) -> list:
        return ["web_search", "rag", "delegate_task"]

    def get_tool_objects(self, run_id: str) -> list:
        tools = super().get_tool_objects(run_id) or []
        tools.extend([
            Tool(
                name="web_search",
                description="Search the web for up-to-date information on a topic.",
                parameters={"query": "Search query"},
                run=lambda args: f"Results for '{args.get('query')}': [Mock web search results including NIST and CVE data for security findings]",
                risk_level="low",
            ),
            Tool(
                name="rag",
                description="Query the internal knowledge base for past security findings and documentation.",
                parameters={"query": "RAG query"},
                run=lambda args: f"RAG results for '{args.get('query')}': [Mock RAG results containing relevant internal audit history]",
                risk_level="low",
            )
        ])
        return tools


register_agent("commitguard", _CommitGuardAgent,
    name="CommitGuard",
    description="Security scanner — reviews git diffs for vulnerabilities in E2B sandboxes.",
    capabilities=["git_diff_review", "secret_scanning", "static_analysis", "github_issues"],
    default_config=AgentConfig(
        agent_id="commitguard", model_plan=_H_MODEL_PLAN,
        model_execute=_H_MODEL_PLAN, sandbox="e2b",
        requires_approval=True, cost_budget_usd=2.0,
    ))

register_agent("marketing", _MarketingAgent,
    name="Marketing Agent",
    description="Researches findings and generates outreach content via the Research → Write pipeline.",
    capabilities=["research", "content_generation", "typefully_scheduling"],
    default_config=AgentConfig(
        agent_id="marketing", model_plan=_H_MODEL_PLAN,
        model_execute=_H_MODEL_EXECUTE, requires_approval=True,
        cost_budget_usd=1.0,
    ))

register_agent("scheduler", _SchedulerAgent,
    name="Scheduler Agent",
    description="Runs recurring natural-language tasks on configurable intervals.",
    capabilities=["cron_execution", "self_healing"],
    default_config=AgentConfig(
        agent_id="scheduler", model_plan=_H_MODEL_PLAN,
        model_execute=_H_MODEL_PLAN, cost_budget_usd=0.5,
    ))

register_agent("selfheal", _SelfHealAgent,
    name="Self-Heal Agent",
    description="Diagnoses failed builds from webhook events and generates fix PRs.",
    capabilities=["build_diagnosis", "patch_generation", "pr_creation"],
    default_config=AgentConfig(
        agent_id="selfheal", model_plan=_H_MODEL_PLAN,
        model_execute=_H_MODEL_EXECUTE, cost_budget_usd=1.5,
    ))

register_agent("research", _ResearchAgent,
    name="Research Agent",
    description="Web search and RAG-powered research for information gathering.",
    capabilities=["web_search", "rag"],
    default_config=AgentConfig(
        agent_id="research", model_plan=_H_MODEL_PLAN,
        model_execute=_H_MODEL_EXECUTE, cost_budget_usd=0.5,
    ))

register_agent("hermes", HermesAgent,
    name="Hermes (Brain)",
    description="Main orchestration agent — high-level planning, delegation, and skill management.",
    capabilities=["delegate_task", "save_new_skill", "list_known_skills"],
    default_config=AgentConfig(
        agent_id="hermes", model_plan=_H_MODEL_PLAN,
        model_execute=_H_MODEL_EXECUTE, cost_budget_usd=2.0,
    ))

register_agent("ml_intern", MLInternAgent,
    name="ML Intern (Research+)",
    description="Advanced research agent with code-native tool use for data analysis.",
    capabilities=["web_search", "rag", "python"],
    default_config=AgentConfig(
        agent_id="ml_intern", model_plan=_H_MODEL_PLAN,
        model_execute=_H_MODEL_EXECUTE, cost_budget_usd=1.5,
    ))


# ── Dashboard ─────────────────────────────────────────────────────────────────

from agent_mesh.connectors import registry
import uuid

# ── Unified Connections ──────────────────────────────────────────────────────

@app.get("/api/connections/available")
async def list_available_connectors():
    """List all available connector types that can be configured."""
    return {"connectors": [c.model_dump() for c in registry.list_available()]}

@app.get("/api/connections")
async def list_connections():
    """List all configured connections."""
    return {"connections": connection_list()}

@app.post("/api/connections")
async def create_connection(payload: dict):
    """
    Create a new connection.
    Body: {"provider_id": "hostinger", "config": {...}, "metadata": {...}}
    """
    provider_id = payload.get("provider_id")
    config = payload.get("config", {})
    metadata = payload.get("metadata", {})

    if not provider_id:
        raise HTTPException(400, "provider_id is required")
    
    conn_class = registry.get_connector_class(provider_id)
    if not conn_class:
        raise HTTPException(400, f"Unknown provider: {provider_id}")

    # Test the connection. connector.test() is sync and may itself call
    # asyncio.run() (MCP stdio), so run it off the event loop in a thread —
    # calling it directly here raises "asyncio.run() cannot be called from a
    # running event loop".
    connector = conn_class(config)
    if not await asyncio.to_thread(connector.test):
        raise HTTPException(400, "Connection test failed")

    conn_id = str(uuid.uuid4())
    conn_config = registry.get_config(provider_id)
    
    connection_save(
        id=conn_id,
        provider_id=provider_id,
        connector_type=conn_config.connector_type,
        config=config,
        metadata=metadata
    )

    return {"status": "connected", "id": conn_id}

@app.delete("/api/connections/{connection_id}")
async def delete_connection(connection_id: str):
    """Delete a connection."""
    connection_delete(connection_id)
    return {"status": "deleted"}

@app.post("/api/connections/{connection_id}/test")
async def test_connection(connection_id: str):
    """Test an existing connection."""
    conn_data = connection_get(connection_id)
    if not conn_data:
        raise HTTPException(404, "Connection not found")
    
    conn_class = registry.get_connector_class(conn_data["provider_id"])
    if not conn_class:
        raise HTTPException(500, "Connector implementation missing")
    
    connector = conn_class(conn_data["config"])
    if await asyncio.to_thread(connector.test):
        connection_update_status(connection_id, "connected")
        return {"status": "ok"}
    else:
        connection_update_status(connection_id, "error")
        return {"status": "error"}

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
    if killswitch_get():
        raise HTTPException(status_code=503, detail="Killswitch engaged — agent dispatch is halted")
    context = payload.get("context", "Audit target environment")
    goal = payload.get("goal", "Audit target environment for vulnerabilities")
    handle = DBOS.start_workflow(
        harness_run_agent, "commitguard", goal, context
    )
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
        
        # Also save to the unified connections table so it appears in the Connectors UI
        from store import connection_save
        connection_save(
            id="github-oauth",
            provider_id="github",
            connector_type="oauth",
            config={"token": token},
            metadata={"name": user.get("login"), "avatar_url": user.get("avatar_url")}
        )
        
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


# ── Social Media Connections ─────────────────────────────────────────────────

from store import (
    social_save_connection,
    social_get_connection,
    social_list_connections,
    social_delete_connection,
    social_get_api_key,
)

SUPPORTED_PLATFORMS = {
    "typefully": {
        "name": "Typefully",
        "description": "Schedule and publish to Twitter/X and LinkedIn via Typefully's API.",
        "auth_type": "api_key",
        "docs_url": "https://typefully.com/settings/api",
        "icon": "pen-tool",
        "scopes": "drafts,schedule,analytics",
    },
    "twitter": {
        "name": "Twitter / X",
        "description": "Direct Twitter API access for posting and analytics.",
        "auth_type": "api_key",
        "docs_url": "https://developer.twitter.com/en/portal/dashboard",
        "icon": "twitter",
        "scopes": "tweet.read,tweet.write,users.read",
    },
    "linkedin": {
        "name": "LinkedIn",
        "description": "Publish posts and articles to your LinkedIn profile or company page.",
        "auth_type": "api_key",
        "docs_url": "https://www.linkedin.com/developers/apps",
        "icon": "linkedin",
        "scopes": "w_member_social,r_liteprofile",
    },
    "buffer": {
        "name": "Buffer",
        "description": "Multi-platform social scheduling via Buffer's publishing API.",
        "auth_type": "api_key",
        "docs_url": "https://buffer.com/developers/api",
        "icon": "layers",
        "scopes": "publish",
    },
}


@app.get("/api/social/platforms")
async def list_social_platforms():
    """Return all supported social platforms with their connection status."""
    connections = {c["platform"]: c for c in social_list_connections()}
    platforms = []
    for pid, meta in SUPPORTED_PLATFORMS.items():
        conn = connections.get(pid)
        platforms.append({
            "id": pid,
            **meta,
            "connected": conn is not None and conn.get("status") == "active",
            "username": conn.get("username") if conn else None,
            "connected_at": conn.get("connected_at") if conn else None,
        })
    return {"platforms": platforms}


@app.post("/api/social/connect")
async def connect_social(payload: dict):
    """
    Connect a social media platform via API key.

    Body: {"platform": "typefully", "api_key": "...", "username": "optional"}
    """
    platform = payload.get("platform", "").strip()
    api_key = payload.get("api_key", "").strip()
    username = payload.get("username", "").strip() or None

    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(400, f"Unsupported platform: {platform}. Supported: {list(SUPPORTED_PLATFORMS.keys())}")
    if not api_key:
        raise HTTPException(400, "api_key is required")

    meta = SUPPORTED_PLATFORMS[platform]

    # Validate the key by making a test request
    validation = await _validate_social_key(platform, api_key)
    if not validation["valid"]:
        raise HTTPException(400, f"API key validation failed: {validation['error']}")

    from github_integration import encrypt_token
    encrypted = encrypt_token(api_key)

    social_save_connection(
        platform=platform,
        display_name=meta["name"],
        api_key_encrypted=encrypted,
        username=validation.get("username") or username,
        avatar_url=validation.get("avatar_url"),
        scopes=meta["scopes"],
    )

    return {
        "status": "connected",
        "platform": platform,
        "username": validation.get("username") or username,
    }


@app.delete("/api/social/{platform}")
async def disconnect_social(platform: str):
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(400, f"Unsupported platform: {platform}")
    conn = social_get_connection(platform)
    if not conn:
        raise HTTPException(404, f"{platform} is not connected")
    social_delete_connection(platform)
    return {"status": "disconnected", "platform": platform}


@app.get("/api/social/{platform}/status")
async def social_platform_status(platform: str):
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(400, f"Unsupported platform: {platform}")
    conn = social_get_connection(platform)
    meta = SUPPORTED_PLATFORMS[platform]
    if not conn:
        return {"platform": platform, "connected": False, **meta}
    return {
        "platform": platform,
        "connected": conn.get("status") == "active",
        "username": conn.get("username"),
        "avatar_url": conn.get("avatar_url"),
        "connected_at": conn.get("connected_at"),
        **meta,
    }


async def _validate_social_key(platform: str, api_key: str) -> dict:
    """Test an API key against the platform's validation endpoint."""
    import httpx
    try:
        if platform == "typefully":
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.typefully.com/v1/drafts/recently-published",
                    headers={"X-API-KEY": f"Bearer {api_key}"},
                )
            if resp.status_code == 200:
                return {"valid": True, "username": None, "avatar_url": None}
            if resp.status_code == 401:
                return {"valid": False, "error": "Invalid API key — check your Typefully settings"}
            return {"valid": False, "error": f"Typefully returned HTTP {resp.status_code}"}

        elif platform == "twitter":
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.twitter.com/2/users/me",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                return {"valid": True, "username": data.get("username"), "avatar_url": data.get("profile_image_url")}
            return {"valid": False, "error": f"Twitter returned HTTP {resp.status_code}"}

        elif platform == "linkedin":
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.linkedin.com/v2/userinfo",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
            if resp.status_code == 200:
                data = resp.json()
                return {"valid": True, "username": data.get("name"), "avatar_url": data.get("picture")}
            return {"valid": False, "error": f"LinkedIn returned HTTP {resp.status_code}"}

        elif platform == "buffer":
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.bufferapp.com/1/user.json",
                    params={"access_token": api_key},
                )
            if resp.status_code == 200:
                data = resp.json()
                return {"valid": True, "username": data.get("name"), "avatar_url": None}
            return {"valid": False, "error": f"Buffer returned HTTP {resp.status_code}"}

        return {"valid": True}  # unknown platform — skip validation
    except httpx.TimeoutException:
        return {"valid": False, "error": f"Connection to {platform} timed out"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


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

    # ── HF audience deduplication gate ────────────────────────────────────────
    # Embed the new audience string and compare against existing campaigns.
    # Blocks creation if cosine similarity > 0.92 (near-duplicate audience).
    # Fails open — if HF is offline, dedup is skipped and campaign is created.
    try:
        from agents.marketing.hf_harness import get_harness
        harness = get_harness(timeout=4.0)
        prior_embeddings = marketing_list_audience_embeddings(limit=50)
        is_dup, sim_score = harness.deduplicate_audience(audience, prior_embeddings)
        if is_dup:
            raise HTTPException(
                status_code=409,
                detail=f"Audience is too similar to an existing campaign (similarity {sim_score:.0%}). "
                       "Refine your audience description to target a distinct segment."
            )
        # Compute embedding now so we can persist it after creation
        new_embedding = harness.embed(audience)
    except HTTPException:
        raise
    except Exception:
        new_embedding = None  # HF offline — create campaign without embedding
    # ──────────────────────────────────────────────────────────────────────────

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

    # Persist the embedding for future dedup checks (best-effort)
    if new_embedding:
        try:
            marketing_save_audience_embedding(campaign_id, new_embedding)
        except Exception:
            pass  # Non-critical — dedup degrades gracefully without this row

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


@app.patch("/api/schedule/{task_id}")
async def update_schedule(task_id: int, payload: dict):
    name = payload.get("name")
    prompt = payload.get("prompt")
    interval = payload.get("interval")
    enabled = payload.get("enabled")
    if interval and interval not in _VALID_INTERVALS:
        raise HTTPException(status_code=400, detail="interval must be hourly/daily/weekly/monthly")
    if enabled is not None:
        if enabled:
            if not schedule_enable(task_id):
                raise HTTPException(status_code=404, detail="Schedule not found")
        else:
            schedule_disable(task_id)
    if name or prompt or interval:
        if not schedule_update(task_id, name=name, prompt=prompt, interval=interval):
            raise HTTPException(status_code=404, detail="Schedule not found")
    return {"status": "updated"}


@app.post("/api/schedule/{task_id}/run")
async def run_schedule_now(task_id: int):
    row = schedule_get(task_id)
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if row["name"].startswith("SocialStudio:"):
        handle = DBOS.start_workflow(
            run_social_studio_autopost_task,
            task_id, row["name"], row["prompt"], row["interval"],
        )
    else:
        handle = DBOS.start_workflow(agent_loop, row["prompt"])
    return {"status": "started", "workflow_id": handle.workflow_id}


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

_CG_RUNNING: set[str] = set()  # enforce one scan at a time globally

# Per-user rate limiting: github_login → timestamp of last accepted scan request.
# E2B sandboxes are billed per-second and can take 2-10 min each — without a
# cooldown, a single authenticated user can drain the E2B budget by rapid-firing.
# 5-minute cooldown is aggressive but appropriate for an expensive sandbox op.
_CG_LAST_SCAN: dict[str, float] = {}
_CG_COOLDOWN_SECS: float = float(os.environ.get("CG_SCAN_COOLDOWN_SECS", "300"))


@app.post("/api/commitguard/scan")
async def commitguard_scan(payload: dict):
    import time
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
    github_login = connection["login"]

    # Per-user cooldown — prevents a single authenticated user from draining
    # the E2B sandbox budget by queuing rapid successive scans.
    now = time.time()
    last = _CG_LAST_SCAN.get(github_login, 0.0)
    remaining = _CG_COOLDOWN_SECS - (now - last)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit: wait {int(remaining)}s before starting another scan.",
        )

    import uuid
    job_id = str(uuid.uuid4())

    commitguard_create_scan(job_id, repo_url, github_login)

    _CG_LAST_SCAN[github_login] = now
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
    return {"sessions": sessions_list()}


@app.get("/api/sessions/{run_id}")
async def get_session(run_id: str):
    """Return all steps for a single run_id."""
    steps = sessions_get(run_id)
    if not steps:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"steps": steps}


# ── Workflows ─────────────────────────────────────────────────────────────────

@app.get("/api/workflows")
async def list_workflows():
    """Return agent_runs + DLQ events for the Workflows page."""
    return workflows_list()


@app.post("/api/workflows/{run_id}/retry")
async def retry_workflow(run_id: str):
    """Re-queue a failed run by re-submitting it as a new agent_loop workflow."""
    row = workflows_get_last_step(run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")
    context = f"Retry of workflow {run_id} — last step: {row['last_step']}"
    handle = DBOS.start_workflow(agent_loop, context)
    return {"status": "retried", "new_workflow_id": handle.workflow_id}


# ── Approvals ─────────────────────────────────────────────────────────────────

@app.get("/api/approvals")
async def list_approvals():
    """Return agent_events with event_type approval_required, newest first."""
    return {"approvals": approvals_list()}


@app.post("/api/approvals/{approval_id}/decide")
async def decide_approval(approval_id: int, payload: dict):
    """Approve or reject a pending approval and record the decision."""
    run_id = payload.get("run_id")
    approved = payload.get("approved", False)
    note = payload.get("note", "")
    
    if not run_id:
        raise HTTPException(status_code=400, detail="run_id is required")
        
    action = "approved" if approved else "rejected"
    record_approval_decision(approval_id, action, "operator", {"note": note})

    # Notify the waiting workflow. The human decision is authoritative and is
    # already recorded above; if the workflow is no longer waiting (completed,
    # timed out via the 24h auto-reject, or this is demo/seed data with no live
    # run) the send raises DBOSNonExistentWorkflowError. That is not a failure
    # of the decision — swallow it and report that nothing was notified.
    notified = True
    try:
        DBOS.send(run_id, {"approved": approved, "note": note}, "approval")
    except DBOSNonExistentWorkflowError:
        notified = False
        logging.warning(
            "Approval %s decided (%s) but workflow %s no longer exists to notify",
            approval_id, action, run_id,
        )
    return {"status": "decided", "action": action, "workflow_notified": notified}


@app.get("/api/approvals/{approval_id}/history")
async def get_approval_history(approval_id: int):
    """Return audit history for a specific approval."""
    return {"history": approval_get_history(approval_id)}


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
        "killswitch_active": killswitch_get(),
    }


# ── Killswitch ───────────────────────────────────────────────────────────────

@app.get("/api/killswitch")
async def get_killswitch_state():
    return killswitch_get_full_state()


@app.post("/api/killswitch")
async def engage_killswitch(payload: dict):
    engaged = payload.get("engaged", True)
    reason = payload.get("reason")
    engaged_by = payload.get("engaged_by", "operator")
    killswitch_set(engaged, engaged_by=engaged_by, reason=reason)
    return {"status": "updated", "killswitch_active": engaged, "state": killswitch_get_full_state()}


@app.delete("/api/killswitch")
async def disengage_killswitch():
    killswitch_set(False, engaged_by="operator", reason="Disengaged via dashboard")
    return {"status": "disengaged", "killswitch_active": False, "state": killswitch_get_full_state()}


# ── Agents Roster ────────────────────────────────────────────────────────────

@app.get("/api/agents")
async def list_agents():
    """Return the agent roster from the harness registry with live status."""
    return {"agents": list_agents_info()}


@app.post("/api/agents/run")
async def run_agent_endpoint(payload: dict):
    """
    Dispatch any registered agent through the generic harness workflow.

    Body: {"agent_id": "...", "goal": "...", "context": "...", "config": {...}}
    """
    agent_id = payload.get("agent_id")
    goal = payload.get("goal", "")
    context = payload.get("context", "")
    config_overrides = payload.get("config")

    if not agent_id:
        raise HTTPException(400, "agent_id is required")
    if not goal:
        raise HTTPException(400, "goal is required")
    if killswitch_get():
        raise HTTPException(status_code=503, detail="Killswitch engaged — agent dispatch is halted")

    handle = DBOS.start_workflow(
        harness_run_agent, agent_id, goal, context,
        config_overrides=config_overrides,
    )
    return {"status": "started", "workflow_id": handle.workflow_id, "agent_id": agent_id}


# ── Safety / CriticGate (Track B) ────────────────────────────────────────────

@app.get("/api/safety/stats")
async def get_safety_stats():
    """Aggregate CriticGate statistics — verdicts, risk tiers, confidence."""
    return safety_stats()


@app.get("/api/safety/verdicts")
async def get_safety_verdicts(run_id: str = "", limit: int = 100):
    """List Critic verdicts, optionally filtered by run_id."""
    return {"verdicts": safety_list_verdicts(run_id=run_id or None, limit=limit)}


@app.get("/api/safety/traces/{run_id}")
async def get_safety_traces(run_id: str):
    """Return all trace frames for a specific run."""
    return {"traces": safety_list_traces(run_id)}


@app.get("/api/safety/escalations")
async def get_safety_escalations(resolved: str = ""):
    """List escalations. Pass ?resolved=true or ?resolved=false to filter."""
    r = None
    if resolved == "true":
        r = True
    elif resolved == "false":
        r = False
    return {"escalations": safety_list_escalations(resolved=r)}


@app.post("/api/safety/escalations/{escalation_id}/resolve")
async def resolve_escalation(escalation_id: int, payload: dict):
    """Resolve a FLAG/BLOCK escalation with human judgment."""
    resolved_by = payload.get("resolved_by", "operator")
    resolution = payload.get("resolution", "")
    if not resolution:
        raise HTTPException(400, "resolution is required")
    ok = safety_resolve_escalation(escalation_id, resolved_by, resolution)
    if not ok:
        raise HTTPException(404, "Escalation not found")
    return {"status": "resolved", "escalation_id": escalation_id}


# ═══════════════════════════════════════════════════════════════════════════════
# Social Studio — 18 routes under /api/social-studio/
# ═══════════════════════════════════════════════════════════════════════════════

SS_PLATFORMS = {
    "bluesky":          {"label": "Bluesky",              "char_limit": 300,  "color": "#0085ff"},
    "linkedin":         {"label": "LinkedIn",             "char_limit": 3000, "color": "#0a66c2"},
    "linkedin_company": {"label": "LinkedIn (Company)",   "char_limit": 3000, "color": "#0a66c2"},
    "instagram":        {"label": "Instagram",            "char_limit": 2200, "color": "#e1306c"},
    "instagram_login":  {"label": "Instagram (Direct)",   "char_limit": 2200, "color": "#c13584"},
    "threads":          {"label": "Threads",              "char_limit": 500,  "color": "#000000"},
    "twitter":          {"label": "Twitter / X",          "char_limit": 280,  "color": "#1da1f2"},
    "facebook":         {"label": "Facebook",             "char_limit": 63206, "color": "#1877f2"},
    "tiktok":           {"label": "TikTok",               "char_limit": 2200, "color": "#000000"},
    "youtube":          {"label": "YouTube",              "char_limit": 5000, "color": "#ff0000"},
}


# ── Accounts ──────────────────────────────────────────────────────────────────

import os
from fastapi.responses import RedirectResponse
from agents.social_studio.providers.linkedin import LinkedInProvider

@app.get("/api/social-studio/oauth/{platform}/login")
async def ss_oauth_login(platform: str):
    """Start OAuth flow."""
    redirect_uri = f"http://localhost:8000/api/social-studio/oauth/{platform}/callback"
    
    if platform == "linkedin":
        client_id = os.environ.get("LINKEDIN_CLIENT_ID")
        if not client_id:
            raise HTTPException(500, "LINKEDIN_CLIENT_ID not set")
        provider = LinkedInProvider(credentials={"client_id": client_id, "client_secret": ""})
        url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth")
        return RedirectResponse(url)
    
    elif platform == "instagram":
        from agents.social_studio.providers.instagram import InstagramProvider
        client_id = os.environ.get("INSTAGRAM_APP_ID") or os.environ.get("FACEBOOK_APP_ID")
        if not client_id:
            raise HTTPException(500, "INSTAGRAM_APP_ID or FACEBOOK_APP_ID not set")
        provider = InstagramProvider(credentials={"client_id": client_id})
        url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_instagram")
        return RedirectResponse(url)
    
    elif platform == "instagram_login":
        from agents.social_studio.providers.instagram_login import InstagramLoginProvider
        client_id = os.environ.get("INSTAGRAM_LOGIN_APP_ID") or os.environ.get("FACEBOOK_APP_ID")
        if not client_id:
            raise HTTPException(500, "INSTAGRAM_LOGIN_APP_ID not set")
        provider = InstagramLoginProvider(credentials={"client_id": client_id})
        url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_instagram_login")
        return RedirectResponse(url)
    
    elif platform == "threads":
        from agents.social_studio.providers.threads import ThreadsProvider
        client_id = os.environ.get("THREADS_APP_ID") or os.environ.get("FACEBOOK_APP_ID")
        if not client_id:
            raise HTTPException(500, "THREADS_APP_ID or FACEBOOK_APP_ID not set")
        provider = ThreadsProvider(credentials={"client_id": client_id})
        url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_threads")
        return RedirectResponse(url)
    
    elif platform == "facebook":
        from agents.social_studio.providers.facebook import FacebookProvider
        client_id = os.environ.get("FACEBOOK_APP_ID")
        if not client_id:
            raise HTTPException(500, "FACEBOOK_APP_ID not set")
        provider = FacebookProvider(credentials={"client_id": client_id})
        url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_facebook")
        return RedirectResponse(url)
    
    elif platform == "twitter":
        from agents.social_studio.providers.twitter import TwitterProvider
        client_id = os.environ.get("TWITTER_API_KEY")
        if not client_id:
            raise HTTPException(500, "TWITTER_API_KEY not set")
        provider = TwitterProvider(credentials={"client_id": client_id})
        # Generate PKCE code verifier and store it (simplified for now)
        import secrets
        code_verifier = secrets.token_urlsafe(32)
        # In production, store code_verifier in session/cache tied to state
        url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_twitter", code_challenge=code_verifier)
        return RedirectResponse(url)
    
    elif platform == "tiktok":
        from agents.social_studio.providers.tiktok import TikTokProvider
        client_key = os.environ.get("TIKTOK_CLIENT_KEY")
        if not client_key:
            raise HTTPException(500, "TIKTOK_CLIENT_KEY not set")
        provider = TikTokProvider(credentials={"client_id": client_key})
        url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_tiktok")
        return RedirectResponse(url)
    
    elif platform == "youtube":
        from agents.social_studio.providers.youtube import YouTubeProvider
        client_id = os.environ.get("PLATFORM_GOOGLE_CLIENT_ID")
        if not client_id:
            raise HTTPException(500, "PLATFORM_GOOGLE_CLIENT_ID not set")
        provider = YouTubeProvider(credentials={"client_id": client_id})
        url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_youtube")
        return RedirectResponse(url)
    
    elif platform == "google_business":
        from agents.social_studio.providers.google_business import GoogleBusinessProvider
        client_id = os.environ.get("PLATFORM_GOOGLE_CLIENT_ID")
        if not client_id:
            raise HTTPException(500, "PLATFORM_GOOGLE_CLIENT_ID not set")
        provider = GoogleBusinessProvider(credentials={"client_id": client_id})
        url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_google_business")
        return RedirectResponse(url)
    
    raise HTTPException(400, f"OAuth not implemented for {platform}")

@app.get("/api/social-studio/oauth/{platform}/callback")
async def ss_oauth_callback(platform: str, code: str = "", state: str = "", error: str = "", error_description: str = ""):
    """Handle OAuth callback."""
    frontend_url = "http://localhost:5173/"

    # If the user cancelled or platform returned an error
    if error:
        return RedirectResponse(f"{frontend_url}?oauth_error={error}&desc={error_description}")
    if not code:
        return RedirectResponse(f"{frontend_url}?oauth_error=no_code")

    redirect_uri = f"http://localhost:8000/api/social-studio/oauth/{platform}/callback"
    
    try:
        if platform == "linkedin":
            client_id = os.environ.get("LINKEDIN_CLIENT_ID")
            client_secret = os.environ.get("LINKEDIN_CLIENT_SECRET")
            if not client_id or not client_secret:
                return RedirectResponse(f"{frontend_url}?oauth_error=credentials_not_set")
            
            provider = LinkedInProvider(credentials={"client_id": client_id, "client_secret": client_secret})
            tokens = provider.exchange_code(code, redirect_uri)
            profile = provider.get_profile(tokens.access_token)
            
        elif platform == "instagram":
            from agents.social_studio.providers.instagram import InstagramProvider
            client_id = os.environ.get("INSTAGRAM_APP_ID") or os.environ.get("FACEBOOK_APP_ID")
            client_secret = os.environ.get("INSTAGRAM_APP_SECRET") or os.environ.get("FACEBOOK_APP_SECRET")
            if not client_id or not client_secret:
                return RedirectResponse(f"{frontend_url}?oauth_error=credentials_not_set")
            
            provider = InstagramProvider(credentials={"client_id": client_id, "client_secret": client_secret})
            tokens = provider.exchange_code(code, redirect_uri)
            # Exchange short-lived for long-lived token
            long_lived = provider.refresh_token(tokens.access_token)
            profile = provider.get_profile(long_lived.access_token)
            tokens = long_lived
            
        elif platform == "instagram_login":
            from agents.social_studio.providers.instagram_login import InstagramLoginProvider
            client_id = os.environ.get("INSTAGRAM_LOGIN_APP_ID") or os.environ.get("FACEBOOK_APP_ID")
            client_secret = os.environ.get("INSTAGRAM_LOGIN_APP_SECRET") or os.environ.get("FACEBOOK_APP_SECRET")
            if not client_id or not client_secret:
                return RedirectResponse(f"{frontend_url}?oauth_error=credentials_not_set")
            
            provider = InstagramLoginProvider(credentials={"client_id": client_id, "client_secret": client_secret})
            tokens = provider.exchange_code(code, redirect_uri)
            # Exchange for long-lived token
            long_lived = provider.refresh_token(tokens.access_token)
            profile = provider.get_profile(long_lived.access_token)
            tokens = long_lived
            
        elif platform == "threads":
            from agents.social_studio.providers.threads import ThreadsProvider
            client_id = os.environ.get("THREADS_APP_ID") or os.environ.get("FACEBOOK_APP_ID")
            client_secret = os.environ.get("THREADS_APP_SECRET") or os.environ.get("FACEBOOK_APP_SECRET")
            if not client_id or not client_secret:
                return RedirectResponse(f"{frontend_url}?oauth_error=credentials_not_set")
            
            provider = ThreadsProvider(credentials={"client_id": client_id, "client_secret": client_secret})
            tokens = provider.exchange_code(code, redirect_uri)
            profile = provider.get_profile(tokens.access_token)
            
        elif platform == "facebook":
            from agents.social_studio.providers.facebook import FacebookProvider
            client_id = os.environ.get("FACEBOOK_APP_ID")
            client_secret = os.environ.get("FACEBOOK_APP_SECRET")
            if not client_id or not client_secret:
                return RedirectResponse(f"{frontend_url}?oauth_error=credentials_not_set")
            
            provider = FacebookProvider(credentials={"client_id": client_id, "client_secret": client_secret})
            tokens = provider.exchange_code(code, redirect_uri)
            # Exchange for long-lived user token
            long_lived = provider.refresh_token(tokens.access_token)
            # Get profile and Page token
            profile = provider.get_profile(long_lived.access_token)
            tokens = long_lived
            
        elif platform == "twitter":
            from agents.social_studio.providers.twitter import TwitterProvider
            client_id = os.environ.get("TWITTER_API_KEY")
            client_secret = os.environ.get("TWITTER_API_SECRET")
            if not client_id or not client_secret:
                return RedirectResponse(f"{frontend_url}?oauth_error=credentials_not_set")
            
            provider = TwitterProvider(credentials={"client_id": client_id, "client_secret": client_secret})
            # In production, retrieve code_verifier from session/cache
            code_verifier = code  # Simplified - should match the one from login
            tokens = provider.exchange_code(code, redirect_uri, code_verifier)
            profile = provider.get_profile(tokens.access_token)
            
        elif platform == "tiktok":
            from agents.social_studio.providers.tiktok import TikTokProvider
            client_key = os.environ.get("TIKTOK_CLIENT_KEY")
            client_secret = os.environ.get("TIKTOK_CLIENT_SECRET")
            if not client_key or not client_secret:
                return RedirectResponse(f"{frontend_url}?oauth_error=credentials_not_set")
            
            provider = TikTokProvider(credentials={"client_id": client_key, "client_secret": client_secret})
            tokens = provider.exchange_code(code, redirect_uri)
            profile = provider.get_profile(tokens.access_token)
            
        elif platform == "youtube":
            from agents.social_studio.providers.youtube import YouTubeProvider
            client_id = os.environ.get("PLATFORM_GOOGLE_CLIENT_ID")
            client_secret = os.environ.get("PLATFORM_GOOGLE_CLIENT_SECRET")
            if not client_id or not client_secret:
                return RedirectResponse(f"{frontend_url}?oauth_error=credentials_not_set")
            
            provider = YouTubeProvider(credentials={"client_id": client_id, "client_secret": client_secret})
            tokens = provider.exchange_code(code, redirect_uri)
            profile = provider.get_profile(tokens.access_token)
            
        elif platform == "google_business":
            from agents.social_studio.providers.google_business import GoogleBusinessProvider
            client_id = os.environ.get("PLATFORM_GOOGLE_CLIENT_ID")
            client_secret = os.environ.get("PLATFORM_GOOGLE_CLIENT_SECRET")
            if not client_id or not client_secret:
                return RedirectResponse(f"{frontend_url}?oauth_error=credentials_not_set")
            
            provider = GoogleBusinessProvider(credentials={"client_id": client_id, "client_secret": client_secret})
            tokens = provider.exchange_code(code, redirect_uri)
            profile = provider.get_profile(tokens.access_token)
            
        else:
            raise HTTPException(400, f"OAuth not implemented for {platform}")
        
        # Save to DB
        # For Facebook, we override with the Page token
        token_to_save = tokens.access_token
        if platform == "facebook":
            page_token = profile.extra.get("page_access_token")
            if page_token:
                token_to_save = page_token
            import logging
            logging.getLogger(__name__).info(f"Facebook OAuth: page_id={profile.platform_id}, page_token={'[REDACTED]' if page_token else 'None'}")
        
        ss_connect_account(
            platform=platform,
            account_id=profile.platform_id,
            display_name=profile.name,
            username=profile.handle or profile.name,
            avatar_url=profile.avatar_url,
            follower_count=profile.follower_count or 0,
            access_token=token_to_save,
            refresh_token=tokens.refresh_token,
            token_expires_at=None,
            scopes=tokens.scope
        )
        return RedirectResponse(f"{frontend_url}?oauth_success={platform}")
        
    except Exception as e:
        import logging, traceback
        logging.getLogger(__name__).error(f"{platform.title()} OAuth failed: {e}\n{traceback.format_exc()}")
        err_msg = str(e)[:200].replace(" ", "+")
        return RedirectResponse(f"{frontend_url}?oauth_error=exchange_failed&detail={err_msg}")


@app.get("/api/social-studio/oauth/linkedin_company/pages")
async def ss_linkedin_company_pages():
    """List LinkedIn Company Pages the authenticated LinkedIn user administers."""
    from agents.social_studio.providers.linkedin_company import LinkedInCompanyProvider
    from agents.social_studio.providers.exceptions import APIError
    
    accounts = ss_list_accounts()
    linkedin_accts = [a for a in accounts if a["platform"] in ("linkedin", "linkedin_company")]
    if not linkedin_accts:
        raise HTTPException(400, "No LinkedIn account connected. Connect LinkedIn personal first.")
    
    # Get the personal LinkedIn account (not company)
    personal_acct = next((a for a in linkedin_accts if a["platform"] == "linkedin"), None)
    if not personal_acct:
        raise HTTPException(400, "No LinkedIn personal account found. You must connect your LinkedIn personal account first before accessing company pages.")
    
    access_token = ss_get_account_token(personal_acct["id"])
    if not access_token:
        raise HTTPException(400, "No valid token found. Reconnect your LinkedIn personal account.")
    
    client_id = os.environ.get("LINKEDIN_CLIENT_ID", "")
    client_secret = os.environ.get("LINKEDIN_CLIENT_SECRET", "")
    provider = LinkedInCompanyProvider(credentials={"client_id": client_id, "client_secret": client_secret})
    
    try:
        pages = provider.get_user_pages(access_token)
        import logging
        logging.getLogger(__name__).info(f"Successfully fetched {len(pages)} LinkedIn company pages")
        return {"pages": pages}
    except APIError as e:
        # LinkedIn API error - likely scope or permissions issue
        if e.status_code == 403:
            raise HTTPException(403, "LinkedIn API returned 403 Forbidden. Your LinkedIn account may not have the required permissions to access company pages, or your LinkedIn app needs company page scopes enabled in the LinkedIn Developer Portal.")
        elif e.status_code == 401:
            raise HTTPException(401, "LinkedIn authentication failed. Please reconnect your LinkedIn personal account.")
        else:
            raise HTTPException(500, f"LinkedIn API error ({e.status_code}): {str(e)}")
    except Exception as e:
        import logging, traceback
        logging.getLogger(__name__).error(f"Failed to list LinkedIn pages: {e}\n{traceback.format_exc()}")
        raise HTTPException(500, f"Failed to list LinkedIn pages: {str(e)}")


@app.post("/api/social-studio/oauth/linkedin_company/connect")
async def ss_linkedin_company_connect(payload: dict):
    """Connect a specific LinkedIn Company Page as a Social Studio account."""
    from agents.social_studio.providers.linkedin_company import LinkedInCompanyProvider
    org_id = str(payload.get("org_id", "")).strip()
    org_name = payload.get("name", "").strip()
    access_token = payload.get("access_token", "").strip()
    if not org_id or not access_token:
        raise HTTPException(400, "org_id and access_token are required")
    client_id = os.environ.get("LINKEDIN_CLIENT_ID", "")
    client_secret = os.environ.get("LINKEDIN_CLIENT_SECRET", "")
    provider = LinkedInCompanyProvider(credentials={"client_id": client_id, "client_secret": client_secret, "org_id": org_id})
    follower_count = 0
    try:
        metrics = provider.get_account_metrics(access_token)
        follower_count = metrics.followers or 0
    except Exception:
        pass
    ss_connect_account(
        platform="linkedin_company",
        account_id=org_id,
        display_name=org_name or f"Company Page ({org_id})",
        username=payload.get("handle", org_id),
        avatar_url=payload.get("picture"),
        follower_count=follower_count,
        access_token=access_token,
        refresh_token=None,
        token_expires_at=None,
        scopes="w_organization_social,r_organization_social"
    )
    return {"status": "connected", "platform": "linkedin_company", "org_id": org_id}


# ── Instagram Login Webhooks ──────────────────────────────────────────────────

@app.get("/webhooks/instagram_login/")
async def instagram_login_webhook_verify(
    request: Request,
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
):
    """
    Webhook verification for Instagram Login (Instagram API).
    Meta sends GET request to verify the webhook endpoint.
    """
    expected_token = os.getenv("INSTAGRAM_LOGIN_WEBHOOK_VERIFY_TOKEN", "")
    
    if hub_mode == "subscribe" and hub_verify_token == expected_token:
        # Return the challenge to verify the webhook
        return Response(content=hub_challenge, media_type="text/plain")
    
    # Verification failed
    raise HTTPException(403, "Webhook verification failed")


@app.post("/webhooks/instagram_login/")
async def instagram_login_webhook_receive(request: Request):
    """
    Receive webhook events from Instagram Login (Instagram API).
    Handles comments, mentions, and messages.
    """
    body = await request.json()
    
    # Log the webhook event
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Instagram Login webhook received: {body}")
    
    # TODO: Process webhook events (comments, mentions, messages)
    # For now, just acknowledge receipt
    return {"status": "received"}


@app.get("/api/social-studio/accounts")
async def ss_api_list_accounts():
    """List all active connected social accounts with latest metrics."""
    accounts = ss_list_accounts()
    summary = {a["id"]: a for a in ss_get_analytics_summary()}
    for acct in accounts:
        acct["metrics"] = summary.get(acct["id"], {}).get("metrics", {})
        acct["platform_meta"] = SS_PLATFORMS.get(acct["platform"], {})
    return {"accounts": accounts}


@app.post("/api/social-studio/accounts")
async def ss_api_connect_account(payload: dict):
    """
    Connect a social account.
    Body: {platform, account_id, display_name, username, avatar_url,
           follower_count, access_token, refresh_token?, token_expires_at?,
           scopes?}
    """
    required = ["platform", "account_id", "display_name", "access_token"]
    missing = [f for f in required if not payload.get(f)]
    if missing:
        raise HTTPException(400, f"Missing fields: {', '.join(missing)}")
    if payload["platform"] not in SS_PLATFORMS:
        raise HTTPException(400, f"Unsupported platform. Choose from: {list(SS_PLATFORMS)}")

    row_id = ss_connect_account(
        platform=payload["platform"],
        account_id=payload["account_id"],
        display_name=payload["display_name"],
        username=payload.get("username", ""),
        avatar_url=payload.get("avatar_url"),
        follower_count=int(payload.get("follower_count", 0)),
        access_token=payload["access_token"],
        refresh_token=payload.get("refresh_token"),
        token_expires_at=payload.get("token_expires_at"),
        scopes=payload.get("scopes"),
    )
    return {"id": row_id, "status": "connected"}


@app.get("/api/social-studio/accounts/{account_id}")
async def ss_api_get_account(account_id: int):
    acct = ss_get_account(account_id)
    if not acct:
        raise HTTPException(404, "Account not found")
    metrics = ss_get_account_metrics(
        account_id, ["followers","impressions","reach","engagements","avg_engagement_rate"], days=30
    )
    acct.pop("access_token_encrypted", None)
    acct.pop("refresh_token_encrypted", None)
    return {"account": acct, "timeseries": metrics}


@app.delete("/api/social-studio/accounts/{account_id}")
async def ss_api_disconnect_account(account_id: int):
    from store import ss_disconnect_account
    ok = ss_disconnect_account(account_id)
    if not ok:
        raise HTTPException(404, "Account not found")
    return {"status": "disconnected"}


@app.post("/api/social-studio/accounts/{account_id}/health-check")
async def ss_api_health_check(account_id: int):
    """Re-validate token by calling provider.get_profile()."""
    from store import ss_update_follower_count
    from agents.social_studio.providers import PROVIDERS

    acct = ss_get_account(account_id)
    if not acct:
        raise HTTPException(404, "Account not found")
    token = ss_get_account_token(account_id)
    if not token:
        raise HTTPException(400, "No token stored")

    cls = PROVIDERS.get(acct["platform"])
    if not cls:
        return {"status": "unknown", "message": "Provider not found"}
    try:
        provider = cls()
        profile = provider.get_profile(token)
        ss_update_follower_count(account_id, profile.follower_count)
        return {"status": "healthy", "follower_count": profile.follower_count}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── AI Content Generation ─────────────────────────────────────────────────────

@app.post("/api/social-studio/generate")
async def ss_api_generate(payload: dict):
    """
    Start an AI content generation run.
    Body: {topic, tone?, brand_voice?, platforms: ["linkedin","bluesky",...],
           account_map?: {platform: account_id}}
    Returns: {run_id, post_id, platforms}
    """
    topic = (payload.get("topic") or "").strip()
    if not topic:
        raise HTTPException(400, "topic is required")

    platforms = payload.get("platforms") or list(SS_PLATFORMS.keys())
    bad = [p for p in platforms if p not in SS_PLATFORMS]
    if bad:
        raise HTTPException(400, f"Unknown platforms: {bad}")

    tone = payload.get("tone", "professional")
    brand_voice = payload.get("brand_voice", "")
    account_map: dict = payload.get("account_map") or {}

    run_id = secrets.token_hex(16)

    # Create parent post row first
    post_ids = ss_create_posts(
        run_id=run_id,
        topic=topic,
        tone=tone,
        posts=[{"platform": p, "account_id": account_map.get(p), "content": "", "hashtags": "", "char_count": 0} for p in platforms],
    )

    return {
        "run_id": run_id,
        "post_ids": post_ids,
        "platforms": platforms,
        "status": "generating",
    }


@app.get("/api/social-studio/generate/{run_id}/stream")
async def ss_api_generate_stream(run_id: str, request: Request):
    """
    SSE stream — generates content for all platforms concurrently.
    Emits one event per platform as it completes.
    Body params from query: topic, tone, brand_voice, platforms (comma-sep)
    """
    topic = request.query_params.get("topic", "")
    tone = request.query_params.get("tone", "professional")
    brand_voice = request.query_params.get("brand_voice", "")
    platforms_str = request.query_params.get("platforms", ",".join(SS_PLATFORMS.keys()))
    platforms = [p.strip() for p in platforms_str.split(",") if p.strip() in SS_PLATFORMS]
    account_map_str = request.query_params.get("account_map", "{}")
    try:
        account_map = json.loads(account_map_str)
    except Exception:
        account_map = {}

    from agents.social_studio.content_generator import generate_all_platforms

    async def event_gen():
        yield {"event": "start", "data": json.dumps({"run_id": run_id, "platforms": platforms})}
        try:
            async for result in generate_all_platforms(topic, tone, brand_voice, platforms):
                platform = result["platform"]
                # Persist to DB
                existing = ss_list_platform_posts(run_id=run_id, platform=platform)
                if existing:
                    ss_update_platform_post_caption(
                        existing[0]["id"],
                        result.get("content", ""),
                        result.get("hashtags", "")
                    )
                yield {"event": "platform_done", "data": json.dumps(result)}
            yield {"event": "complete", "data": json.dumps({"run_id": run_id})}
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_gen())


@app.get("/api/social-studio/generate/{run_id}")
async def ss_api_get_run(run_id: str):
    """Poll: get all platform posts for a generation run."""
    posts = ss_list_platform_posts(run_id=run_id)
    if not posts:
        # Fall back to social_studio_posts table
        posts = ss_list_posts(run_id=run_id)
    return {"run_id": run_id, "posts": posts}


# ── Posts ─────────────────────────────────────────────────────────────────────

@app.get("/api/social-studio/posts")
async def ss_api_list_posts(
    platform: str = "",
    status: str = "",
    limit: int = 50,
):
    posts = ss_list_platform_posts(
        platform=platform or None,
        status=status or None,
        limit=limit,
    )
    return {"posts": posts}


@app.get("/api/social-studio/posts/{post_id}")
async def ss_api_get_post(post_id: int):
    post = ss_get_platform_post(post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    from store import ss_get_publish_log
    log = ss_get_publish_log(post_id)
    return {"post": post, "publish_log": log}


@app.patch("/api/social-studio/posts/{post_id}")
async def ss_api_patch_post(post_id: int, payload: dict):
    """Edit caption of a draft platform post."""
    caption = payload.get("caption", "")
    if not caption:
        raise HTTPException(400, "caption required")
    ok = ss_update_platform_post_caption(post_id, caption)
    if not ok:
        raise HTTPException(400, "Cannot edit — post is not in draft status")
    return {"status": "updated"}


@app.post("/api/social-studio/posts/{post_id}/publish")
async def ss_api_publish_post(post_id: int):
    """Publish a platform post immediately via provider API."""
    from agents.social_studio.publisher import publish_platform_post

    post = ss_get_platform_post(post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    if post["status"] not in ("draft", "approved", "failed", "scheduled"):
        raise HTTPException(400, f"Cannot publish post in status: {post['status']}")

    account_id = post.get("account_id")
    token = ss_get_account_token(account_id) if account_id else None
    if not token:
        raise HTTPException(400, "No connected account token for this post. Connect an account first.")

    result = publish_platform_post(
        platform_post_id=post_id,
        platform=post["platform"],
        content=post.get("caption") or post.get("content", ""),
        hashtags=post.get("hashtags", ""),
        access_token=token,
        account_id=account_id,
    )
    return result


@app.post("/api/social-studio/posts/{post_id}/schedule")
async def ss_api_schedule_post(post_id: int, payload: dict):
    """Schedule a post for a future datetime."""
    scheduled_at = payload.get("scheduled_at")
    if not scheduled_at:
        raise HTTPException(400, "scheduled_at (ISO 8601) required")
    post = ss_get_platform_post(post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    ss_mark_platform_post_scheduled(post_id, scheduled_at)
    return {"status": "scheduled", "scheduled_at": scheduled_at}


# ── Video Upload ──────────────────────────────────────────────────────────────

@app.post("/api/social-studio/upload-video")
async def ss_api_upload_video(file: UploadFile = File(...)):
    """
    Upload video file for YouTube publishing.
    
    Validates format, size, and duration.
    Stores in /tmp/social-studio-uploads/ with UUID filename.
    Returns file_id for use in post creation.
    """
    import uuid
    import subprocess
    from pathlib import Path
    
    # Validate file format
    valid_formats = {".mp4", ".mov", ".avi", ".wmv", ".flv", ".3gp", ".webm", ".mpeg", ".mpg"}
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in valid_formats:
        raise HTTPException(
            400,
            f"Unsupported format: {file_ext}. Supported: {', '.join(valid_formats)}"
        )
    
    # Create upload directory
    upload_dir = Path("/tmp/social-studio-uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate unique filename
    file_id = str(uuid.uuid4())
    file_path = upload_dir / f"{file_id}{file_ext}"
    
    # Save uploaded file
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        file_size = len(content)
        
        # Validate size (256GB max)
        max_size = 256 * 1024 * 1024 * 1024  # 256GB in bytes
        if file_size > max_size:
            file_path.unlink()  # Delete file
            raise HTTPException(
                400,
                f"File too large: {file_size / (1024**3):.2f}GB (max 256GB)"
            )
        
        # Extract duration and resolution using ffprobe
        try:
            # Get duration
            duration_result = subprocess.run(
                [
                    "ffprobe",
                    "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    str(file_path)
                ],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            duration_seconds = 0
            if duration_result.returncode == 0:
                duration_seconds = int(float(duration_result.stdout.strip()))
            
            # Validate duration (12 hours max)
            max_duration = 12 * 60 * 60  # 12 hours in seconds
            if duration_seconds > max_duration:
                file_path.unlink()
                raise HTTPException(
                    400,
                    f"Video too long: {duration_seconds / 3600:.1f}h (max 12h)"
                )
            
            # Get resolution
            resolution_result = subprocess.run(
                [
                    "ffprobe",
                    "-v", "error",
                    "-select_streams", "v:0",
                    "-show_entries", "stream=width,height",
                    "-of", "csv=p=0",
                    str(file_path)
                ],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            resolution = "unknown"
            if resolution_result.returncode == 0:
                resolution = resolution_result.stdout.strip().replace(",", "x")
            
        except Exception as e:
            logger.warning(f"Could not extract video metadata: {e}")
            duration_seconds = 0
            resolution = "unknown"
        
        # Store in database
        from store import ss_create_video_upload
        ss_create_video_upload(
            file_id=file_id,
            file_path=str(file_path),
            file_size=file_size,
            duration=duration_seconds,
            format=file_ext[1:].upper(),  # Remove dot
            resolution=resolution,
            source="upload",
        )
        
        return {
            "file_id": file_id,
            "file_path": str(file_path),
            "size": file_size,
            "duration": duration_seconds,
            "resolution": resolution,
            "format": file_ext[1:].upper(),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(500, f"Upload failed: {str(e)}")


@app.post("/api/social-studio/veo3/generate")
async def ss_api_veo3_generate(request: Request):
    """
    Generate video from text prompt using Google Veo 3.
    
    Returns SSE stream with progress updates.
    """
    from sse_starlette.sse import EventSourceResponse
    from agents.social_studio.veo3_client import generate_video, is_veo3_enabled
    import uuid
    import json
    from pathlib import Path
    
    if not is_veo3_enabled():
        raise HTTPException(
            503,
            "Google Veo 3 is not configured. Set GOOGLE_GENAI_API_KEY environment variable."
        )
    
    body = await request.json()
    prompt = body.get("prompt", "").strip()
    
    if not prompt:
        raise HTTPException(400, "Prompt is required")
    
    if len(prompt) > 1000:
        raise HTTPException(400, f"Prompt too long: {len(prompt)} chars (max 1000)")
    
    # Generate output path
    file_id = str(uuid.uuid4())
    upload_dir = Path("/tmp/social-studio-uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(upload_dir / f"{file_id}_veo3.mp4")
    
    async def event_generator():
        try:
            async for progress in generate_video(
                prompt=prompt,
                output_path=output_path,
            ):
                # Store in database when complete
                if progress["status"] == "complete":
                    from store import ss_create_video_upload
                    import os
                    
                    file_size = os.path.getsize(output_path)
                    
                    ss_create_video_upload(
                        file_id=file_id,
                        file_path=output_path,
                        file_size=file_size,
                        duration=progress.get("duration", 0),
                        format="MP4",
                        source="veo3",
                        veo3_prompt=prompt,
                    )
                    
                    progress["file_id"] = file_id
                
                yield {
                    "event": "progress",
                    "data": json.dumps(progress)
                }
        except Exception as e:
            logger.error(f"Veo 3 generation error: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"status": "error", "message": str(e)})
            }
    
    return EventSourceResponse(event_generator())


@app.get("/api/social-studio/video-upload/status/{file_id}")
async def ss_api_video_upload_status(file_id: str):
    """Check upload progress for resumable uploads."""
    from store import ss_get_video_upload
    
    upload = ss_get_video_upload(file_id)
    if not upload:
        raise HTTPException(404, "Video upload not found")
    
    return {
        "uploaded_bytes": upload.get("upload_progress_bytes", 0),
        "total_bytes": upload.get("file_size_bytes", 0),
        "percent": int((upload.get("upload_progress_bytes", 0) / upload.get("file_size_bytes", 1)) * 100),
        "status": upload.get("upload_status", "pending"),
    }


@app.post("/api/social-studio/imagen/generate")
async def ss_api_imagen_generate(request: Request):
    """
    Generate image from text prompt using Google Imagen 3.
    
    Body: {"prompt": str}
    Returns: {"status": "complete"|"error", "file_id": str, "file_path": str, "width": int, "height": int}
    """
    from agents.social_studio.imagen_client import generate_image, is_imagen_enabled
    import uuid
    from pathlib import Path
    
    if not is_imagen_enabled():
        raise HTTPException(
            503,
            "Google Imagen 3 is not configured. Set GOOGLE_GENAI_API_KEY environment variable."
        )
    
    body = await request.json()
    prompt = body.get("prompt", "").strip()
    
    if not prompt:
        raise HTTPException(400, "Prompt is required")
    
    if len(prompt) > 1000:
        raise HTTPException(400, f"Prompt too long: {len(prompt)} chars (max 1000)")
    
    # Generate output path
    file_id = str(uuid.uuid4())
    upload_dir = Path("/tmp/social-studio-uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(upload_dir / f"{file_id}_imagen.png")
    
    result = generate_image(
        prompt=prompt,
        output_path=output_path,
    )
    
    if result["status"] == "error":
        raise HTTPException(500, result["message"])
    
    # Store in database
    from store import ss_create_image_upload
    import os
    
    file_size = os.path.getsize(output_path)
    
    ss_create_image_upload(
        file_id=file_id,
        file_path=output_path,
        file_size=file_size,
        width=result.get("width", 0),
        height=result.get("height", 0),
        format="PNG",
        source="imagen",
        prompt=prompt,
    )
    
    return {
        "status": "complete",
        "file_id": file_id,
        "file_path": output_path,
        "width": result.get("width", 0),
        "height": result.get("height", 0),
        "message": result["message"],
    }


@app.get("/api/social-studio/media/{file_id}")
async def ss_api_serve_media(file_id: str):
    """Serve generated images and videos."""
    from pathlib import Path
    import mimetypes
    
    # Check both imagen and veo3 file patterns
    upload_dir = Path("/tmp/social-studio-uploads")
    possible_files = [
        upload_dir / f"{file_id}_imagen.png",
        upload_dir / f"{file_id}_veo3.mp4",
        upload_dir / f"{file_id}.png",
        upload_dir / f"{file_id}.mp4",
        upload_dir / f"{file_id}.jpg",
        upload_dir / f"{file_id}.jpeg",
    ]
    
    for file_path in possible_files:
        if file_path.exists():
            media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            return FileResponse(str(file_path), media_type=media_type)
    
    raise HTTPException(404, "Media file not found")


# ── Auto-Post Agent ───────────────────────────────────────────────────────────

@app.post("/api/social-studio/autopost")
async def ss_api_autopost(payload: dict):
    """
    Generate content from a topic and publish immediately.
    Body: {topic, tone?, brand_voice?, platforms?: ["linkedin"], account_map?, publish_now?: true}
    """
    from agents.social_studio.autoposter import run_autopost

    topic = (payload.get("topic") or "").strip()
    if not topic:
        raise HTTPException(400, "topic is required")

    platforms = payload.get("platforms")
    if not platforms:
        from store import ss_get_connected_accounts
        accounts = ss_get_connected_accounts()
        platforms = [a["platform"] for a in accounts] or ["linkedin"]
    bad = [p for p in platforms if p not in SS_PLATFORMS]
    if bad:
        raise HTTPException(400, f"Unknown platforms: {bad}")

    tone = payload.get("tone", "professional")
    brand_voice = payload.get("brand_voice", "")
    account_map = payload.get("account_map") or {}
    publish_now = payload.get("publish_now", True)

    try:
        result = await run_autopost(
            topic,
            tone=tone,
            brand_voice=brand_voice,
            platforms=platforms,
            account_map=account_map,
            publish_now=publish_now,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        import logging, traceback
        logging.getLogger(__name__).error("autopost failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(500, str(e))

    return result


@app.post("/api/social-studio/autopost/schedule")
async def ss_api_autopost_schedule(payload: dict):
    """
    Create a recurring auto-post task. The prompt/topic runs on the given interval.
    Body: {topic, interval?: "daily", name?: "LinkedIn Auto-Post"}
    """
    topic = (payload.get("topic") or "").strip()
    if not topic:
        raise HTTPException(400, "topic is required")
    interval = payload.get("interval", "daily")
    if interval not in _VALID_INTERVALS:
        raise HTTPException(400, "interval must be hourly/daily/weekly/monthly")
    label = (payload.get("name") or "LinkedIn Auto-Post").strip()
    task_id = schedule_create(f"SocialStudio: {label}", topic, interval)
    return {"status": "created", "task_id": task_id, "interval": interval, "topic": topic}


# ── Analytics ─────────────────────────────────────────────────────────────────

@app.get("/api/social-studio/analytics/summary")
async def ss_api_analytics_summary():
    """Hero KPI cards — latest metrics per account."""
    summary = ss_get_analytics_summary()
    top_posts = ss_get_top_posts(limit=5)

    # Compute aggregates across all accounts
    total_reach = sum(
        a["metrics"].get("reach", {}).get("value", 0) for a in summary
    )
    total_impressions = sum(
        a["metrics"].get("impressions", {}).get("value", 0) for a in summary
    )
    total_engagements = sum(
        a["metrics"].get("engagements", {}).get("value", 0) for a in summary
    )
    total_followers = sum(a.get("follower_count", 0) for a in summary)

    return {
        "accounts": summary,
        "totals": {
            "reach": total_reach,
            "impressions": total_impressions,
            "engagements": total_engagements,
            "followers": total_followers,
        },
        "top_posts": top_posts,
    }


@app.get("/api/social-studio/analytics/timeseries")
async def ss_api_analytics_timeseries(
    account_id: int,
    metrics: str = "followers,impressions,reach,engagements",
    days: int = 30,
):
    """Time-series data for charting a specific account."""
    metric_keys = [m.strip() for m in metrics.split(",") if m.strip()]
    data = ss_get_account_metrics(account_id, metric_keys, days=days)
    return {"account_id": account_id, "metrics": metric_keys, "data": data}


@app.get("/api/social-studio/analytics/posts")
async def ss_api_analytics_posts(limit: int = 20):
    """Published posts with engagement metrics — for the analytics table."""
    posts = ss_get_top_posts(limit=limit)
    return {"posts": posts}


@app.post("/api/social-studio/analytics/sync")
async def ss_api_analytics_sync():
    """Trigger a live analytics pull from all connected platform accounts."""
    from agents.social_studio.analytics import sync_all_accounts
    results = await asyncio.get_event_loop().run_in_executor(None, sync_all_accounts)
    synced = sum(1 for r in results if not r.get("error"))
    failed = len(results) - synced
    return {"synced": synced, "failed": failed, "details": results}


# ── Calendar ──────────────────────────────────────────────────────────────────

@app.get("/api/social-studio/calendar")
async def ss_api_calendar(year: int = 0, month: int = 0):
    """Posts for calendar month view."""
    from datetime import date as dt
    today = dt.today()
    y = year or today.year
    m = month or today.month
    posts = ss_get_calendar_posts(y, m)
    return {"year": y, "month": m, "posts": posts}


# ── Ideas ─────────────────────────────────────────────────────────────────────

class IdeaCreateReq(BaseModel):
    prompt: str
    status: str = "todo"

class IdeaUpdateReq(BaseModel):
    status: str

@app.post("/api/social-studio/ideas")
async def ss_api_create_idea(req: IdeaCreateReq):
    """Create a new idea for the kanban board."""
    from store import ss_create_idea
    idea_id = ss_create_idea(req.prompt, req.status)
    return {"id": idea_id}

@app.get("/api/social-studio/ideas")
async def ss_api_list_ideas():
    """List all ideas for the kanban board."""
    from store import ss_list_ideas
    ideas = ss_list_ideas()
    return {"ideas": ideas}

@app.patch("/api/social-studio/ideas/{idea_id}/status")
async def ss_api_update_idea_status(idea_id: int, req: IdeaUpdateReq):
    """Update the status of an idea."""
    from store import ss_update_idea_status
    success = ss_update_idea_status(idea_id, req.status)
    if not success:
        raise HTTPException(status_code=404, detail="Idea not found")
    return {"success": True}

# ── Platform Metadata ─────────────────────────────────────────────────────────

@app.get("/api/social-studio/platforms")
async def ss_api_platforms():
    """Return all supported platforms with char limits and metadata."""
    return {"platforms": SS_PLATFORMS}
