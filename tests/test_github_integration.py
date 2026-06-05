import sqlite3
from urllib.parse import parse_qs, urlparse

from cryptography.fernet import Fernet

from github_integration import (
    authorization_url,
    decrypt_token,
    encrypt_token,
    ensure_github_tables,
)


def test_github_tables_are_created():
    connection = sqlite3.connect(":memory:")
    ensure_github_tables(connection)
    tables = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    assert "github_connections" in tables
    assert "github_imported_repositories" in tables


def test_authorization_url_contains_callback_scope_and_state(monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "client-id")
    monkeypatch.setenv("GITHUB_CALLBACK_URL", "http://localhost/callback")
    monkeypatch.setenv("GITHUB_OAUTH_SCOPE", "read:user repo")

    parsed = urlparse(authorization_url("state-value"))
    query = parse_qs(parsed.query)

    assert parsed.netloc == "github.com"
    assert query["client_id"] == ["client-id"]
    assert query["redirect_uri"] == ["http://localhost/callback"]
    assert query["scope"] == ["read:user repo"]
    assert query["state"] == ["state-value"]


def test_token_is_encrypted_at_rest(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())

    encrypted = encrypt_token("github-token")

    assert encrypted != "github-token"
    assert decrypt_token(encrypted) == "github-token"
