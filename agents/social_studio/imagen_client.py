"""
Google Imagen 3 AI Image Generation Client
==========================================
Generates images from text prompts using Google's gemini-3.1-flash-image model.
"""

import os
import logging
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)


def validate_imagen_credentials() -> bool:
    """Check if GOOGLE_GENAI_API_KEY is set."""
    return bool(os.environ.get("GOOGLE_GENAI_API_KEY"))


def is_imagen_enabled() -> bool:
    """Returns True if Imagen credentials are configured."""
    return validate_imagen_credentials()


def generate_image(
    prompt: str,
    output_path: str,
    api_key: Optional[str] = None,
) -> dict:
    """
    Generate image from text prompt using Google Imagen 3.
    
    Args:
        prompt: Text description of image to generate
        output_path: Where to save the generated image
        api_key: Google GenAI API key (uses env var if not provided)
    
    Returns:
        {
            "status": "complete" | "error",
            "file_path": str (if success),
            "message": str,
            "width": int (if success),
            "height": int (if success)
        }
    """
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return {
            "status": "error",
            "message": "Google GenAI SDK not installed. Run: pip install google-genai"
        }
    
    if not api_key:
        api_key = os.environ.get("GOOGLE_GENAI_API_KEY")
    
    if not api_key:
        return {
            "status": "error",
            "message": "GOOGLE_GENAI_API_KEY not configured"
        }
    
    if len(prompt) > 1000:
        return {
            "status": "error",
            "message": f"Prompt too long: {len(prompt)} chars (max 1000)"
        }
    
    try:
        # Initialize client
        client = genai.Client(api_key=api_key)
        
        logger.info(f"Generating image with Imagen 3 for prompt: {prompt[:50]}...")
        
        # Generate image
        response = client.models.generate_content(
            model="gemini-3.1-flash-image",
            contents=[prompt],
        )
        
        # Extract and save image
        image_saved = False
        for part in response.parts:
            if part.text is not None:
                logger.debug(f"Imagen response text: {part.text}")
            elif part.inline_data is not None:
                image = part.as_image()
                
                # Ensure output directory exists
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                
                # Save image
                image.save(output_path)
                image_saved = True
                
                logger.info(f"Imagen 3 image generated successfully: {output_path}")
                
                return {
                    "status": "complete",
                    "file_path": output_path,
                    "message": "Image generated successfully!",
                    "width": image.width,
                    "height": image.height,
                }
        
        if not image_saved:
            return {
                "status": "error",
                "message": "No image data in response"
            }
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Imagen 3 generation failed: {error_msg}")
        
        # User-friendly error messages
        if "quota" in error_msg.lower() or "limit" in error_msg.lower():
            error_msg = "Daily generation quota exceeded. Please try again tomorrow."
        elif "invalid" in error_msg.lower() and "prompt" in error_msg.lower():
            error_msg = "Invalid prompt. Please try a different description."
        elif "auth" in error_msg.lower() or "permission" in error_msg.lower():
            error_msg = "Authentication failed. Please check your API key."
        
        return {
            "status": "error",
            "message": error_msg
        }
    
    return {
        "status": "error",
        "message": "Unknown error occurred"
    }
