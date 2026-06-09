"""
agents/metagpt/bridge.py

STATUS: NOT YET WIRED UP — no API route or DBOS workflow calls this module.
The bridge and runner are complete but integration was deferred. To activate:
  1. Add a POST /api/metagpt/run endpoint in api.py
  2. Create a DBOS workflow in main.py that calls run_software_company()
     or run_data_interpreter() from this bridge
  3. Set up vendor/metagpt/.venv (see vendor/metagpt/README.md)

Spawns runner.py inside vendor/metagpt/.venv via subprocess.
JSON in via stdin, JSON out via stdout — no shared imports.
"""

import json
import logging
import os
import pathlib
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)

# Absolute path so this works regardless of cwd
_REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
_VENV_PYTHON = _REPO_ROOT / "vendor" / "metagpt" / ".venv" / "bin" / "python"
_RUNNER = pathlib.Path(__file__).parent / "runner.py"


def _call(payload: dict, timeout: int = 600) -> dict:
    """
    Invoke runner.py in the MetaGPT venv.
    Passes OPENAI_API_KEY / ANTHROPIC_API_KEY from the current env.
    Raises RuntimeError on non-zero exit or JSON parse failure.
    """
    if not _VENV_PYTHON.exists():
        raise RuntimeError(
            f"MetaGPT venv not found at {_VENV_PYTHON}. "
            "Run: cd vendor/metagpt && python3 -m venv .venv && .venv/bin/pip install -e ."
        )

    env = {
        **os.environ,
        "PYTHONPATH": str(_REPO_ROOT / "vendor" / "metagpt"),
    }

    result = subprocess.run(
        [str(_VENV_PYTHON), str(_RUNNER)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"MetaGPT runner failed (exit {result.returncode}):\n{result.stderr[:1000]}"
        )

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"MetaGPT runner returned non-JSON output:\n{result.stdout[:500]}"
        ) from exc


def ping() -> bool:
    """Health check — returns True if MetaGPT venv is working."""
    try:
        r = _call({"cmd": "ping"}, timeout=30)
        return r.get("status") == "ok"
    except Exception as e:
        logger.warning(f"MetaGPT ping failed: {e}")
        return False


def run_software_company(requirement: str, output_dir: Optional[str] = None) -> dict:
    """
    Run the MetaGPT software company on a requirement.
    Returns {"status": "done", "output_dir": "...", "files": [...]}
    """
    import uuid
    if output_dir is None:
        output_dir = f"/tmp/metagpt-{uuid.uuid4().hex[:8]}"

    logger.info(f"MetaGPT software_company: {requirement[:80]}...")
    return _call(
        {"cmd": "software_company", "requirement": requirement, "output_dir": output_dir},
        timeout=600,
    )


def run_data_interpreter(requirement: str) -> dict:
    """
    Run the MetaGPT Data Interpreter on a data analysis requirement.
    Returns {"status": "done", "result": "..."}
    """
    logger.info(f"MetaGPT data_interpreter: {requirement[:80]}...")
    return _call(
        {"cmd": "data_interpreter", "requirement": requirement},
        timeout=300,
    )
