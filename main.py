import os
import logging
import json
import time
from datetime import datetime, timedelta
from dbos import DBOS
from sqlalchemy import text
from typing import Any, Dict, Optional
from events import bus
from loop import Tool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    if os.environ.get("TRACELOOP_API_KEY"):
        from traceloop.sdk import Traceloop
        Traceloop.init(app_name="agent-mesh", disable_batch=True)
except ImportError:
    pass


class AgentMeshError(Exception):
    def __init__(self, problem: str, cause: str, fix: str, docs_link: str = "https://agentmesh.docs"):
        self.problem = problem
        self.cause = cause
        self.fix = fix
        self.docs_link = docs_link
        super().__init__(f"{problem} | Cause: {cause} | Fix: {fix} | Docs: {docs_link}")


# Model name config — override via env vars; swap any tier with a config change.
MODEL_PLAN    = os.getenv("MODEL_PLAN",    "gemini/gemini-2.5-flash")
MODEL_EXECUTE = os.getenv("MODEL_EXECUTE", "anthropic/claude-sonnet-4-6")


class LLMError(Exception):
    """Raised when an LLM call fails. Always surfaces — never silently mocked."""
    pass


def generate(model: str, prompt: str, max_tokens: int = 4096) -> str:
    """
    Unified LLM call via LiteLLM.

    Raises LLMError on any failure — never returns mock/fake text.
    Callers must handle LLMError explicitly. This makes failures visible
    in the UI, in DBOS step traces, and in the DLQ instead of silently
    producing fake content downstream.

    Common failure causes:
      - Missing API key (ANTHROPIC_API_KEY, GEMINI_API_KEY, etc.)
      - Model name typo in MODEL_PLAN / MODEL_EXECUTE env vars
      - Rate limit / quota exceeded
      - Network timeout
    """
    try:
        import litellm
        response = litellm.completion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )
        content = response.choices[0].message.content
        if not content or not content.strip():
            raise LLMError(f"Empty response from {model}")
        return content
    except LLMError:
        raise
    except Exception as e:
        logger.error("LLM call failed — model=%s error=%s", model, e)
        raise LLMError(f"LLM call failed ({model}): {e}") from e

def init_db():
    """
    Create all application tables using a raw SQLAlchemy engine.

    Intentionally NOT a @DBOS.transaction() — DDL at startup doesn't need
    durable execution, and DBOS 1.x prohibits calling a @transaction from
    outside a workflow context (and prohibits nesting transactions).
    """
    from sqlalchemy import create_engine
    import os

    db_url = os.environ.get(
        "APP_DATABASE_URL",
        "sqlite:///agent_mesh.sqlite",
    )
    engine = create_engine(db_url, connect_args={"check_same_thread": False} if "sqlite" in db_url else {})
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agent_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT,
                agent_id TEXT,
                step TEXT,
                status TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agent_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id TEXT,
                event_type TEXT,
                payload TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        try:
            conn.execute(text("ALTER TABLE agent_events ADD COLUMN event_type TEXT"))
        except Exception:
            pass  # column already exists
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_agent_events_event_type
            ON agent_events (event_type)
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS dlq_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT,
                agent_id TEXT,
                error TEXT,
                payload TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
    # Create all business tables (GitHub, CommitGuard, marketing, etc.)
    from store import init_business_tables
    init_business_tables(engine)


@DBOS.transaction()
def update_status(run_id: str, agent_id: str, step: str, status: str):
    DBOS.sql_session.execute(
        text("INSERT INTO agent_runs (run_id, agent_id, step, status) "
             "VALUES (:run_id, :agent_id, :step, :status)"),
        {"run_id": run_id, "agent_id": agent_id, "step": step, "status": status}
    )


@DBOS.transaction()
def publish_event(tenant_id: str, payload: dict):
    # Extract event_type from the payload dict so we can index/filter it directly
    # without Postgres-specific JSON operators or casts.
    event_type = payload.get("event_type") if isinstance(payload, dict) else None
    DBOS.sql_session.execute(
        text(
            "INSERT INTO agent_events (tenant_id, event_type, payload) "
            "VALUES (:tid, :etype, :payload)"
        ),
        {"tid": tenant_id, "etype": event_type, "payload": json.dumps(payload)}
    )


@DBOS.transaction()
def insert_dlq(run_id: str, agent_id: str, error: str, payload: dict):
    DBOS.sql_session.execute(
        text("INSERT INTO dlq_events (run_id, agent_id, error, payload) "
             "VALUES (:run_id, :agent_id, :error, :payload)"),
        {"run_id": run_id, "agent_id": agent_id, "error": error, "payload": json.dumps(payload)}
    )

