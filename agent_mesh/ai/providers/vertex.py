import os
from typing import List
import litellm
from agent_mesh.ai.provider import AIModel
from agent_mesh.ai.models.chat import ChatCompletion, LLMResponse
from agent_mesh.ai.models.media import EmbeddingGenRequest, ImageGenRequest


class VertexAIProvider(AIModel):
    """Vertex AI provider — fine-tuned Gemma, PaLM, custom endpoints."""

    @property
    def model_provider(self) -> str:
        return "vertex_ai"

    @property
    def provider_aliases(self) -> list:
        return ["vertex", "google_vertex"]

    def chat_complete(self, request: ChatCompletion) -> LLMResponse:
        # Use vertex_ai/ prefix for litellm
        model = (
            request.model
            if request.model.startswith("vertex_ai/")
            else f"vertex_ai/{request.model}"
        )
        messages = [m.model_dump(exclude_none=True) for m in request.messages]
        response = litellm.completion(
            model=model,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            vertex_project=os.getenv("GOOGLE_CLOUD_PROJECT"),
            vertex_location=os.getenv("VERTEX_REGION", "us-central1"),
        )
        message = response.choices[0].message
        return LLMResponse(
            content=message.content,
            usage=response.usage.model_dump() if response.usage else {},
            model=request.model,
        )

    def generate_embeddings(self, request: EmbeddingGenRequest) -> List[float]:
        model = (
            request.model
            if request.model.startswith("vertex_ai/")
            else f"vertex_ai/{request.model}"
        )
        response = litellm.embedding(
            model=model,
            input=request.input,
            vertex_project=os.getenv("GOOGLE_CLOUD_PROJECT"),
            vertex_location=os.getenv("VERTEX_REGION", "us-central1"),
        )
        return response.data[0]["embedding"]

    def generate_image(self, request: ImageGenRequest) -> LLMResponse:
        model = (
            request.model
            if request.model.startswith("vertex_ai/")
            else f"vertex_ai/{request.model}"
        )
        response = litellm.image_generation(
            model=model,
            prompt=request.prompt,
            vertex_project=os.getenv("GOOGLE_CLOUD_PROJECT"),
            vertex_location=os.getenv("VERTEX_REGION", "us-central1"),
        )
        return LLMResponse(raw_response=response, model=request.model)
