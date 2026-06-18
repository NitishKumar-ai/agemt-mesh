from typing import Dict, Optional, List
from agent_mesh.ai.provider import AIModel
from agent_mesh.ai.providers.gemini import GeminiProvider
from agent_mesh.ai.providers.anthropic import AnthropicProvider
from agent_mesh.ai.providers.openai import OpenAIProvider
from agent_mesh.ai.providers.vertex import VertexAIProvider
from agent_mesh.ai.providers.gemini_native import GeminiNativeProvider

class AIModelRegistry:
    _providers: Dict[str, AIModel] = {}

    @classmethod
    def register(cls, name: str, provider: AIModel):
        cls._providers[name.lower()] = provider
        for alias in provider.provider_aliases:
            cls._providers[alias.lower()] = provider

    @classmethod
    def get_provider(cls, name: str) -> Optional[AIModel]:
        return cls._providers.get(name.lower())

    @classmethod
    def list_providers(cls) -> List[str]:
        return list(cls._providers.keys())

# Initialize with default providers
AIModelRegistry.register("gemini", GeminiProvider())
AIModelRegistry.register("anthropic", AnthropicProvider())
AIModelRegistry.register("openai", OpenAIProvider())
AIModelRegistry.register("vertex_ai", VertexAIProvider())
AIModelRegistry.register("gemini_native", GeminiNativeProvider())