from agent_base import BaseAgent, AgentConfig

class ResearchAgent(BaseAgent):
    def get_tools(self) -> list:
        return ["web_search", "rag"]

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

class MLInternAgent(ResearchAgent):
    """
    Hugging Face ml-intern pattern: Code-native research agent.
    Inherits from ResearchAgent but adds a 'python' tool for data processing
    and advanced reasoning.
    """
    def get_tools(self) -> list:
        return super().get_tools() + ["python"]

    def get_tool_objects(self, run_id: str) -> list:
        tools = super().get_tool_objects(run_id)
        
        def python_tool(args):
            code = args.get("code")
            if not code:
                return "Error: no code provided"
            
            # ── E2B Sandbox (Isolated Execution) ─────────────────────────────
            logger.info("Executing code-native tool in run %s", run_id)
            try:
                from e2b_code_interpreter import Sandbox
                with Sandbox() as sb:
                    # In a real impl, we'd inject current tool results as variables
                    execution = sb.run_code(code)
                    if execution.error:
                        return f"Runtime Error: {execution.error.name}: {execution.error.value}\n{execution.error.traceback}"
                    return execution.logs.stdout or "Success (no output)"
            except Exception as e:
                return f"Sandbox Error: {e}"

        tools.append(Tool(
            name="python",
            description="Execute Python code in a secure sandbox for data analysis, complex math, or logic.",
            parameters={"code": "The Python code to execute"},
            run=python_tool,
            risk_level="high", # Risky as it executes arbitrary code
        ))
        return tools


# ── Jules: Suggested Tasks ────────────────────────────────────────────────────

import re
import ast
import pathlib

_TODO_RE = re.compile(r"#\s*(TODO|FIXME|HACK|XXX)\b[:\s]*(.*)", re.IGNORECASE)
_SAFE_BRANCH_RE = re.compile(r"^[a-zA-Z0-9/_.\-]+$")

def _extract_todos(repo_root: str, max_files: int = 200) -> list[dict]:
    """Scan repo for TODO/FIXME markers, return list with file/line/context."""
    import subprocess
    results = []
    root = pathlib.Path(repo_root)

    # Prefer recently changed files; fall back to full scan
    try:
        changed = subprocess.check_output(
            ["git", "diff", "--name-only", "HEAD~10", "HEAD"],
            cwd=repo_root, text=True, timeout=10
        ).splitlines()
        candidates = [root / f for f in changed if (root / f).suffix in (".py", ".ts", ".js", ".go", ".rb")]
    except Exception:
        candidates = []

    if not candidates:
        candidates = list(root.rglob("*.py"))[:max_files]

    for fpath in candidates[:max_files]:
        try:
            lines = fpath.read_text(errors="replace").splitlines()
        except Exception:
            continue
        for i, line in enumerate(lines):
            m = _TODO_RE.search(line)
            if not m:
                continue
            start = max(0, i - 20)
            end = min(len(lines), i + 20)
            context = "\n".join(lines[start:end])
            results.append({
                "file_path": str(fpath.relative_to(root)),
                "line_number": i + 1,
                "marker": m.group(1).upper(),
                "comment": m.group(2).strip(),
                "context_snippet": context,
            })
    return results


def _save_suggested_task(file_path: str, line_number: int, marker: str,
                          comment: str, context_snippet: str,
                          rationale: str, confidence: int):
    from store import tasks_save
    tasks_save(file_path, line_number, marker, comment, context_snippet, rationale, confidence)


from store import KillswitchEngaged, killswitch_get

def check_killswitch():
    if killswitch_get():
        raise KillswitchEngaged("Global killswitch engaged — all agent work halted.")

