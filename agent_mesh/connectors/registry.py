from typing import Dict, Type, List
from .base import BaseConnector, ConnectorConfig

class ConnectorRegistry:
    _connectors: Dict[str, Type[BaseConnector]] = {}
    _configs: Dict[str, ConnectorConfig] = {}

    @classmethod
    def register(cls, provider_id: str, config: ConnectorConfig, connector_class: Type[BaseConnector]):
        cls._connectors[provider_id] = connector_class
        cls._configs[provider_id] = config

    @classmethod
    def get_connector_class(cls, provider_id: str) -> Type[BaseConnector]:
        return cls._connectors.get(provider_id)

    @classmethod
    def get_config(cls, provider_id: str) -> ConnectorConfig:
        return cls._configs.get(provider_id)

    @classmethod
    def list_available(cls) -> List[ConnectorConfig]:
        return list(cls._configs.values())

registry = ConnectorRegistry()
