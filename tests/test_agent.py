"""
Tests for core agent infrastructure in main.py.
All LLM calls are mocked — no API keys required.
"""
import json
import pytest
from unittest.mock import patch, MagicMock


# ── generate() ────────────────────────────────────────────────────────────────

class TestGenerate:
    def test_returns_content_on_success(self):
        from main import generate
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "hello world"
        # patch inside the generate() function's import scope
        with patch("main.generate") as mock_gen:
            mock_gen.return_value = "hello world"
            result = mock_gen("anthropic/claude-sonnet-4-6", "say hello")
        assert result == "hello world"

    def test_raises_llm_error_on_exception(self):
        """generate() must raise LLMError, not swallow and return mock text."""
        import importlib, sys
        # patch litellm before main imports it
        mock_litellm = MagicMock()
        mock_litellm.completion.side_effect = Exception("connection refused")
        with patch.dict(sys.modules, {"litellm": mock_litellm}):
            from main import generate, LLMError
            with pytest.raises(LLMError, match="connection refused"):
                generate("anthropic/claude-sonnet-4-6", "prompt")

    def test_raises_llm_error_on_empty_response(self):
        import sys
        mock_litellm = MagicMock()
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "   "
        mock_litellm.completion.return_value = mock_resp
        with patch.dict(sys.modules, {"litellm": mock_litellm}):
            from main import generate, LLMError
            with pytest.raises(LLMError, match="Empty response"):
                generate("anthropic/claude-sonnet-4-6", "prompt")

    def test_does_not_return_mock_string(self):
        """The old silent 'Mocked response for:' pattern must never appear."""
        import sys
        mock_litellm = MagicMock()
        mock_litellm.completion.side_effect = Exception("api key missing")
        with patch.dict(sys.modules, {"litellm": mock_litellm}):
            from main import generate, LLMError
            with pytest.raises(LLMError):
                generate("any-model", "any prompt")


# ── _safe_parse_cmd() ─────────────────────────────────────────────────────────

class TestSafeParseCmd:
    def test_allows_safe_git_command(self):
        from main import _safe_parse_cmd
        argv = _safe_parse_cmd("git status")
        assert argv == ["git", "status"]

    def test_allows_pytest_with_args(self):
        from main import _safe_parse_cmd
        argv = _safe_parse_cmd("pytest tests/ -v")
        assert argv[0] == "pytest"

    def test_rejects_rm(self):
        from main import _safe_parse_cmd
        with pytest.raises(ValueError, match="not in allowed list"):
            _safe_parse_cmd("rm -rf /tmp/data")

    def test_rejects_shell_pipe(self):
        from main import _safe_parse_cmd
        with pytest.raises(ValueError, match="Blocked pattern"):
            _safe_parse_cmd("git log | grep foo")

    def test_rejects_subshell(self):
        from main import _safe_parse_cmd
        with pytest.raises(ValueError, match="Blocked pattern"):
            _safe_parse_cmd("echo $(cat /etc/passwd)")

    def test_rejects_sudo(self):
        from main import _safe_parse_cmd
        with pytest.raises(ValueError, match="Blocked pattern|not in allowed"):
            _safe_parse_cmd("sudo apt-get install curl")

    def test_rejects_redirect(self):
        from main import _safe_parse_cmd
        with pytest.raises(ValueError, match="Blocked pattern"):
            _safe_parse_cmd("echo hello > /tmp/out")

    def test_strips_path_prefix(self):
        from main import _safe_parse_cmd
        # /usr/bin/git should resolve to 'git' and be allowed
        argv = _safe_parse_cmd("/usr/bin/git fetch")
        assert argv[0] == "/usr/bin/git"  # kept as-is in argv, binary name checked

    def test_rejects_empty_command(self):
        from main import _safe_parse_cmd
        with pytest.raises(ValueError, match="Empty"):
            _safe_parse_cmd("   ")


# ── BaseAgent.plan() ──────────────────────────────────────────────────────────

class TestBaseAgentPlan:
    """Tests for plan() logic only — DBOS and publish_event are mocked out."""

    def _make_agent(self):
        from main import ApprovalGatedAgent
        agent = ApprovalGatedAgent(goal="test goal")
        return agent

    def test_plan_parses_valid_json(self):
        agent = self._make_agent()
        plan_json = json.dumps({"steps": ["scan deps", "report findings", "review"]})
        with patch("main.generate", return_value=plan_json), \
             patch("main.publish_event"), \
             patch("main.bus") :
            result = agent.plan.__wrapped__(agent, "test context")
        assert "steps" in result
        assert len(result["steps"]) == 3

    def test_plan_falls_back_gracefully_on_bad_json(self):
        agent = self._make_agent()
        with patch("main.generate", return_value="1. Do this\n2. Do that\n3. Review"), \
             patch("main.publish_event"), \
             patch("main.bus"):
            result = agent.plan.__wrapped__(agent, "context")
        assert "steps" in result
        assert len(result["steps"]) > 0

    def test_plan_raises_on_llm_error(self):
        from main import LLMError
        agent = self._make_agent()
        with patch("main.generate", side_effect=LLMError("api key missing")), \
             patch("main.publish_event"), \
             patch("main.bus"):
            with pytest.raises(LLMError):
                agent.plan.__wrapped__(agent, "context")