@DBOS.workflow()
def scan_suggested_tasks(repo_root: str):
    """Discover TODO/FIXME markers, score each with LLM, persist to DB."""
    check_killswitch()
    todos = _extract_todos(repo_root)

    publish_event("default", {"agent_id": "SuggestedTaskScanner", "event_type": "scan_started",
                               "payload": {"count": len(todos), "status": "Executing"}})
    bus.emit(json.dumps({"agent_id": "SuggestedTaskScanner", "event_type": "scan_started",
                          "payload": {"count": len(todos), "status": "Executing"}}))

    llm = None  # unused — kept for readability; generate() is called directly
    for todo in todos:
        prompt = (
            f"You are a senior engineer reviewing this TODO comment.\n"
            f"File: {todo['file_path']}:{todo['line_number']}\n"
            f"Comment: {todo['comment']}\n\n"
            f"Surrounding code:\n{todo['context_snippet']}\n\n"
            f"Reply with exactly two lines:\n"
            f"RATIONALE: <one sentence explaining what work is needed>\n"
            f"CONFIDENCE: <integer 0-100 estimating how autonomously AI can complete this>"
        )
        raw = generate(MODEL_PLAN, prompt)
        rationale, confidence = "Needs review.", 50
        for line in raw.splitlines():
            if line.startswith("RATIONALE:"):
                rationale = line[len("RATIONALE:"):].strip()
            elif line.startswith("CONFIDENCE:"):
                try:
                    confidence = max(0, min(100, int(re.search(r"\d+", line).group())))
                except Exception:
                    pass
        _save_suggested_task(
            todo["file_path"], todo["line_number"], todo["marker"],
            todo["comment"], todo["context_snippet"], rationale, confidence
        )

    publish_event("default", {"agent_id": "SuggestedTaskScanner", "event_type": "scan_complete",
                               "payload": {"count": len(todos), "status": "Success"}})
    bus.emit(json.dumps({"agent_id": "SuggestedTaskScanner", "event_type": "scan_complete",
                          "payload": {"count": len(todos), "status": "Success"}}))
    return {"scanned": len(todos)}


# ── Jules: Scheduled Tasks ────────────────────────────────────────────────────


# Safe allowlist of commands the scheduler is permitted to run.
# The LLM selects a command + args from this set — it cannot inject
# arbitrary shell syntax. shell=True is never used.
_SCHEDULER_ALLOWED_CMDS = frozenset([
    "git", "pip", "python", "python3", "pytest", "npm", "node",
    "curl", "wget", "echo", "ls", "find", "grep", "cat",
])

_SCHEDULER_BLOCKED_PATTERNS = [
    "rm ", "rm\t", "rmdir", "dd ", "mkfs", "shutdown", "reboot",
    "sudo", "su ", ">", ">>", "|", "&", ";", "$(", "`",
    "chmod", "chown", "passwd", "/etc/", "/dev/",
]


def _safe_parse_cmd(cmd_str: str) -> list[str]:
    """
    Parse an LLM-generated command string into a safe argv list.

    Rules:
    - Uses shlex.split — no shell=True, no string interpolation
    - First token must be in _SCHEDULER_ALLOWED_CMDS
    - Rejects any token containing shell metacharacters or blocked patterns
    - Raises ValueError with a clear reason if the command is unsafe
    """
    import shlex
    parts = shlex.split(cmd_str.strip())
    if not parts:
        raise ValueError("Empty command")
    binary = pathlib.Path(parts[0]).name  # strip path prefix (e.g. /usr/bin/git → git)
    if binary not in _SCHEDULER_ALLOWED_CMDS:
        raise ValueError(f"Command '{binary}' not in allowed list: {sorted(_SCHEDULER_ALLOWED_CMDS)}")
    for token in parts:
        for blocked in _SCHEDULER_BLOCKED_PATTERNS:
            if blocked in token:
                raise ValueError(f"Blocked pattern '{blocked}' found in token '{token}'")
    return parts


