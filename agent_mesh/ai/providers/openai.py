import litellm
from typing import List
from agent_mesh.ai.provider import AIModel
from agent_mesh.ai.models.chat import ChatCompletion, LLMResponse, ToolCall
from agent_mesh.ai.models.media import EmbeddingGenRequest, ImageGenRequest

class OpenAIProvider(AIModel):
    
    @property
    def model_provider(self) -> str:
        return "openai"

    def chat_complete(self, request: ChatCompletion) -> LLMResponse:
        messages = [m.model_dump(exclude_none=True) for m in request.messages]
        tools = [t.model_dump(exclude_none=True) for t in request.tools] if request.tools else None
        
        response = litellm.completion(
            model=request.model if request.model.startswith("openai/") else f"openai/{request.model}",
            messages=messages,
            tools=tools,
            temperature=request.temperature,
            top_p=request.top_p,
            max_tokens=request.max_tokens,
            stop=request.stop,
            presence_penalty=request.presence_penalty,
            frequency_penalty=request.frequency_penalty
        )
        
        message = response.choices[0].message
        tool_calls = None
        if hasattr(message, "tool_calls") and message.tool_calls:
            tool_calls = [ToolCall(id=tc.id, type=tc.type, function=tc.function.model_dump()) for tc in message.tool_calls]
        
        return LLMResponse(
            content=message.content,
            tool_calls=tool_calls,
            raw_response=response,
            usage=response.usage.model_dump(),
            model=request.model
        )

    def generate_embeddings(self, request: EmbeddingGenRequest) -> List[float]:
        response = litellm.embedding(
            model=request.model if request.model.startswith("openai/") else f"openai/{request.model}",
            input=request.input
        )
        return response.data[0]["embedding"]

    def generate_image(self, request: ImageGenRequest) -> LLMResponse:
        response = litellm.image_generation(
            model=request.model if request.model.startswith("openai/") else f"openai/{request.model}",
            prompt=request.prompt,
            n=request.n,
            size=request.size,
            quality=request.quality,
            style=request.style
        )
        return LLMResponse(
            raw_response=response,
            model=request.model
        )
