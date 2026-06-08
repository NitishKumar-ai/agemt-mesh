"""
CommitGuard unit tests — all external calls mocked.
Covers the 18 gaps identified in the eng review coverage diagram.
"""

import json
import os
import subprocess
import unittest
from unittest.mock import MagicMock, patch, AsyncMock


# ── scanner.py ───────────────────────────────────────────────────────────────

class TestEnsureRepo(unittest.TestCase):
    def test_skips_clone_if_git_dir_exists(self, tmp_path=None):
        import tempfile, os
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, ".git"))
            from agents.commitguard.scanner import _ensure_repo
            # Should not raise or call git
            with patch("subprocess.run") as mock_run:
                _ensure_repo("https://github.com/x/y", d)
                mock_run.assert_not_called()

    def test_clones_when_git_dir_missing(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            clone_dir = os.path.join(d, "repo")
            from agents.commitguard.scanner import _ensure_repo
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=0)
                _ensure_repo("https://github.com/x/y", clone_dir)
            call_args = mock_run.call_args[0][0]
            assert call_args[0] == "git"
            assert "shell" not in mock_run.call_args.kwargs or not mock_run.call_args.kwargs.get("shell")

    def test_raises_on_clone_failure(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            clone_dir = os.path.join(d, "repo")
            from agents.commitguard.scanner import _ensure_repo
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=128, stderr="fatal: not found")
                with self.assertRaises(RuntimeError):
                    _ensure_repo("https://github.com/x/y", clone_dir)

    def test_raises_on_timeout(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            clone_dir = os.path.join(d, "repo")
            from agents.commitguard.scanner import _ensure_repo
            with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("git", 120)):
                with self.assertRaises(RuntimeError, msg="git clone timed out"):
                    _ensure_repo("https://github.com/x/y", clone_dir)


class TestRunSemgrep(unittest.TestCase):
    def test_returns_empty_if_semgrep_not_installed(self):
        from agents.commitguard.scanner import _run_semgrep
        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = _run_semgrep("/tmp/fake")
        self.assertEqual(result, [])

    def test_returns_empty_on_timeout(self):
        from agents.commitguard.scanner import _run_semgrep
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("semgrep", 180)):
            result = _run_semgrep("/tmp/fake")
        self.assertEqual(result, [])

    def test_returns_empty_on_empty_output(self):
        from agents.commitguard.scanner import _run_semgrep
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
            result = _run_semgrep("/tmp/fake")
        self.assertEqual(result, [])

    def test_parses_semgrep_json(self):
        from agents.commitguard.scanner import _run_semgrep
        semgrep_output = json.dumps({"results": [{"check_id": "sql-injection",
                                                    "path": "app.py",
                                                    "start": {"line": 10},
                                                    "extra": {"message": "SQL injection", "severity": "ERROR"}}]})
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout=semgrep_output)
            result = _run_semgrep("/tmp/fake")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["check_id"], "sql-injection")

    def test_uses_no_shell_true(self):
        from agents.commitguard.scanner import _run_semgrep
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout=json.dumps({"results": []}))
            _run_semgrep("/tmp/fake")
        kwargs = mock_run.call_args.kwargs
        self.assertFalse(kwargs.get("shell", False), "Must not use shell=True")


# ── verifier.py ──────────────────────────────────────────────────────────────