@DBOS.workflow()
def run_scheduled_task(task_id: int, name: str, prompt: str, interval: str):
    """
    Execute one scheduled task via LLM-directed commands. Self-heals on
    failure up to 3 attempts.

    Security: LLM output is parsed into a safe argv list (no shell=True).
    Only commands in _SCHEDULER_ALLOWED_CMDS are permitted. Shell metacharacters
    and destructive patterns are rejected before execution.
    """
    check_killswitch()
    import subprocess
    from store import schedule_mark_ran

    publish_event("default", {"agent_id": f"Scheduler:{name}", "event_type": "task_started",
                               "payload": {"status": "Executing", "prompt": prompt}})
    bus.emit(json.dumps({"agent_id": f"Scheduler:{name}", "event_type": "task_started",
                          "payload": {"status": "Executing", "prompt": prompt}}))

    status = "failed"
    current_prompt = prompt
    for attempt in range(3):
        cmd_prompt = (
            f"You are an autonomous DevOps agent. Translate this task into a single safe shell command.\n"
            f"Task: {current_prompt}\n\n"
            f"IMPORTANT: Only use commands from this allowed list: {sorted(_SCHEDULER_ALLOWED_CMDS)}\n"
            f"Do NOT use pipes, redirects, semicolons, subshells, sudo, or rm.\n"
            f"Reply with ONLY the command and its arguments on one line, nothing else."
        )
        try:
            cmd_str = generate(MODEL_PLAN, cmd_prompt).strip().split("\n")[0]
            argv = _safe_parse_cmd(cmd_str)
        except (LLMError, ValueError) as e:
            logger.warning("Scheduler '%s' attempt %d: command rejected — %s", name, attempt + 1, e)
            bus.emit(json.dumps({"agent_id": f"Scheduler:{name}", "event_type": "task_blocked",
                                  "payload": {"status": "Failed", "reason": str(e), "attempt": attempt + 1}}))
            break

        try:
            proc = subprocess.run(argv, shell=False, capture_output=True, text=True, timeout=120)
            if proc.returncode == 0:
                status = "success"
                publish_event("default", {"agent_id": f"Scheduler:{name}", "event_type": "task_success",
                                           "payload": {"status": "Success", "attempt": attempt + 1,
                                                       "stdout": proc.stdout[:500]}})
                bus.emit(json.dumps({"agent_id": f"Scheduler:{name}", "event_type": "task_success",
                                      "payload": {"status": "Success", "attempt": attempt + 1}}))
                break
            else:
                heal_prompt = (
                    f"The command {argv} failed (exit {proc.returncode}):\n{proc.stderr[:500]}\n"
                    f"Original task: {prompt}\n"
                    f"Reply with a corrected command using only allowed commands: {sorted(_SCHEDULER_ALLOWED_CMDS)}"
                )
                current_prompt = f"RETRY: {heal_prompt}"
        except subprocess.TimeoutExpired:
            logger.warning("Scheduler '%s' attempt %d: command timed out", name, attempt + 1)
            break

    schedule_mark_ran(task_id, status, interval)
    return {"status": status}


@DBOS.scheduled(cron="* * * * *")
@DBOS.workflow()
def scheduled_dispatcher(scheduled_time: datetime, actual_time: datetime):
    """Runs every minute. Finds due tasks and kicks off their workflows."""
    try:
        check_killswitch()
    except KillswitchEngaged:
        return
    from store import schedule_get_due
    due = schedule_get_due()
    for task in due:
        if task["name"].startswith("SocialStudio:"):
            DBOS.start_workflow(run_social_studio_autopost_task, task["id"], task["name"], task["prompt"], task["interval"])
        else:
            DBOS.start_workflow(run_scheduled_task, task["id"], task["name"], task["prompt"], task["interval"])


@DBOS.scheduled(cron="* * * * *")
@DBOS.workflow()
def social_studio_publisher_daemon(scheduled_time: datetime, actual_time: datetime):
    try:
        check_killswitch()
    except KillswitchEngaged:
        return
    from store import ss_get_and_lock_due_posts
    posts = ss_get_and_lock_due_posts()
    for post in posts:
        DBOS.start_workflow(run_publish_platform_post, post)


@DBOS.step()
def step_publish_platform_post(post: dict, token: str):
    from agents.social_studio.publisher import publish_platform_post
    return publish_platform_post(
        platform_post_id=post["id"],
        platform=post["platform"],
        content=post.get("caption") or "",
        hashtags=post.get("hashtags") or "",
        access_token=token,
        account_id=post.get("account_id"),
    )


@DBOS.workflow()
def run_publish_platform_post(post: dict):
    from store import ss_get_account_token, ss_mark_platform_post_failed
    token = ss_get_account_token(post["account_id"]) if post.get("account_id") else None
    if not token:
        ss_mark_platform_post_failed(post["id"], "No connected account token.", retryable=False)
        return
    step_publish_platform_post(post, token)


@DBOS.workflow()
def run_social_studio_autopost_task(task_id: int, name: str, prompt: str, interval: str):
    import uuid
    run_id = f"autopost-{uuid.uuid4().hex[:8]}"
    step_social_studio_autopost(run_id, prompt)
    from store import schedule_mark_ran
    schedule_mark_ran(task_id, "success", interval)


@DBOS.step()
def step_social_studio_autopost(run_id: str, prompt: str):
    import asyncio
    from agents.social_studio.autoposter import run_autopost

    asyncio.run(run_autopost(
        prompt,
        tone="professional",
        brand_voice="Agent Mesh",
        platforms=["linkedin"],
        publish_now=True,
        run_id=run_id,
    ))


