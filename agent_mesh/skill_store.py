"""
skill_store.py — Persistence and management of learned skills (Hermes pattern).
Allows agents to extract successful tool-use patterns into durable markdown files.
"""
import os
import re
import json
import logging
from typing import List, Optional
from pydantic import BaseModel

logger = logging.getLogger(__name__)

SKILLS_DIR = os.path.expanduser("~/.agent_mesh/skills/")

class Skill(BaseModel):
    name: str
    description: str
    tool_calls: List[dict]
    outcomes: List[str]
    markdown_path: str

def init_skill_store():
    os.makedirs(SKILLS_DIR, exist_ok=True)

def _slug(name: str) -> str:
    """Filesystem-safe slug. Strips path separators / traversal so an
    LLM-supplied skill name can never escape SKILLS_DIR (path traversal)."""
    base = os.path.basename(name).lower()
    slug = re.sub(r"[^a-z0-9_]+", "_", base).strip("_")
    return slug or "skill"

def save_skill(name: str, description: str, steps: List[dict], outcomes: List[dict]):
    """
    Hermes pattern: Codify a successful execution path into a permanent Skill.
    """
    filename = _slug(name) + ".md"
    path = os.path.join(SKILLS_DIR, filename)
    
    content = f"# Skill: {name}\n\n"
    content += f"## Description\n{description}\n\n"
    content += "## Steps\n"
    for i, (s, o) in enumerate(zip(steps, outcomes)):
        content += f"### Step {i+1}: {s.get('tool', 'unknown')}\n"
        content += f"**Thought:** {s.get('thought', 'N/A')}\n"
        content += f"**Args:** `{json.dumps(s.get('args', {}))}`\n"
        content += f"**Outcome:** {o.get('result', 'N/A')[:500]}...\n\n"

    try:
        with open(path, "w") as f:
            f.write(content)
        logger.info("Saved skill to %s", path)
    except Exception as e:
        logger.error("Failed to save skill %s: %s", name, e)

def list_skills() -> List[str]:
    if not os.path.exists(SKILLS_DIR):
        return []
    return [f for f in os.listdir(SKILLS_DIR) if f.endswith(".md")]

def get_skill_content(filename: str) -> Optional[str]:
    path = os.path.join(SKILLS_DIR, filename)
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return f.read()
