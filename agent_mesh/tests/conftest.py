"""
conftest.py — shared pytest fixtures and patches for the Agent Mesh test suite.

Patches applied at session scope (before any module is imported by tests):

1. langfuse.observe → no-op decorator
   Langfuse initialises its HTTP client on the first @observe-decorated call and
   raises ValueError if LANGFUSE_SAMPLE_RATE is empty/unset. In unit tests we
   have no Langfuse credentials, so the decorator becomes a pass-through.

2. LANGFUSE_SAMPLE_RATE env var → "1.0"
   Belt-and-suspenders: even if something imports langfuse before the mock lands,
   the env var prevents the ValueError.
"""

import os
import sys
from unittest.mock import MagicMock

# ── 1. Set env vars before any import that might trigger langfuse/e2b init ───
os.environ.setdefault("LANGFUSE_SAMPLE_RATE", "1.0")
os.environ.setdefault("LANGFUSE_SECRET_KEY", "test-secret")
os.environ.setdefault("LANGFUSE_PUBLIC_KEY", "test-public")
# e2b reads E2B_TIMEOUT as int at import time; provide a default
os.environ.setdefault("E2B_API_KEY", "test-e2b-key")


# ── 2. Stub e2b_code_interpreter before it is imported ───────────────────────
# e2b reads numeric env vars at module import time and raises ValueError when
# they are empty strings. We replace the whole package with a MagicMock so the
# `from e2b_code_interpreter import Sandbox` inside verifier.py succeeds.
# Individual tests that need Sandbox behaviour patch it themselves.
if "e2b_code_interpreter" not in sys.modules:
    _e2b_stub = MagicMock()
    _e2b_stub.Sandbox = MagicMock()
    sys.modules["e2b_code_interpreter"] = _e2b_stub
    sys.modules["e2b"] = MagicMock()
    sys.modules["e2b.api"] = MagicMock()


# ── 2. Replace langfuse.observe with a no-op decorator ───────────────────────

def _noop_observe(name=None, **_kw):
    """No-op replacement for langfuse.observe."""
    def decorator(fn):
        return fn
    return decorator


# Patch at the sys.modules level so any `from langfuse import observe` or
# `from langfuse.decorators import observe` picks up the stub.
_langfuse_stub = MagicMock()
_langfuse_stub.observe = _noop_observe
_langfuse_stub.decorators = MagicMock()
_langfuse_stub.decorators.observe = _noop_observe

# Only override if the real module hasn't been imported yet, or wrap it.
if "langfuse" not in sys.modules:
    sys.modules["langfuse"] = _langfuse_stub
    sys.modules["langfuse.decorators"] = _langfuse_stub.decorators
else:
    # Module already loaded — patch just the observe symbol so @observe is safe.
    import langfuse as _lf
    _lf.observe = _noop_observe
    if hasattr(_lf, "decorators"):
        _lf.decorators.observe = _noop_observe