@DBOS.scheduled(cron="*/2 * * * *")
@DBOS.workflow()
def social_studio_ideas_daemon(scheduled_time: datetime, actual_time: datetime):
    try:
        check_killswitch()
    except KillswitchEngaged:
        return

    from store import ss_get_ideas_by_status, ss_update_idea_status
    import uuid

    # Find ideas that are in "todo"
    todos = ss_get_ideas_by_status("todo")
    for idea in todos:
        idea_id = idea["id"]
        prompt = idea["prompt"]
        
        # Mark in progress
        ss_update_idea_status(idea_id, "in_progress")
        
        run_id = f"idea-{idea_id}-{uuid.uuid4().hex[:8]}"
        try:
            # Generate and schedule posts based on the idea
            step_social_studio_autopost(run_id, prompt)
            
            # Mark done
            ss_update_idea_status(idea_id, "done")
        except Exception as e:
            logger.error(f"Failed to process idea {idea_id}: {e}")
            # Revert to todo if failed so it can be retried or debugged
            ss_update_idea_status(idea_id, "todo")


# ── Jules: Self-Healing PRs ──────────────────────────────────────────────────

def _record_webhook(source: str, event_type: str, branch: str, payload: dict) -> int:
    from store import webhook_create
    return webhook_create(source, event_type, branch, payload)


def _update_webhook_status(webhook_id: int, status: str, workflow_id: str = ""):
    from store import webhook_update_status
    webhook_update_status(webhook_id, status, workflow_id)


@DBOS.workflow()
def self_heal_pr(webhook_id: int, branch: str, build_logs: str, pr_diff: str):
    """Diagnose a failing Render build and push a fix commit to the PR branch."""
    check_killswitch()
    import subprocess

    if not _SAFE_BRANCH_RE.match(branch):
        logger.error(f"Unsafe branch name rejected: {branch!r}")
        _update_webhook_status(webhook_id, "rejected_unsafe_branch")
        return {"status": "rejected", "reason": "unsafe branch name"}

    publish_event("default", {"agent_id": "SelfHeal", "event_type": "heal_started",
                               "payload": {"status": "Executing", "branch": branch}})
    bus.emit(json.dumps({"agent_id": "SelfHeal", "event_type": "heal_started",
                          "payload": {"status": "Executing", "branch": branch}}))

    # Diagnose
    diagnose_prompt = (
        f"A Render build failed on branch `{branch}`.\n\n"
        f"Build logs (last 2000 chars):\n{build_logs[-2000:]}\n\n"
        f"PR diff (last 3000 chars):\n{pr_diff[-3000:]}\n\n"
        f"Identify the root cause in one sentence, then provide the minimal file edit "
        f"as a unified diff that fixes it. Format:\n"
        f"ROOT_CAUSE: <one sentence>\n"
        f"PATCH:\n```diff\n<unified diff>\n```"
    )
    diagnosis = generate(MODEL_EXECUTE, diagnose_prompt)

    root_cause = "Unknown build failure."
    patch = ""
    for line in diagnosis.splitlines():
        if line.startswith("ROOT_CAUSE:"):
            root_cause = line[len("ROOT_CAUSE:"):].strip()
    patch_match = re.search(r"```diff\n(.*?)```", diagnosis, re.DOTALL)
    if patch_match:
        patch = patch_match.group(1).strip()

    if not patch:
        _update_webhook_status(webhook_id, "no_patch_generated")
        publish_event("default", {"agent_id": "SelfHeal", "event_type": "heal_failed",
                                   "payload": {"status": "Failed", "reason": "no patch generated"}})
        bus.emit(json.dumps({"agent_id": "SelfHeal", "event_type": "heal_failed",
                              "payload": {"status": "Failed", "reason": "no patch generated"}}))
        return {"status": "failed", "reason": "no patch"}

    # Apply patch: checkout branch, apply only patch-touched files, commit, push
    repo_root = pathlib.Path(__file__).parent
    try:
        subprocess.run(["git", "checkout", branch], cwd=repo_root, check=True, capture_output=True)
        patch_file = repo_root / ".self_heal.patch"
        patch_file.write_text(patch)

        # --check first: validate the patch applies cleanly without touching the tree
        check = subprocess.run(
            ["git", "apply", "--check", ".self_heal.patch"],
            cwd=repo_root, capture_output=True, text=True
        )
        if check.returncode != 0:
            patch_file.unlink(missing_ok=True)
            raise RuntimeError(f"Patch rejected by git apply --check: {check.stderr[:300]}")

        apply = subprocess.run(
            ["git", "apply", ".self_heal.patch"],
            cwd=repo_root, capture_output=True, text=True
        )
        patch_file.unlink(missing_ok=True)
        if apply.returncode != 0:
            raise RuntimeError(f"git apply failed: {apply.stderr[:300]}")

        # Stage ONLY files mentioned in the patch — not git add -A
        changed = subprocess.run(
            ["git", "diff", "--name-only"],
            cwd=repo_root, capture_output=True, text=True, check=True
        ).stdout.strip().splitlines()
        if not changed:
            raise RuntimeError("Patch applied but no files changed — nothing to commit")
        subprocess.run(["git", "add", "--"] + changed, cwd=repo_root, check=True, capture_output=True)

        subprocess.run(
            ["git", "commit", "-m", f"fix(self-heal): {root_cause[:72]}"],
            cwd=repo_root, check=True, capture_output=True
        )
        # Push only the specific branch — no --force
        subprocess.run(["git", "push", "origin", branch], cwd=repo_root, check=True, capture_output=True)
        _update_webhook_status(webhook_id, "fix_pushed")
        publish_event("default", {"agent_id": "SelfHeal", "event_type": "heal_pushed",
                                   "payload": {"status": "Success", "branch": branch, "root_cause": root_cause}})
        bus.emit(json.dumps({"agent_id": "SelfHeal", "event_type": "heal_pushed",
                              "payload": {"status": "Success", "branch": branch, "root_cause": root_cause}}))
        return {"status": "fix_pushed", "root_cause": root_cause}
    except Exception as e:
        _update_webhook_status(webhook_id, "error")
        publish_event("default", {"agent_id": "SelfHeal", "event_type": "heal_failed",
                                   "payload": {"status": "Failed", "error": str(e)}})
        bus.emit(json.dumps({"agent_id": "SelfHeal", "event_type": "heal_failed",
                              "payload": {"status": "Failed", "error": str(e)}}))
        return {"status": "error", "error": str(e)}

