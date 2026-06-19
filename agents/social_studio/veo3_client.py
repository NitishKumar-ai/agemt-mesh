"""
Google Veo 3 AI Video Generation Client
========================================
Generates videos from text prompts using Google's Veo 3.1 model.
"""

import os
import time
import logging
from typing import AsyncIterator, Optional
from pathlib import Path

logger = logging.getLogger(__name__)


def validate_veo3_credentials() -> bool:
    """Check if GOOGLE_GENAI_API_KEY is set."""
    return bool(os.environ.get("GOOGLE_GENAI_API_KEY"))


def is_veo3_enabled() -> bool:
    """Returns True if Veo 3 credentials are configured."""
    return validate_veo3_credentials()


async def generate_video(
    prompt: str,
    output_path: str,
    api_key: Optional[str] = None,
) -> AsyncIterator[dict]:
    """
    Generate video from text prompt using Google Veo 3.
    
    Yields progress updates via async iterator (for SSE):
    - {"status": "queued", "message": "Generation started"}
    - {"status": "progress", "percent": 25, "message": "Rendering frames"}
    - {"status": "complete", "file_path": str, "duration": int}
    - {"status": "error", "message": str}
    
    Args:
        prompt: Text description of video to generate (max 1000 chars)
        output_path: Where to save the generated video
        api_key: Google GenAI API key (uses env var if not provided)
    
    Yields:
        Progress update dictionaries for SSE streaming
    """
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        yield {
            "status": "error",
            "message": "Google GenAI SDK not installed. Run: pip install google-genai"
        }
        return
    
    if not api_key:
        api_key = os.environ.get("GOOGLE_GENAI_API_KEY")
    
    if not api_key:
        yield {
            "status": "error",
            "message": "GOOGLE_GENAI_API_KEY not configured"
        }
        return
    
    if len(prompt) > 1000:
        yield {
            "status": "error",
            "message": f"Prompt too long: {len(prompt)} chars (max 1000)"
        }
        return
    
    try:
        # Initialize client
        client = genai.Client(api_key=api_key)
        
        yield {
            "status": "queued",
            "message": "Starting video generation...",
            "percent": 0
        }
        
        # Start generation
        logger.info(f"Generating video with Veo 3 for prompt: {prompt[:50]}...")
        operation = client.models.generate_videos(
            model="veo-3.1-generate-preview",
            prompt=prompt,
        )
        
        # Poll until complete
        poll_count = 0
        max_polls = 120  # 20 minutes max (10s intervals)
        
        while not operation.done:
            poll_count += 1
            
            if poll_count > max_polls:
                yield {
                    "status": "error",
                    "message": "Video generation timed out after 20 minutes"
                }
                return
            
            # Calculate rough progress (video generation typically takes 5-15 minutes)
            percent = min(int((poll_count / 60) * 90), 90)  # Cap at 90% until done
            
            yield {
                "status": "progress",
                "percent": percent,
                "message": f"Generating video... (attempt {poll_count})"
            }
            
            logger.debug(f"Veo 3 generation in progress: poll {poll_count}/{max_polls}")
            time.sleep(10)
            
            # Refresh operation status
            operation = client.operations.get(operation)
        
        # Generation complete
        yield {
            "status": "progress",
            "percent": 95,
            "message": "Downloading generated video..."
        }
        
        # Download video
        generated_video = operation.response.generated_videos[0]
        client.files.download(file=generated_video.video)
        
        # Save to output path
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        generated_video.video.save(output_path)
        
        # Extract video duration using ffprobe
        duration = _extract_video_duration(output_path)
        
        logger.info(f"Veo 3 video generated successfully: {output_path} ({duration}s)")
        
        yield {
            "status": "complete",
            "file_path": output_path,
            "duration": duration,
            "message": "Video generated successfully!"
        }
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Veo 3 generation failed: {error_msg}")
        
        # User-friendly error messages
        if "quota" in error_msg.lower() or "limit" in error_msg.lower():
            error_msg = "Daily generation quota exceeded. Please try again tomorrow."
        elif "invalid" in error_msg.lower() and "prompt" in error_msg.lower():
            error_msg = "Invalid prompt. Please try a different description."
        elif "auth" in error_msg.lower() or "permission" in error_msg.lower():
            error_msg = "Authentication failed. Please check your API key."
        
        yield {
            "status": "error",
            "message": error_msg
        }


def _extract_video_duration(file_path: str) -> int:
    """Extract video duration in seconds using ffprobe."""
    import subprocess
    
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path
            ],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            return int(float(result.stdout.strip()))
    except Exception as e:
        logger.warning(f"Could not extract video duration: {e}")
    
    return 0  # Default if extraction fails