class TestVerifier(unittest.TestCase):
    def _sample_finding(self, category="sql_injection"):
        return {
            "id": "test-id-1",
            "file": "app.py",
            "line": 42,
            "severity": "HIGH",
            "vuln_type": "sql_injection",
            "category": category,
            "description": "SQL injection via string concatenation",
        }

    def test_unverifiable_category_skips_e2b(self):
        from agents.commitguard.verifier import verify
        finding = self._sample_finding("unverifiable")
        # verifier.py calls generate() directly — no get_model_client wrapper
        with patch("agents.commitguard.verifier.generate", return_value="CVSS: 6.5 MEDIUM\nCWE: CWE-79"):
            with patch("agents.commitguard.verifier.os.environ.get", return_value=""):
                result = verify(finding, "https://github.com/x/y")
        self.assertEqual(result["verdict"], "UNVERIFIABLE")

    def test_confirmed_on_exploit_marker(self):
        from agents.commitguard.verifier import verify, EXPLOIT_MARKER
        finding = self._sample_finding("sql_injection")
        mock_exec = MagicMock()
        mock_exec.logs.stdout = [EXPLOIT_MARKER]
        mock_exec.error = None
        mock_sandbox = MagicMock()
        mock_sandbox.__enter__ = MagicMock(return_value=mock_sandbox)
        mock_sandbox.__exit__ = MagicMock(return_value=False)
        mock_sandbox.run_code.return_value = mock_exec
        # generate() is called twice: once for PoC script, once for CVSS
        with patch("agents.commitguard.verifier.generate",
                   side_effect=["print('EXPLOIT_CONFIRMED')", "CVSS: 8.1 HIGH\nCWE: CWE-89"]):
            with patch("agents.commitguard.verifier.os.environ.get", return_value=""):
                with patch("e2b_code_interpreter.Sandbox", return_value=mock_sandbox):
                    result = verify(finding, "https://github.com/x/y")
        self.assertEqual(result["verdict"], "CONFIRMED")

    def test_unverifiable_on_e2b_missing_api_key(self):
        from agents.commitguard.verifier import verify
        finding = self._sample_finding()
        with patch("agents.commitguard.verifier.generate",
                   side_effect=["print('test')", "CVSS: 8.1 HIGH\nCWE: CWE-89"]):
            with patch("agents.commitguard.verifier.os.environ.get", return_value=""):
                with patch("e2b_code_interpreter.Sandbox", side_effect=Exception("API key missing")):
                    result = verify(finding, "https://github.com/x/y")
        self.assertEqual(result["verdict"], "UNVERIFIABLE")

    def test_unverifiable_on_e2b_network_error(self):
        from agents.commitguard.verifier import verify
        finding = self._sample_finding()
        with patch("agents.commitguard.verifier.generate",
                   side_effect=["print('test')", "CVSS: 8.1 HIGH\nCWE: CWE-89"]):
            with patch("agents.commitguard.verifier.os.environ.get", return_value=""):
                with patch("e2b_code_interpreter.Sandbox", side_effect=Exception("Connection refused")):
                    result = verify(finding, "https://github.com/x/y")
        self.assertEqual(result["verdict"], "UNVERIFIABLE")

    def test_webhook_fires_on_confirmed(self):
        from agents.commitguard.verifier import verify, EXPLOIT_MARKER
        finding = self._sample_finding()
        mock_exec = MagicMock()
        mock_exec.logs.stdout = [EXPLOIT_MARKER]
        mock_exec.error = None
        mock_sandbox = MagicMock()
        mock_sandbox.__enter__ = MagicMock(return_value=mock_sandbox)
        mock_sandbox.__exit__ = MagicMock(return_value=False)
        mock_sandbox.run_code.return_value = mock_exec
        with patch("agents.commitguard.verifier.generate",
                   side_effect=["print('EXPLOIT_CONFIRMED')", "CVSS: 8.1 HIGH\nCWE: CWE-89"]):
            with patch("agents.commitguard.verifier.os.environ.get",
                       return_value="https://hooks.slack.com/test"):
                with patch("e2b_code_interpreter.Sandbox", return_value=mock_sandbox):
                    with patch("agents.commitguard.verifier.httpx.post") as mock_post:
                        mock_post.return_value = MagicMock(status_code=200)
                        result = verify(finding, "https://github.com/x/y")
        self.assertTrue(result["webhook_fired"])

    def test_webhook_silent_on_invalid_url(self):
        from agents.commitguard.verifier import verify, EXPLOIT_MARKER
        finding = self._sample_finding()
        mock_exec = MagicMock()
        mock_exec.logs.stdout = [EXPLOIT_MARKER]
        mock_exec.error = None
        mock_sandbox = MagicMock()
        mock_sandbox.__enter__ = MagicMock(return_value=mock_sandbox)
        mock_sandbox.__exit__ = MagicMock(return_value=False)
        mock_sandbox.run_code.return_value = mock_exec
        with patch("agents.commitguard.verifier.generate",
                   side_effect=["print('EXPLOIT_CONFIRMED')", "CVSS: 8.1 HIGH\nCWE: CWE-89"]):
            with patch("agents.commitguard.verifier.os.environ.get",
                       return_value="https://bad-webhook.invalid"):
                with patch("e2b_code_interpreter.Sandbox", return_value=mock_sandbox):
                    with patch("agents.commitguard.verifier.httpx.post",
                               side_effect=Exception("Connection error")):
                        result = verify(finding, "https://github.com/x/y")
        # Should not crash; webhook_fired is False
        self.assertFalse(result["webhook_fired"])


