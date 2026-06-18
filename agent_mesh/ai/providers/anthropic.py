import litellm
from typing import List
from agent_mesh.ai.provider import AIModel
from agent_mesh.ai.models.chat import ChatCompletion, LLMResponse, ToolCall
from agent_mesh.ai.models.media import EmbeddingGenRequest, ImageGenRequest

class AnthropicProvider(AIModel):
    
    @property
    def model_provider(self) -> str:
        return "anthropic"

    @property
    def supports_assistant_prefill(self) -> bool:
        return False

    def chat_complete(self, request: ChatCompletion) -> LLMResponse:
        messages = [m.model_dump(exclude_none=True) for m in request.messages]
        tools = [t.model_dump(exclude_none=True) for t in request.tools] if request.tools else None
        
        response = litellm.completion(
            model=f"anthropic/{request.model}" if not request.model.startswith("anthropic/") else request.model,
            messages=messages,
            tools=tools,
            temperature=request.temperature,
            top_p=request.top_p,
            max_tokens=request.max_tokens,
            stop=request.stop
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
            model=f"anthropic/{request.model}" if not request.model.startswith("anthropic/") else request.model,
            input=request.input
        )
        return response.data[0]["embedding"]

    def generate_image(self, request: ImageGenRequest) -> LLMResponse:
        raise NotImplementedError("Anthropic does not support image generation")
