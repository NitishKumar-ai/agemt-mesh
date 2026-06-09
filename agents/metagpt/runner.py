"""
agents/metagpt/runner.py

Runs inside vendor/metagpt/.venv — NEVER import from main app here.
Called by bridge.py via subprocess with JSON stdin, returns JSON stdout.

Commands:
  {"cmd": "software_company", "requirement": "...", "output_dir": "/tmp/..."}
  {"cmd": "data_interpreter",  "requirement": "..."}
  {"cmd": "ping"}
"""

import asyncio
import json
import sys
import os


def _configure():
    """Set up MetaGPT config from env vars passed by bridge.py."""
    from metagpt.config2 import Config
    from metagpt.configs.llm_config import LLMConfig, LLMType

    cfg = Config.default()
    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or ""
    api_type = "openai" if os.environ.get("OPENAI_API_KEY") else "anthropic"
    model = os.environ.get("METAGPT_MODEL", "gpt-4-turbo" if api_type == "openai" else "claude-sonnet-4-6")

    cfg.llm = LLMConfig(
        api_type=api_type,
        model=model,
        api_key=api_key,
    )
    return cfg


async def _run_software_company(requirement: str, output_dir: str) -> dict:
    from metagpt.software_company import generate_repo
    from metagpt.utils.project_repo import ProjectRepo

    os.makedirs(output_dir, exist_ok=True)
    repo: ProjectRepo = await asyncio.to_thread(
        generate_repo, requirement, project_path=output_dir
    )
    files = []
    for path in repo.workdir.rglob("*"):
        if path.is_file():
            files.append(str(path.relative_to(repo.workdir)))
    return {
        "status": "done",
        "output_dir": str(repo.workdir),
        "files": files[:50],   # cap for JSON size
    }


async def _run_data_interpreter(requirement: str) -> dict:
    from metagpt.roles.di.data_interpreter import DataInterpreter

    di = DataInterpreter()
    result = await di.run(requirement)
    return {"status": "done", "result": str(result)}


def main():
    payload = json.loads(sys.stdin.read())
    cmd = payload.get("cmd", "ping")

    if cmd == "ping":
        print(json.dumps({"status": "ok", "cmd": "ping"}))
        return

    _configure()

    if cmd == "software_company":
        result = asyncio.run(
            _run_software_company(
                payload["requirement"],
                payload.get("output_dir", "/tmp/metagpt_output"),
            )
        )
    elif cmd == "data_interpreter":
        result = asyncio.run(_run_data_interpreter(payload["requirement"]))
    else:
        result = {"status": "error", "detail": f"Unknown command: {cmd}"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
