import os
from typing import List
import google.generativeai as genai
from agent_mesh.ai.provider import AIModel
from agent_mesh.ai.models.chat import ChatCompletion, LLMResponse
from agent_mesh.ai.models.media import EmbeddingGenRequest, ImageGenRequest


class GeminiNativeProvider(AIModel):
    """Direct google-genai SDK — supports thinking, streaming, grounding."""

    def __init__(self):
        genai.configure(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

    @property
    def model_provider(self) -> str:
        return "gemini_native"

    @property
    def provider_aliases(self) -> list:
        return ["google_native"]

    def chat_complete(self, request: ChatCompletion) -> LLMResponse:
        model_name = (
            request.model[7:] if request.model.startswith("gemini/") else request.model
        )
        model = genai.GenerativeModel(model_name)
        # Convert messages to Gemini format
        history = []
        for msg in request.messages:
            if msg.role == "system":
                # Prepend system to first user message or handle separately if SDK supports
                continue
            elif msg.role == "user":
                history.append({"role": "user", "parts": [msg.content]})
            elif msg.role == "assistant":
                history.append({"role": "model", "parts": [msg.content or ""]})

        response = model.generate_content(
            history,
            generation_config=genai.types.GenerationConfig(
                temperature=request.temperature,
                max_output_tokens=request.max_tokens,
            ),
        )
        return LLMResponse(
            content=response.text,
            usage={},
            model=request.model,
        )

    def generate_embeddings(self, request: EmbeddingGenRequest) -> List[float]:
        model_name = (
            request.model[7:] if request.model.startswith("gemini/") else request.model
        )
        if "embedding" not in model_name:
            model_name = "models/embedding-001"
        response = genai.embed_content(model=model_name, content=request.input)
        return response["embedding"]

    def generate_image(self, request: ImageGenRequest) -> LLMResponse:
        raise NotImplementedError("Gemini Native SDK does not support image generation")