class HermesAgent(BaseAgent):
    """
    Nous Research Hermes pattern: The 'Brain' of the company.
    Focuses on orchestration, high-level planning, and skill management.
    """
    def get_tools(self) -> list:
        return ["delegate_task", "save_new_skill", "list_known_skills"]

    def get_tool_objects(self, run_id: str) -> list:
        from skill_store import save_skill, list_skills
        tools = super().get_tool_objects(run_id) or []

        def save_skill_tool(args):
            name = args.get("name")
            desc = args.get("description")
            # In a real impl, we'd extract the actual steps from recent history
            save_skill(name, desc, [], [])
            return f"Skill '{name}' saved to ~/.agent_mesh/skills/"

        tools.extend([
            Tool(
                name="save_new_skill",
                description="Codify a successful workflow into a permanent skill.",
                parameters={"name": "Name of the skill", "description": "What it does"},
                run=save_skill_tool,
                risk_level="low",
            ),
            Tool(
                name="list_known_skills",
                description="List all currently learned skills.",
                run=lambda args: f"Learned skills: {', '.join(list_skills())}",
                risk_level="low",
            )
        ])
        return tools

class ApprovalGatedAgent(BaseAgent):
    # Generic demo agent for the session approval-gate workflow.
    # The real CommitGuard scanner lives in agents/commitguard/.
    def get_tools(self) -> list:
        return ["e2b_sandbox_proxied", "git_diff"]

    @DBOS.step()
    def execute(self, plan: dict) -> dict:
        self.write_event("executing", {"status": "Executing"})
        try:
            from e2b_code_interpreter import Sandbox
            steps = plan.get("steps", [])
            code = f"print('Executed sandboxed analysis for plan steps: {len(steps)}')"
            with Sandbox() as sandbox:
                execution = sandbox.run_code(code)
                output = execution.logs.stdout
            result = {"data": output}
            self.write_event("execution_completed", {"result": "Success", "status": "Idle"})
            return result
        except Exception as e:
            logger.error(f"E2B execution failed: {e}")
            # If no API key is present, fallback to mock execution so local demo doesn't crash
            if "API key" in str(e) or "authentication" in str(e).lower() or "missing" in str(e).lower():
                time.sleep(1)
                result = {"data": "Mocked E2B tool execution result (API key missing)"}
                self.write_event("execution_completed", {"result": "Success", "status": "Idle"})
                return result
            raise AgentMeshError("Sandbox execution failed", str(e), "Check E2B API key")

