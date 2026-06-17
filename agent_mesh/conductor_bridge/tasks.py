from conductor.client.worker.worker_task import worker_task
import os
import sys

# Add parent directory to path so we can import from main/agents
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import existing functions from main.py and agent modules
from agents.commitguard.scanner import _ensure_repo, scan
from agents.commitguard.verifier import verify
from agents.commitguard.github_client import file_issue
import shutil

@worker_task(task_definition_name='cg_clone')
def cg_clone(repo_url: str, tmpdir: str) -> dict:
    """Clone the repo into tmpdir."""
    _ensure_repo(repo_url, tmpdir)
    return {"status": "cloned", "tmpdir": tmpdir}

@worker_task(task_definition_name='cg_scan')
def cg_scan(repo_url: str, tmpdir: str, max_findings: int) -> dict:
    """Run Semgrep + LLM triage."""
    raw_findings, truncated = scan(repo_url, tmpdir, max_findings)
    return {
        "raw_findings": raw_findings,
        "truncated": truncated,
        "total_hits": len(raw_findings)
    }

@worker_task(task_definition_name='cg_verify')
def cg_verify(finding: dict, repo_url: str) -> dict:
    """Run E2B PoC for one finding."""
    return verify(finding, repo_url)

@worker_task(task_definition_name='cg_file_issue')
def cg_file_issue(vf: dict, repo_url: str, github_token: str) -> dict:
    """File a GitHub issue for a CONFIRMED finding."""
    return file_issue(vf, repo_url, github_token)

@worker_task(task_definition_name='cg_cleanup')
def cg_cleanup(tmpdir: str) -> dict:
    """Cleanup the temporary directory."""
    shutil.rmtree(tmpdir, ignore_errors=True)
    return {"status": "cleaned up"}