# ── github_client.py ─────────────────────────────────────────────────────────

class TestGitHubClient(unittest.TestCase):
    def _sample_vf(self):
        return {
            "finding_id": "test-id-1",
            "file": "app.py",
            "line": 42,
            "severity": "HIGH",
            "vuln_type": "sql_injection",
            "category": "sql_injection",
            "description": "SQL injection",
            "verdict": "CONFIRMED",
            "poc_summary": "PoC confirmed.",
            "cvss": "8.1 HIGH (AI-estimated)",
            "cwe": "CWE-89",
            "webhook_fired": True,
        }

    def test_files_issue_successfully(self):
        from agents.commitguard.github_client import file_issue
        # github_client.py calls generate() directly — no get_model_client wrapper
        with patch("agents.commitguard.github_client.generate", return_value="--- a/app.py\n+++ b/app.py"):
            with patch("agents.commitguard.github_client.asyncio.run") as mock_run:
                mock_run.return_value = {"status": 201, "data": {"html_url": "https://github.com/x/y/issues/1"}}
                result = file_issue(self._sample_vf(), "https://github.com/owner/repo", "token123")
        self.assertTrue(result["issue_filed"])
        self.assertEqual(result["github_issue_url"], "https://github.com/x/y/issues/1")

    def test_graceful_on_403_no_write_access(self):
        from agents.commitguard.github_client import file_issue
        with patch("agents.commitguard.github_client.generate", return_value="diff"):
            with patch("agents.commitguard.github_client.asyncio.run") as mock_run:
                mock_run.return_value = {"status": 403, "data": {"message": "Forbidden"}}
                result = file_issue(self._sample_vf(), "https://github.com/owner/repo", "token123")
        self.assertFalse(result["issue_filed"])
        self.assertIsNone(result["github_issue_url"])

    def test_retries_on_429(self):
        from agents.commitguard.github_client import file_issue
        calls = [
            {"status": 429, "data": {"retry_after": 1}},
            {"status": 201, "data": {"html_url": "https://github.com/x/y/issues/2"}},
        ]
        with patch("agents.commitguard.github_client.generate", return_value="diff"):
            with patch("agents.commitguard.github_client.asyncio.run", side_effect=calls):
                with patch("agents.commitguard.github_client.time.sleep"):
                    result = file_issue(self._sample_vf(), "https://github.com/owner/repo", "token123")
        self.assertTrue(result["issue_filed"])

    def test_graceful_on_exception(self):
        from agents.commitguard.github_client import file_issue
        with patch("agents.commitguard.github_client.generate", return_value="diff"):
            with patch("agents.commitguard.github_client.asyncio.run", side_effect=Exception("network error")):
                result = file_issue(self._sample_vf(), "https://github.com/owner/repo", "token123")
        self.assertFalse(result["issue_filed"])


# ── API endpoints ─────────────────────────────────────────────────────────────

class TestCommitGuardAPI(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        import api as api_module
        self.client = TestClient(api_module.app)

    def test_scan_rejects_non_github_url(self):
        resp = self.client.post("/api/commitguard/scan", json={"repo_url": "https://gitlab.com/x/y"})
        self.assertEqual(resp.status_code, 400)

    def test_scan_rejects_empty_url(self):
        resp = self.client.post("/api/commitguard/scan", json={"repo_url": ""})
        self.assertEqual(resp.status_code, 400)

    def test_findings_404_on_unknown_job(self):
        # Mock the DBOS transaction so tests run without a real DB / DBOS init
        with patch("api.commitguard_get_scan_with_findings", return_value=None):
            resp = self.client.get("/api/commitguard/findings/nonexistent-job-id")
        self.assertEqual(resp.status_code, 404)

    def test_stream_404_on_unknown_job(self):
        with patch("api.commitguard_get_scan", return_value=None):
            resp = self.client.get("/api/commitguard/stream/nonexistent-job-id")
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
