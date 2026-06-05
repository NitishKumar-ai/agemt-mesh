import logging
import os
import secrets
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

GITHUB_API_URL = "https://api.github.com"
GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"


class GitHubConfigurationError(RuntimeError):
    pass


def ensure_github_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS github_connections (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            github_user_id INTEGER NOT NULL,
            login TEXT NOT NULL,
            name TEXT,
            avatar_url TEXT,
            html_url TEXT,
            token_encrypted TEXT NOT NULL,
            scopes TEXT,
            connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS github_imported_repositories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            github_repo_id INTEGER NOT NULL UNIQUE,
            full_name TEXT NOT NULL,
            html_url TEXT NOT NULL,
            default_branch TEXT,
            private INTEGER DEFAULT 0,
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()


def github_config_status() -> Dict[str, Any]:
    configured = bool(
        os.environ.get("GITHUB_CLIENT_ID")
        and os.environ.get("GITHUB_CLIENT_SECRET")
        and os.environ.get("GITHUB_TOKEN_ENCRYPTION_KEY")
    )
    return {
        "configured": configured,
        "callback_url": os.environ.get(
            "GITHUB_CALLBACK_URL", "http://127.0.0.1:8000/api/github/callback"
        ),
    }


def create_oauth_state() -> str:
    return secrets.token_urlsafe(32)


def authorization_url(state: str) -> str:
    client_id = os.environ.get("GITHUB_CLIENT_ID")
    if not client_id:
        raise GitHubConfigurationError("GITHUB_CLIENT_ID is not configured")
    params = {
        "client_id": client_id,
        "redirect_uri": github_config_status()["callback_url"],
        "scope": os.environ.get("GITHUB_OAUTH_SCOPE", "read:user repo"),
        "state": state,
        "allow_signup": "true",
    }
    return f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"


def _fernet() -> Fernet:
    key = os.environ.get("GITHUB_TOKEN_ENCRYPTION_KEY")
    if not key:
        raise GitHubConfigurationError("GITHUB_TOKEN_ENCRYPTION_KEY is not configured")
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError) as exc:
        raise GitHubConfigurationError(
            "GITHUB_TOKEN_ENCRYPTION_KEY must be a valid Fernet key"
        ) from exc


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(token_encrypted: str) -> str:
    try:
        return _fernet().decrypt(token_encrypted.encode()).decode()
    except InvalidToken as exc:
        raise GitHubConfigurationError("Stored GitHub token could not be decrypted") from exc


async def exchange_code(code: str) -> Dict[str, Any]:
    client_id = os.environ.get("GITHUB_CLIENT_ID")
    client_secret = os.environ.get("GITHUB_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise GitHubConfigurationError("GitHub OAuth client credentials are not configured")

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": github_config_status()["callback_url"],
            },
        )
        response.raise_for_status()
        payload = response.json()
    if "access_token" not in payload:
        raise RuntimeError(payload.get("error_description") or "GitHub did not return an access token")
    return payload


async def github_get(token: str, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{GITHUB_API_URL}{path}",
            params=params,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        response.raise_for_status()
        return response.json()


async def get_authenticated_user(token: str) -> Dict[str, Any]:
    return await github_get(token, "/user")


async def list_repositories(token: str) -> List[Dict[str, Any]]:
    repositories = await github_get(
        token,
        "/user/repos",
        {"affiliation": "owner,collaborator,organization_member", "sort": "updated", "per_page": 100},
    )
    return [
        {
            "id": repo["id"],
            "name": repo["name"],
            "full_name": repo["full_name"],
            "description": repo.get("description"),
            "private": repo["private"],
            "html_url": repo["html_url"],
            "default_branch": repo.get("default_branch"),
            "updated_at": repo.get("updated_at"),
            "language": repo.get("language"),
        }
        for repo in repositories
    ]


async def revoke_token(token: str) -> None:
    client_id = os.environ.get("GITHUB_CLIENT_ID")
    client_secret = os.environ.get("GITHUB_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise GitHubConfigurationError("GitHub OAuth client credentials are not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.delete(
            f"{GITHUB_API_URL}/applications/{client_id}/token",
            auth=(client_id, client_secret),
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={"access_token": token},
        )
        response.raise_for_status()


def save_connection(conn: sqlite3.Connection, user: Dict[str, Any], token: str, scopes: str) -> None:
    conn.execute(
        """
        INSERT INTO github_connections (
            id, github_user_id, login, name, avatar_url, html_url, token_encrypted, scopes, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            github_user_id=excluded.github_user_id,
            login=excluded.login,
            name=excluded.name,
            avatar_url=excluded.avatar_url,
            html_url=excluded.html_url,
            token_encrypted=excluded.token_encrypted,
            scopes=excluded.scopes,
            updated_at=excluded.updated_at
        """,
        [
            user["id"],
            user["login"],
            user.get("name"),
            user.get("avatar_url"),
            user.get("html_url"),
            encrypt_token(token),
            scopes,
            datetime.utcnow().isoformat(),
        ],
    )
    conn.commit()


def get_connection(conn: sqlite3.Connection) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT github_user_id, login, name, avatar_url, html_url, token_encrypted, scopes, connected_at "
        "FROM github_connections WHERE id=1"
    ).fetchone()
    return dict(row) if row else None


def get_access_token(conn: sqlite3.Connection) -> str:
    connection = get_connection(conn)
    if not connection:
        raise GitHubConfigurationError("GitHub account is not connected")
    return decrypt_token(connection["token_encrypted"])
