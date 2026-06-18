from abc import ABC, abstractmethod
from typing import List, Optional
from agent_mesh.ai.models.chat import ChatCompletion, LLMResponse
from agent_mesh.ai.models.media import EmbeddingGenRequest, ImageGenRequest, VideoGenRequest, AudioGenRequest

class AIModel(ABC):
    
    @property
    @abstractmethod
    def model_provider(self) -> str:
        """Name of the foundation model provider (e.g., 'openai', 'anthropic', 'gemini')."""
        pass

    @property
    def provider_aliases(self) -> List[str]:
        """Alternative provider names that resolve to this same provider."""
        return []

    @property
    def supports_assistant_prefill(self) -> bool:
        """Whether this provider accepts a chat-completion request whose last message has the assistant role."""
        return True

    @abstractmethod
    def chat_complete(self, request: ChatCompletion) -> LLMResponse:
        """Unified chat completion call."""
        pass

    @abstractmethod
    def generate_embeddings(self, request: EmbeddingGenRequest) -> List[float]:
        """Generate text embeddings."""
        pass

    @abstractmethod
    def generate_image(self, request: ImageGenRequest) -> LLMResponse:
        """Generate an image from a prompt."""
        pass

    def generate_video(self, request: VideoGenRequest) -> LLMResponse:
        """Generate a video (async or sync)."""
        raise NotImplementedError("Video generation not supported by this provider")

    def generate_audio(self, request: AudioGenRequest) -> LLMResponse:
        """Generate audio from text."""
        raise NotImplementedError("Audio generation not supported by this provider")
