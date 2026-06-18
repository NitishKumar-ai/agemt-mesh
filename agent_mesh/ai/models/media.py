from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel

class ImageGenRequest(BaseModel):
    model: str
    prompt: str
    n: Optional[int] = 1
    size: Optional[str] = "1024x1024"
    quality: Optional[str] = "standard"
    style: Optional[str] = "vivid"

class VideoGenRequest(BaseModel):
    model: str
    prompt: str
    duration: Optional[int] = None
    fps: Optional[int] = None
    aspect_ratio: Optional[str] = "16:9"

class AudioGenRequest(BaseModel):
    model: str
    input: str
    voice: Optional[str] = "alloy"
    response_format: Optional[str] = "mp3"

class EmbeddingGenRequest(BaseModel):
    model: str
    input: Union[str, List[str]]
    user: Optional[str] = None
