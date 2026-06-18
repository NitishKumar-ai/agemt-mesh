from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field

class ToolSpec(BaseModel):
    name: str
    description: str
    parameters: Optional[Dict[str, Any]] = None # JSON Schema

class ToolCall(BaseModel):
    id: str
    type: str = "function"
    function: Dict[str, Any] # name and arguments

class ChatMessage(BaseModel):
    role: str # user, assistant, system, tool
    content: Optional[str] = None
    name: Optional[str] = None
    tool_calls: Optional[List[ToolCall]] = None
    tool_call_id: Optional[str] = None

class ChatCompletion(BaseModel):
    model: str
    messages: List[ChatMessage]
    tools: Optional[List[ToolSpec]] = None
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 1.0
    max_tokens: Optional[int] = 4096
    stop: Optional[Union[str, List[str]]] = None
    presence_penalty: Optional[float] = 0.0
    frequency_penalty: Optional[float] = 0.0
    top_k: Optional[int] = None

class LLMResponse(BaseModel):
    content: Optional[str] = None
    tool_calls: Optional[List[ToolCall]] = None
    raw_response: Any = None
    usage: Dict[str, Any] = Field(default_factory=dict)
    model: str
