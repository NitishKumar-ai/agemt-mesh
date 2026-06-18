"""
Connector registry — defines all available integration providers.

Each ConnectorConfig describes what the UI renders on the Connections page.
Each BaseConnector subclass implements .test() to verify credentials.

api.py imports: `from agent_mesh.connectors import registry`
(Running under uvicorn with cwd=agent_mesh, so this resolves as a local module.)
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Type
import requests


# ── Schema types ─────────────────────────────────────────────────────────────

@dataclass
class ConfigField:
    name: str
    label: str
    type: str          # "text" | "password" | "url"
    required: bool = True
    placeholder: str = ""
    help: str = ""

    def model_dump(self) -> dict:
        return asdict(self)


@dataclass
class ConnectorConfig:
    provider_id: str
    connector_type: str   # "direct" | "mcp" | "oauth"
    name: str
    description: str
    icon: str
    category: str
    auth_type: str        # "apikey" | "oauth" | "basic" | "none"
    config_schema: List[ConfigField] = field(default_factory=list)

    def model_dump(self) -> dict:
        d = asdict(self)
        d["config_schema"] = [f.model_dump() for f in self.config_schema]
        return d


# ── Base connector ────────────────────────────────────────────────────────────

class BaseConnector:
    def __init__(self, config: Dict[str, Any]):
        self.config = config

    def test(self) -> bool:
        """Return True if the credentials are valid. Called in a thread."""
        return True


# ── Concrete connectors ───────────────────────────────────────────────────────

class GitHubConnector(BaseConnector):
    def test(self) -> bool:
        token = self.config.get("token", "")
        if not token:
            return False
        r = requests.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            timeout=8,
        )
        return r.status_code == 200


class HostingerConnector(BaseConnector):
    def test(self) -> bool:
        api_key = self.config.get("api_key", "")
        if not api_key:
            return False
        r = requests.get(
            "https://api.hostinger.com/v1/profile",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=8,
        )
        return r.status_code == 200


class TypefullyConnector(BaseConnector):
    def test(self) -> bool:
        api_key = self.config.get("api_key", "")
        if not api_key:
            return False
        r = requests.get(
            "https://api.typefully.com/v1/profile/",
            headers={"X-API-KEY": f"Bearer {api_key}"},
            timeout=8,
        )
        return r.status_code == 200


class LinearConnector(BaseConnector):
    def test(self) -> bool:
        api_key = self.config.get("api_key", "")
        if not api_key:
            return False
        r = requests.post(
            "https://api.linear.app/graphql",
            headers={"Authorization": api_key, "Content-Type": "application/json"},
            json={"query": "{ viewer { id } }"},
            timeout=8,
        )
        return r.status_code == 200 and "data" in r.json()


class SlackConnector(BaseConnector):
    def test(self) -> bool:
        token = self.config.get("bot_token", "")
        if not token:
            return False
        r = requests.get(
            "https://slack.com/api/auth.test",
            headers={"Authorization": f"Bearer {token}"},
            timeout=8,
        )
        return r.status_code == 200 and r.json().get("ok", False)


class NotionConnector(BaseConnector):
    def test(self) -> bool:
        token = self.config.get("api_key", "")
        if not token:
            return False
        r = requests.get(
            "https://api.notion.com/v1/users/me",
            headers={"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28"},
            timeout=8,
        )
        return r.status_code == 200


class E2BConnector(BaseConnector):
    def test(self) -> bool:
        api_key = self.config.get("api_key", "")
        return bool(api_key)  # E2B validates on first sandbox creation, not a list endpoint


# ── Registry ──────────────────────────────────────────────────────────────────

_CONFIGS: List[ConnectorConfig] = [
    ConnectorConfig(
        provider_id="github",
        connector_type="oauth",
        name="GitHub",
        description="Connect your GitHub account to scan repositories with CommitGuard and trigger self-healing PRs.",
        icon="github",
        category="source control",
        auth_type="oauth",
        config_schema=[],
    ),
    ConnectorConfig(
        provider_id="hostinger",
        connector_type="direct",
        name="Hostinger",
        description="Deploy and manage websites via the Hostinger API.",
        icon="globe",
        category="hosting",
        auth_type="apikey",
        config_schema=[
            ConfigField("api_key", "API Key", "password", placeholder="hst_..."),
        ],
    ),
    ConnectorConfig(
        provider_id="typefully",
        connector_type="direct",
        name="Typefully",
        description="Schedule and publish social media content via the Marketing agent.",
        icon="pen-tool",
        category="marketing",
        auth_type="apikey",
        config_schema=[
            ConfigField("api_key", "API Key", "password", placeholder="tf_live_..."),
        ],
    ),
    ConnectorConfig(
        provider_id="linear",
        connector_type="direct",
        name="Linear",
        description="Create and manage issues for CommitGuard findings and agent tasks.",
        icon="layers",
        category="project management",
        auth_type="apikey",
        config_schema=[
            ConfigField("api_key", "API Key", "password", placeholder="lin_api_..."),
        ],
    ),
    ConnectorConfig(
        provider_id="slack",
        connector_type="direct",
        name="Slack",
        description="Receive agent alerts and approval requests in your Slack workspace.",
        icon="message-square",
        category="communication",
        auth_type="apikey",
        config_schema=[
            ConfigField("bot_token", "Bot Token", "password", placeholder="xoxb-..."),
            ConfigField("channel", "Default Channel", "text", required=False, placeholder="#agent-alerts"),
        ],
    ),
    ConnectorConfig(
        provider_id="notion",
        connector_type="direct",
        name="Notion",
        description="Sync agent outputs and CommitGuard reports to Notion pages.",
        icon="database",
        category="productivity",
        auth_type="apikey",
        config_schema=[
            ConfigField("api_key", "Integration Token", "password", placeholder="secret_..."),
        ],
    ),
    ConnectorConfig(
        provider_id="e2b",
        connector_type="direct",
        name="E2B Sandbox",
        description="Secure Firecracker microVM sandbox for executing LLM-generated code.",
        icon="cloud-lightning",
        category="infrastructure",
        auth_type="apikey",
        config_schema=[
            ConfigField("api_key", "API Key", "password", placeholder="e2b_..."),
        ],
    ),
]

_CLASS_MAP: Dict[str, Type[BaseConnector]] = {
    "github": GitHubConnector,
    "hostinger": HostingerConnector,
    "typefully": TypefullyConnector,
    "linear": LinearConnector,
    "slack": SlackConnector,
    "notion": NotionConnector,
    "e2b": E2BConnector,
}

_CONFIG_MAP: Dict[str, ConnectorConfig] = {c.provider_id: c for c in _CONFIGS}


class ConnectorRegistry:
    def list_available(self) -> List[ConnectorConfig]:
        return _CONFIGS

    def get_connector_class(self, provider_id: str) -> Optional[Type[BaseConnector]]:
        return _CLASS_MAP.get(provider_id)

    def get_config(self, provider_id: str) -> Optional[ConnectorConfig]:
        return _CONFIG_MAP.get(provider_id)


registry = ConnectorRegistry()