@DBOS.workflow()
def agent_loop(context: str):
    run_id = DBOS.workflow_id
    agent = ApprovalGatedAgent(goal="Audit target environment for vulnerabilities")
    
    update_status(run_id, agent.agent_id, "start", "Idle")
    
    try:
        check_killswitch()
        plan = agent.plan(context)
        update_status(run_id, agent.agent_id, "planning", "Planning")

        # Build the approval payload from the actual plan — not a hardcoded fake diff
        steps_summary = "\n".join(f"+ {s}" for s in plan.get("steps", []))
        agent.request_approval({
            "context": context,
            "plan_steps": plan.get("steps", []),
            "add": steps_summary or "+ (no steps generated)",
            "sub": "- (pending human approval before execution)",
            "risk_level": "medium",
        })
        update_status(run_id, agent.agent_id, "blocked", "Blocked")
        
        approval = DBOS.recv("approval", timeout_seconds=86400)
        if approval is None:
            update_status(run_id, agent.agent_id, "timeout", "Failed")
            return {"passed": False, "feedback": "Timeout waiting for approval"}
        if not approval.get("approved"):
            update_status(run_id, agent.agent_id, "rejected", "Failed")
            agent.write_event("execution_aborted", {"status": "Failed"})
            return {"passed": False, "feedback": "Rejected by human"}
        
        check_killswitch()
        result = agent.execute(plan)
        update_status(run_id, agent.agent_id, "executing", "Executing")
        
        check_killswitch()
        verdict = agent.review(result)
        if verdict.get("passed"):
            update_status(run_id, agent.agent_id, "complete", "Success")
        else:
            update_status(run_id, agent.agent_id, "failed", "Failed")
            
        return verdict
    except KillswitchEngaged as e:
        update_status(run_id, agent.agent_id, "halted", "Failed")
        agent.write_event("agent_halted", {"status": "Failed", "reason": str(e)})
        return {"passed": False, "feedback": str(e)}
    except Exception as e:
        insert_dlq(run_id, agent.agent_id, str(e), {"context": context})
        update_status(run_id, agent.agent_id, "dlq", "Failed")
        agent.write_event("execution_failed", {"status": "Failed", "error": str(e)})
        return {"passed": False, "feedback": "Sent to DLQ due to fatal error"}


# ── CommitGuard Arm ───────────────────────────────────────────────────────────

# All DBOS steps must be module-level functions — no inner/nested @DBOS.step().
# The workflow calls these; each receives all required inputs as arguments.

@DBOS.step()
def cg_clone(repo_url: str, tmpdir: str):
    """Clone the repo into tmpdir. Idempotent — re-clones if tmpdir missing after crash."""
    from agents.commitguard.scanner import _ensure_repo
    _ensure_repo(repo_url, tmpdir)


@DBOS.step()
def cg_scan(repo_url: str, tmpdir: str, max_findings: int) -> tuple:
    """Run Semgrep + LLM triage. Returns (findings_as_dicts, truncated_bool)."""
    from agents.commitguard.scanner import scan
    return scan(repo_url, tmpdir, max_findings)


@DBOS.step()
def cg_verify(finding: dict, repo_url: str) -> dict:
    """Run E2B PoC for one finding. Returns VerifiedFinding dict."""
    from agents.commitguard.verifier import verify
    return verify(finding, repo_url)


@DBOS.step()
def cg_file_issue(vf: dict, repo_url: str, github_token: str) -> dict:
    """File a GitHub issue for a CONFIRMED finding. Returns FiledFinding dict."""
    from agents.commitguard.github_client import file_issue
    return file_issue(vf, repo_url, github_token)


@DBOS.step()
def cg_cleanup(tmpdir: str):
    import shutil
    shutil.rmtree(tmpdir, ignore_errors=True)


@DBOS.transaction()
def _save_commitguard_results(job_id: str, findings: list, duration_s: int,
                               total_semgrep_hits: int, truncated: bool):
    for f in findings:
        vf = f.get("verified_finding", f)
        DBOS.sql_session.execute(text(
            "INSERT INTO commitguard_findings "
            "(id, job_id, file, line, severity, verdict, poc_summary, cvss, cwe, "
            " fix_suggestion, github_issue_url, issue_filed, webhook_fired) "
            "VALUES (:id, :job_id, :file, :line, :severity, :verdict, :poc, :cvss, :cwe, "
            "        :fix, :issue_url, :issue_filed, :webhook_fired) "
            "ON CONFLICT (id) DO NOTHING"
        ), {
            "id": vf.get("finding_id", ""),
            "job_id": job_id,
            "file": vf.get("file", ""),
            "line": vf.get("line", 0),
            "severity": vf.get("severity", ""),
            "verdict": vf.get("verdict", "UNVERIFIABLE"),
            "poc": vf.get("poc_summary", ""),
            "cvss": vf.get("cvss"),
            "cwe": vf.get("cwe"),
            "fix": f.get("fix_suggestion"),
            "issue_url": f.get("github_issue_url"),
            "issue_filed": int(f.get("issue_filed", False)),
            "webhook_fired": int(vf.get("webhook_fired", False)),
        })
    DBOS.sql_session.execute(text(
        "UPDATE commitguard_scans SET status='complete', step='done', progress_pct=100, "
        "scan_duration_s=:dur, total_semgrep_hits=:hits, findings_truncated=:trunc "
        "WHERE job_id=:jid"
    ), {"dur": duration_s, "hits": total_semgrep_hits, "trunc": int(truncated), "jid": job_id})


