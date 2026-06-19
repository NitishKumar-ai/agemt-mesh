"""Shared Gemini model resolution for LiteLLM calls."""

from __future__ import annotations

import os

# Stable default — https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
STABLE_GEMINI = "gemini/gemini-2.5-flash"

# Retired / unsupported slugs seen in the wild
_DEPRECATED_MARKERS = (
    "flash-lite-preview",
    "flash-lite-preview-06-17",
    "gemini-2.5-flash-preview",
    "gemini-2.5-flash-preview-09-2025",
)


def normalize_gemini_model(name: str | None) -> str:
    """Map retired preview models to stable gemini-2.5-flash."""
    raw = (name or STABLE_GEMINI).strip()
    if not raw.startswith("gemini/"):
        raw = f"gemini/{raw}"
    bare = raw.removeprefix("gemini/")
    if any(marker in bare for marker in _DEPRECATED_MARKERS):
        return STABLE_GEMINI
    return raw


def resolve_gemini_model() -> str:
    """Model for Social Studio / Gemini content generation — always stable Flash."""
    # Social Studio must not inherit stale MODEL_PLAN preview slugs from the environment.
    return STABLE_GEMINI
