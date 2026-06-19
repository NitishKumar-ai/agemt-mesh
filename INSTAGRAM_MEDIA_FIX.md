# Instagram Media Upload Fix

## Problem
Instagram publishing was failing with error: "Instagram requires at least one media item"

## Root Cause
1. **Missing Media URLs**: The `ss_api_publish_post` API endpoint was not passing `media_urls` to the `publish_platform_post` function, even though generated images were stored in the database
2. **Image Path Inconsistency**: Marketing team was saving images to `frontend/public/generated_images/` but FastAPI serves from `generated_images/` (project root)
3. **Image Not Displayed in UI**: Images were generated but not properly associated with posts

## Fixes Applied

### 1. Updated API Endpoint (`api.py`)
Modified `ss_api_publish_post` to:
- Extract `image_url` from the post record
- Convert relative URLs (`/generated_images/...`) to absolute public URLs using `BACKEND_URL` from environment
- Pass `media_urls` parameter to `publish_platform_post`

```python
# Collect media URLs from the post
media_urls = []
if post.get("image_url"):
    # Convert relative URL to absolute public URL for platforms like Instagram
    image_url = post["image_url"]
    if image_url.startswith("/"):
        # Relative URL - convert to absolute using BACKEND_URL
        backend_url = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")
        image_url = backend_url.rstrip("/") + image_url
    media_urls.append(image_url)
```

### 2. Fixed Image Storage Path (`agents/social_studio/marketing_team.py`)
Changed image output directory from:
```python
output_dir = os.path.join(os.getcwd(), "frontend", "public", "generated_images")
```

To:
```python
output_dir = os.path.join(os.getcwd(), "generated_images")
```

This aligns with FastAPI's static file mount configuration.

### 3. Ngrok Setup Requirements
For Instagram to access images, ensure:
1. Ngrok is running: `ngrok http 8000`
2. `BACKEND_URL` in `.env` matches your ngrok URL (e.g., `https://unfeoffed-saberlike-veola.ngrok-free.dev`)
3. Backend serves generated images at `/generated_images/` (already configured)

## How Image Generation Works

### UI Flow
1. User toggles "Generate AI Image" in the Generate tab
2. `generateImage` state is passed to backend via `generate_image=true` query parameter
3. Marketing team pipeline:
   - **Art Director Agent** creates an image generation prompt
   - **Imagen 3 API** generates the image
   - Image saved to `generated_images/art_[random].jpg`
   - URL `/generated_images/art_[random].jpg` stored in database

### Publishing Flow
1. User clicks "Publish" on a draft
2. API retrieves post from database (includes `image_url`)
3. Converts relative URL to absolute: `https://your-ngrok-url.ngrok-free.dev/generated_images/art_xxx.jpg`
4. Passes to Instagram provider as `media_urls`
5. Instagram creates media container with `image_url`
6. Post published with image

## Testing
1. Start backend, frontend, and ngrok (see README)
2. Go to Social Studio → Generate tab
3. Ensure "Generate AI Image" toggle is ON
4. Enter topic and click "Deploy Campaign Team"
5. Wait for agents to complete (watch War Room logs)
6. Verify image appears in draft card
7. Click "Publish" on Instagram draft
8. Verify post publishes successfully with image

## Related Files
- `api.py` - API endpoints
- `agents/social_studio/marketing_team.py` - Marketing team pipeline
- `agents/social_studio/content_generator.py` - Content generation (legacy)
- `agents/social_studio/imagen_client.py` - Imagen 3 integration
- `agents/social_studio/publisher.py` - Publishing engine
- `agents/social_studio/providers/instagram.py` - Instagram provider
- `frontend/src/pages/SocialStudioPage.tsx` - UI

## Environment Requirements
```env
# Google API for Imagen 3
GOOGLE_GENAI_API_KEY=your_key_here

# Public backend URL for Instagram media access
BACKEND_URL=https://your-ngrok-url.ngrok-free.dev

# Instagram OAuth (if using instagram_login provider)
INSTAGRAM_LOGIN_APP_ID=your_app_id
INSTAGRAM_LOGIN_APP_SECRET=your_app_secret
```

## Future Improvements
1. Upload images to cloud storage (S3, Cloudinary) for persistence
2. Add image preview in publish confirmation modal
3. Support multiple images per post (carousel)
4. Add image editing/regeneration before publish
5. Cache generated images to avoid regeneration
