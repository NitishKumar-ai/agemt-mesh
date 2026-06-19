# Image Generation Integration for Social Studio

## Overview
Integrated Google Imagen 3 AI image generation with the Social Studio autoposter to automatically generate images for social media posts, especially for Instagram which requires media.

## Changes Made

### 1. Backend - Content Generator (`agents/social_studio/content_generator.py`)
- Added `generate_image` parameter to `generate_for_platform()` function
- Automatically generates images for visual platforms (instagram_login, facebook, twitter, linkedin) when `generate_image=True`
- Uses Imagen client to create professional, eye-catching images based on the post topic
- Stores generated images in `generated_images/` directory
- Returns `image_url` and `image_path` in the generation result

### 2. Backend - Autoposter (`agents/social_studio/autoposter.py`)
- Added `generate_image` parameter to `run_autopost()` (defaults to True)
- Passes `image_url` to `ss_create_posts()` for storage
- Passes `image_path` (local file path) to `publish_platform_post()` for publishing
- Returns `image_url` in autopost results

### 3. Backend - Publisher (`agents/social_studio/publisher.py`)
- Added `media_urls` parameter to `publish_platform_post()` function
- Automatically determines post type based on media presence (IMAGE if media_urls provided, TEXT otherwise)
- Passes media URLs to platform providers via `PublishContent`

### 4. Backend - API (`api.py`)
- Added `generate_image` parameter to `/api/social-studio/autopost` endpoint (defaults to True)
- Mounted `/generated_images` static file directory to serve generated images
- Creates `generated_images/` directory on startup if it doesn't exist

### 5. Backend - Database (`store.py`)
- Added `image_url` column to `ss_platform_posts` table schema
- Updated `ss_create_posts()` to accept and store `image_url`
- Updated `ss_list_platform_posts()` to include `image_url` in SELECT queries
- Updated `ss_get_platform_post()` to include `image_url`

### 6. Frontend - Types (`frontend/src/lib/types.ts`)
- Added `image_url?: string` field to `SSPlatformPost` type

### 7. Frontend - UI (`frontend/src/pages/SocialStudioPage.tsx`)
- Updated draft cards to display generated images above post content
- Images are shown with rounded corners, border, and max height of 300px
- Added `image_url` to draft mapping from autopost results

## How It Works

1. **User triggers autopost** with a topic (e.g., "AI-powered content creation")

2. **Content Generation Phase**:
   - For each platform, generates text content
   - If `generate_image=True` and platform is visual (Instagram, Facebook, Twitter, LinkedIn):
     - Creates image prompt: "Create a professional, eye-catching social media image about: {topic}. Style: modern, clean, vibrant colors. No text in image."
     - Calls Imagen 3 API to generate image
     - Saves to `generated_images/social_studio_{platform}_{random}.png`
     - Returns image URL like `/generated_images/social_studio_instagram_login_abc123.png`

3. **Storage Phase**:
   - Saves post to database with text, hashtags, and `image_url`

4. **Publishing Phase**:
   - Publisher receives `media_urls` parameter with local file paths
   - Creates `PublishContent` with `post_type=IMAGE` and `media_urls=[path]`
   - Platform providers (like Instagram) receive media URLs and upload them

5. **UI Display**:
   - Generated images are displayed in draft cards
   - Users can preview both text and image before/after publishing
   - Images are served via `/generated_images/` static route

## Instagram Fix

Instagram previously failed with error:
```
ERROR: Instagram requires at least one media item
```

Now with automatic image generation:
- Every Instagram post gets an AI-generated image
- Post succeeds with both caption and media
- Image is visually related to the post topic

## Configuration

Ensure `GOOGLE_GENAI_API_KEY` is set in `.env` file for Imagen 3 access.

## File Locations

- **Generated Images**: `./generated_images/` (served at `/generated_images/`)
- **Image Naming**: `social_studio_{platform}_{8-char-hex-token}.png`

## Future Enhancements

1. Allow users to choose whether to generate images per-post
2. Add image editing/customization options
3. Support custom image uploads
4. Generate videos for TikTok/YouTube using Veo3
5. Add image prompt customization
6. Image caching and reuse for similar topics
