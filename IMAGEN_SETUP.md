# Google Imagen 3 Image Generation Setup

## Overview

Social Studio now supports AI-powered image generation using Google's Imagen 3 model (`gemini-3.1-flash-image`). Generate high-quality images from text prompts to use in your social media posts.

## Features

- ✅ **AI Image Generation**: Create images from text descriptions
- ✅ **Automatic Storage**: Generated images are saved and tracked
- ✅ **Post Integration**: Use generated images in social media posts
- ✅ **Multiple Formats**: Supports PNG output
- ✅ **Preview & Download**: View generated images before posting

## Prerequisites

1. **Google GenAI API Key** (same as Veo 3 video generation)
2. **Python Dependencies**:
   - `google-genai` SDK
   - `Pillow` (PIL) for image handling

## Setup Instructions

### 1. Get Google GenAI API Key

If you already have a key for Veo 3, you can use the same key. Otherwise:

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Get API key"** or **"Create API key"**
4. Copy the generated API key

### 2. Add API Key to Environment

Add to your `.env` file:

```bash
GOOGLE_GENAI_API_KEY=your_api_key_here
```

**Note**: This is the same key used for Veo 3 video generation.

### 3. Install Python Dependencies

```bash
pip install google-genai pillow
```

Or add to `requirements.txt`:

```
google-genai>=0.1.0
Pillow>=10.0.0
```

### 4. Restart the Application

```bash
# Stop the server (Ctrl+C)
# Then restart:
py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

## Usage

### API Endpoint

**Generate Image**:
```http
POST /api/social-studio/imagen/generate
Content-Type: application/json

{
  "prompt": "A serene mountain landscape at sunset with vibrant colors"
}
```

**Response**:
```json
{
  "status": "complete",
  "file_id": "uuid-here",
  "file_path": "/tmp/social-studio-uploads/uuid_imagen.png",
  "width": 1024,
  "height": 1024,
  "message": "Image generated successfully!"
}
```

### Using in Posts

1. Generate an image using the API
2. Get the `file_id` from the response
3. Use the `file_id` when creating a post with `media_files`

### Example Code

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="your-api-key")

prompt = "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"

response = client.models.generate_content(
    model="gemini-3.1-flash-image",
    contents=[prompt],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("generated_image.png")
```

## Features & Capabilities

### Supported Use Cases

- Social media post images
- Marketing visuals
- Product mockups
- Concept art
- Background images
- Thumbnails

### Image Specifications

- **Format**: PNG
- **Typical Resolution**: 1024x1024 (varies by model)
- **Max Prompt Length**: 1000 characters
- **Storage**: Temporary files in `/tmp/social-studio-uploads/`
- **Cleanup**: Images older than 7 days are automatically deleted

## Integration with Social Studio

### In the UI (Coming Soon)

The Social Studio Generate tab will include:

1. **Image Generation Section**:
   - Text prompt input
   - Character counter (max 1000)
   - Generate button
   - Image preview

2. **Post Composer Integration**:
   - Select between upload and AI generation
   - Preview generated images
   - Attach to posts before publishing

### Backend Integration

The image generation is fully integrated with:

- ✅ **Database tracking**: `ss_video_uploads` table (reused for images)
- ✅ **File management**: Automatic cleanup after 7 days
- ✅ **Error handling**: User-friendly error messages
- ✅ **API endpoints**: Ready for frontend consumption

## Error Messages

Common errors you might encounter:

| Error | Cause | Solution |
|-------|-------|----------|
| "GOOGLE_GENAI_API_KEY not configured" | Missing API key | Add key to `.env` file |
| "Daily generation quota exceeded" | API quota limit reached | Wait 24 hours or upgrade quota |
| "Invalid prompt" | Prompt violates content policy | Modify prompt to be more appropriate |
| "Authentication failed" | Invalid API key | Verify key in Google AI Studio |
| "Prompt too long" | Prompt > 1000 chars | Shorten your prompt |

## Limitations

- **Quota**: Free tier has daily limits (check Google AI Studio)
- **Content Policy**: Some prompts may be rejected
- **Generation Time**: Typically 2-10 seconds per image
- **File Size**: Generated PNGs are typically 1-5MB

## Troubleshooting

### Image Not Generating

1. Check API key is set correctly
2. Verify `google-genai` is installed: `pip list | grep google-genai`
3. Check server logs for error messages
4. Test with simple prompt: "a red apple"

### API Key Issues

```bash
# Test your API key
python -c "from google import genai; client = genai.Client(api_key='your-key'); print('OK')"
```

### Module Not Found

```bash
# Install dependencies
pip install google-genai pillow
```

## Cost & Pricing

- Check current pricing at [Google AI Pricing](https://ai.google.dev/pricing)
- Free tier typically includes:
  - Limited daily generations
  - Rate limits per minute
  - May require payment method for higher usage

## Next Steps

1. ✅ Backend API is ready
2. 🔄 Frontend UI integration (in progress)
3. 🔄 Post composer integration
4. 🔄 Batch generation support
5. 🔄 Style presets and templates

## Related Features

- **Video Generation**: Use Veo 3 for AI video creation
- **Video Upload**: Upload existing videos for YouTube
- **Content Generator**: AI-powered post content creation

## Support

For issues or questions:
1. Check server logs in console
2. Verify environment variables
3. Test API endpoint with curl/Postman
4. Review Google AI Studio documentation

---

**Status**: ✅ Backend Complete | 🔄 Frontend In Progress  
**Last Updated**: 2026-06-19
