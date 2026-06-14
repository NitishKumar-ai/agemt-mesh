from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

class ConfigField(BaseModel):
    name: str
    label: str
    type: str = "text"  # 'text', 'password', 'textarea', 'number'
    required: bool = True
    placeholder: Optional[str] = None

class ConnectorConfig(BaseModel):
    """Base configuration for all connectors."""
    provider_id: str
    connector_type: str  # 'direct', 'mcp', 'oauth'
    name: str
    description: str
    icon: Optional[str] = None
    category: str  # 'social', 'cloud', 'search', 'tool', etc.
    auth_type: str = "api_key" # 'api_key', 'oauth', 'basic', 'none', 'mcp_stdio', 'mcp_env'
    config_schema: List[ConfigField] = []
    
    # MCP specific
    mcp_command: Optional[str] = None
    mcp_args: Optional[List[str]] = None

class ConnectionInfo(BaseModel):
    """Information about an active connection."""
    id: str
    provider_id: str
    connector_type: str
    status: str
    metadata: Dict[str, Any]
    created_at: str
    updated_at: str

from loop import Tool

class BaseConnector(ABC):
    """Base class for all connectors."""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config

    @abstractmethod
    def test(self) -> bool:
        """Test if the connection is working."""
        pass

    @abstractmethod
    def get_tools(self) -> List[Tool]:
        """Return tools provided by this connector."""
        pass

    def disconnect(self) -> bool:
        """Cleanup connection if needed."""
        return True