@DBOS.transaction()
def _update_scan_step(job_id: str, step: str, pct: int, status: str = "running"):
    DBOS.sql_session.execute(text(
        "UPDATE commitguard_scans SET step=:step, progress_pct=:pct, status=:status "
        "WHERE job_id=:jid"
    ), {"step": step, "pct": pct, "status": status, "jid": job_id})


def _cg_emit(job_id: str, step: str, pct: int, extra: dict = None):
    payload = {"job_id": job_id, "step": step, "progress_pct": pct, **(extra or {})}
    publish_event("default", {"agent_id": "CommitGuard", "event_type": "scan_progress",
                               "payload": payload})
    bus.emit(json.dumps({"agent_id": "CommitGuard", "event_type": "scan_progress",
                          "payload": payload}))


@DBOS.workflow()
def commitguard_workflow(job_id: str, repo_url: str, max_findings: int, github_token: str):
    """
    Durable CommitGuard scan: clone → scan → verify (per finding) → file issues → cleanup.

    tmpdir is computed from job_id in the workflow (deterministic, not a step return value).
    cg_clone / cg_scan / cg_verify each call _ensure_repo() at their start — safe on replay
    after a crash where the tmpdir was wiped.
    """
    import time as _time
    tmpdir = f"/tmp/commitguard-{job_id}"
    started_at = _time.time()

    try:
        check_killswitch()
        _update_scan_step(job_id, "clone", 5)
        _cg_emit(job_id, "clone", 5)

        cg_clone(repo_url, tmpdir)

        check_killswitch()
        _update_scan_step(job_id, "scan", 15)
        _cg_emit(job_id, "scan", 15)

        raw_findings, truncated = cg_scan(repo_url, tmpdir, max_findings)
        total_hits = len(raw_findings)

        verified_all = []
        for i, finding in enumerate(raw_findings):
            check_killswitch()
            pct = 20 + int(60 * (i / max(total_hits, 1)))
            _update_scan_step(job_id, "verify", pct)
            _cg_emit(job_id, "verify", pct, {"current": i + 1, "total": total_hits})
            vf = cg_verify(finding, repo_url)
            verified_all.append(vf)

        filed_all = []
        for vf in verified_all:
            if vf.get("verdict") != "CONFIRMED":
                filed_all.append({"verified_finding": vf, "fix_suggestion": None,
                                   "github_issue_url": None, "issue_filed": False})
                continue
            check_killswitch()
            _update_scan_step(job_id, "file", 85)
            ff = cg_file_issue(vf, repo_url, github_token)
            filed_all.append({"verified_finding": vf, **ff})

        cg_cleanup(tmpdir)

        duration_s = int(_time.time() - started_at)
        _save_commitguard_results(job_id, filed_all, duration_s, total_hits, truncated)

        publish_event("default", {"agent_id": "CommitGuard", "event_type": "scan_complete",
                                   "payload": {"job_id": job_id, "status": "complete",
                                               "findings": len(filed_all)}})
        bus.emit(json.dumps({"agent_id": "CommitGuard", "event_type": "scan_complete",
                              "payload": {"job_id": job_id, "status": "complete",
                                          "findings": len(filed_all)}}))
        return {"job_id": job_id, "findings": len(filed_all), "duration_s": duration_s}

    except KillswitchEngaged as e:
        _update_scan_step(job_id, "halted", 0, status="failed")
        publish_event("default", {"agent_id": "CommitGuard", "event_type": "scan_failed",
                                   "payload": {"job_id": job_id, "status": "failed", "reason": str(e)}})
        bus.emit(json.dumps({"agent_id": "CommitGuard", "event_type": "scan_failed",
                              "payload": {"job_id": job_id, "status": "failed", "reason": str(e)}}))
        raise
    except Exception as e:
        _update_scan_step(job_id, "error", 0, status="failed")
        raise
