import os
import logging
import json
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from dbos import DBOS
from sqlalchemy import text
from pydantic import BaseModel
from typing import Any, Dict, Optional
from events import bus

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
MODEL_PLAN    = os.getenv("MODEL_PLAN",    "gemini/gemini-2.5-flash-lite-preview-06-17")
MODEL_EXECUTE = os.getenv("MODEL_EXECUTE", "anthropic/claude-sonnet-4-6")


def generate(model: str, prompt: str, max_tokens: int = 4096) -> str:
    """Unified LLM call via LiteLLM. Supports any provider: gemini/*, anthropic/*, openai/*, etc."""
    try:
        import litellm
        response = litellm.completion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.warning(f"LLM call failed ({model}): {e}")
        return f"Mocked response for: {prompt}"

@DBOS.transaction()
def init_db():
    DBOS.sql_session.execute(text("""
        CREATE TABLE IF NOT EXISTS agent_runs (
            id BIGSERIAL PRIMARY KEY,
            run_id TEXT,
            agent_id TEXT,
            step TEXT,
            status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    DBOS.sql_session.execute(text("""
        CREATE TABLE IF NOT EXISTS agent_events (
            id BIGSERIAL PRIMARY KEY,
            tenant_id TEXT,
            payload TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    DBOS.sql_session.execute(text("""
        CREATE TABLE IF NOT EXISTS dlq_events (
            id BIGSERIAL PRIMARY KEY,
            run_id TEXT,
            agent_id TEXT,
            error TEXT,
            payload TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    # Create all business tables (GitHub, CommitGuard, marketing, etc.)
    from store import init_business_tables
    init_business_tables()


@DBOS.transaction()
def update_status(run_id: str, agent_id: str, step: str, status: str):
    DBOS.sql_session.execute(
        text("INSERT INTO agent_runs (run_id, agent_id, step, status) "
             "VALUES (:run_id, :agent_id, :step, :status)"),
        {"run_id": run_id, "agent_id": agent_id, "step": step, "status": status}
    )


@DBOS.transaction()
def publish_event(tenant_id: str, payload: dict):
    DBOS.sql_session.execute(
        text("INSERT INTO agent_events (tenant_id, payload) VALUES (:tid, :payload)"),
        {"tid": tenant_id, "payload": json.dumps(payload)}
    )


@DBOS.transaction()
def insert_dlq(run_id: str, agent_id: str, error: str, payload: dict):
    DBOS.sql_session.execute(
        text("INSERT INTO dlq_events (run_id, agent_id, error, payload) "
             "VALUES (:run_id, :agent_id, :error, :payload)"),
        {"run_id": run_id, "agent_id": agent_id, "error": error, "payload": json.dumps(payload)}
    )

class BaseAgent(ABC):
    def __init__(self, goal: str, model: str = MODEL_PLAN, **kwargs):
        self.goal = goal
        self.model = model
        self.agent_id = kwargs.get("agent_id", self.__class__.__name__)
        self.tenant_id = kwargs.get("tenant_id", "default")

    def write_event(self, event_type: str, payload: dict):
        event_data = {
            "agent_id": self.agent_id,
            "event_type": event_type,
            "payload": payload
        }
        publish_event(self.tenant_id, event_data)
        bus.emit(json.dumps(event_data))

    @abstractmethod
    def get_tools(self) -> list:
        pass

    @DBOS.step()
    def plan(self, context: str) -> dict:
        self.write_event("planning", {"context": context, "status": "Planning"})
        prompt = f"Goal: {self.goal}. Context: {context}. Create a 3-step plan."
        plan_text = generate(self.model, prompt)
        plan_dict = {"steps": [f"Step 1: {plan_text[:20]}...", "Step 2: Execute", "Step 3: Review"]}
        self.write_event("plan_created", {"plan_steps": len(plan_dict["steps"]), "status": "Idle"})
        return plan_dict

    @DBOS.step()
    def request_approval(self, payload: dict):
        self.write_event("approval_required", {"status": "Blocked", "diff": payload})

    @DBOS.step()
    def execute(self, plan: dict) -> dict:
        self.write_event("executing", {"status": "Executing"})
        time.sleep(1)
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


@DBOS.workflow()
def scan_suggested_tasks(repo_root: str):
    """Discover TODO/FIXME markers, score each with LLM, persist to DB."""
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


@DBOS.workflow()
def run_scheduled_task(task_id: int, name: str, prompt: str, interval: str):
    """Execute one scheduled task; self-heal on failure (up to 3 retries)."""
    import subprocess
    from store import schedule_mark_ran

    publish_event("default", {"agent_id": f"Scheduler:{name}", "event_type": "task_started",
                               "payload": {"status": "Executing", "prompt": prompt}})
    bus.emit(json.dumps({"agent_id": f"Scheduler:{name}", "event_type": "task_started",
                          "payload": {"status": "Executing", "prompt": prompt}}))

    status = "failed"
    for attempt in range(3):
        cmd_prompt = (
            f"You are an autonomous DevOps agent. Translate this task into a single POSIX shell command.\n"
            f"Task: {prompt}\n"
            f"Reply with ONLY the shell command, nothing else."
        )
        cmd = generate(MODEL_PLAN, cmd_prompt).strip().split("\n")[0]

        try:
            proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
            if proc.returncode == 0:
                status = "success"
                publish_event("default", {"agent_id": f"Scheduler:{name}", "event_type": "task_success",
                                           "payload": {"status": "Success", "attempt": attempt + 1}})
                bus.emit(json.dumps({"agent_id": f"Scheduler:{name}", "event_type": "task_success",
                                      "payload": {"status": "Success", "attempt": attempt + 1}}))
                break
            else:
                heal_prompt = (
                    f"The command `{cmd}` failed with:\n{proc.stderr[:500]}\n"
                    f"Original task: {prompt}\n"
                    f"Reply with a corrected shell command only."
                )
                prompt = f"RETRY: {generate(MODEL_PLAN, heal_prompt).strip().split(chr(10))[0]}"
        except subprocess.TimeoutExpired:
            break

    schedule_mark_ran(task_id, status, interval)
    return {"status": status}


@DBOS.scheduled(cron="* * * * *")
@DBOS.workflow()
def scheduled_dispatcher(scheduled_time: datetime, actual_time: datetime):
    """Runs every minute. Finds due tasks and kicks off their workflows."""
    from store import schedule_get_due
    due = schedule_get_due()
    for task in due:
        DBOS.start_workflow(run_scheduled_task, task["id"], task["name"], task["prompt"], task["interval"])


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

    # Apply patch: checkout branch, apply, commit, push
    repo_root = pathlib.Path(__file__).parent
    try:
        subprocess.run(["git", "checkout", branch], cwd=repo_root, check=True, capture_output=True)
        patch_file = repo_root / ".self_heal.patch"
        patch_file.write_text(patch)
        apply = subprocess.run(["git", "apply", ".self_heal.patch"], cwd=repo_root, capture_output=True, text=True)
        patch_file.unlink(missing_ok=True)
        if apply.returncode != 0:
            raise RuntimeError(f"git apply failed: {apply.stderr}")
        subprocess.run(["git", "add", "-A"], cwd=repo_root, check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", f"fix(self-heal): {root_cause[:72]}"],
            cwd=repo_root, check=True, capture_output=True
        )
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
        plan = agent.plan(context)
        update_status(run_id, agent.agent_id, "planning", "Planning")
        
        agent.request_approval({"add": "+ def secure_func(): return True", "sub": "- def hackable(): pass"})
        update_status(run_id, agent.agent_id, "blocked", "Blocked")
        
        approval = DBOS.recv("approval", timeout_seconds=86400)
        if approval is None:
            update_status(run_id, agent.agent_id, "timeout", "Failed")
            return {"passed": False, "feedback": "Timeout waiting for approval"}
        if not approval.get("approved"):
            update_status(run_id, agent.agent_id, "rejected", "Failed")
            agent.write_event("execution_aborted", {"status": "Failed"})
            return {"passed": False, "feedback": "Rejected by human"}
        
        result = agent.execute(plan)
        update_status(run_id, agent.agent_id, "executing", "Executing")
        
        verdict = agent.review(result)
        if verdict.get("passed"):
            update_status(run_id, agent.agent_id, "complete", "Success")
        else:
            update_status(run_id, agent.agent_id, "failed", "Failed")
            
        return verdict
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

    _update_scan_step(job_id, "clone", 5)
    _cg_emit(job_id, "clone", 5)

    cg_clone(repo_url, tmpdir)

    _update_scan_step(job_id, "scan", 15)
    _cg_emit(job_id, "scan", 15)

    raw_findings, truncated = cg_scan(repo_url, tmpdir, max_findings)
    total_hits = len(raw_findings)

    verified_all = []
    for i, finding in enumerate(raw_findings):
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
