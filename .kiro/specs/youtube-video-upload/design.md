# Design Document: YouTube Video Upload Workflow

## Overview

The YouTube Video Upload Workflow extends Social Studio with video-first publishing capabilities. Unlike text-based platforms (Twitter, LinkedIn), YouTube requires dedicated infrastructure for handling large binary files, resumable uploads, metadata configuration, and AI-powered video generation via Google Veo 3.

The system integrates three major components:

1. **Video Upload Manager**: Handles temporary file storage, validation, and resumable uploads to YouTube
2. **Google Veo 3 Integration**: AI video generation from text prompts using Google's generative video model
3. **YouTube Publishing Pipeline**: Metadata configuration, privacy settings, custom thumbnails, and Shorts support

The implementation reuses existing Social Studio patterns:
- OAuth flow (already implemented in YouTubeProvider)
- Publisher orchestration (existing publisher.py with retry logic)
- UI composition (SocialStudioPage React component)
- Database patterns (platform_posts, publish_log, metric snapshots)

Key design decision: **Video files are stored temporarily on the server filesystem** (not in the database) until successful upload to YouTube. This avoids database bloat and leverages YouTube's resumable upload protocol for reliability.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      Social Studio UI                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Video Upload    │  │   Veo 3 Video    │  │   Metadata    │ │
│  │  File Picker     │  │   Generator      │  │   Form        │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ├─────> /api/social-studio/veo3/generate
                             ├─────> /api/social-studio/posts (with video file)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                         API Layer (api.py)                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Video Upload    │  │   Veo 3 Client   │  │  Post Create  │ │
│  │  Handler         │  │   (async)        │  │  Endpoint     │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ├─────> Temporary file storage
                             ├─────> Google Veo 3 API
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Publisher (publisher.py)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  publish_platform_post()                                  │  │
│  │    - Detects video PostType (VIDEO, SHORT)               │  │
│  │    - Calls YouTubeProvider with video file path          │  │
│  │    - Retry logic with exponential backoff                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│              YouTubeProvider (providers/youtube.py)              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  publish_post(content: PublishContent) -> PublishResult   │  │
│  │    1. Initiate resumable upload session                   │  │
│  │    2. Upload video binary in chunks                       │  │
│  │    3. Upload custom thumbnail (if provided)               │  │
│  │    4. Return video_id and watch URL                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                   YouTube Data API v3
                   (Resumable Upload Protocol)
```

### Data Flow

**Upload Flow (User-Provided Video):**
1. User selects video file via file picker
2. Frontend uploads to `/api/social-studio/upload-video` → stores in `/tmp/social-studio-uploads/{uuid}.mp4`
3. Frontend submits metadata form → creates parent post + platform_posts rows
4. Publisher calls `YouTubeProvider.publish_post()` with file path
5. YouTubeProvider uploads via resumable protocol
6. On success: delete temp file, mark platform_post published
7. On failure: log error, schedule retry, keep temp file for 24h

**AI Generation Flow (Veo 3):**
1. User enters text prompt (up to 1000 chars)
2. Frontend calls `/api/social-studio/veo3/generate` → SSE stream
3. Backend calls Google Veo 3 API, polls for completion
4. Generated video saved to `/tmp/social-studio-uploads/{uuid}_veo3.mp4`
5. Frontend displays preview, user proceeds to metadata form
6. Rest of flow identical to upload flow

### File Storage Strategy

**Temporary Upload Directory:**
- Path: `/tmp/social-studio-uploads/` (configurable via env var)
- File naming: `{uuid4}_{original_name}` or `{uuid4}_veo3.mp4`
- Max file size: 256GB (YouTube limit)
- Retention: Delete on successful upload, or 24h after failure, or 7 days (cleanup job)

**Cleanup Strategy:**
- On successful publish: immediate deletion
- On non-retryable failure: delete after 24h (allow manual retry)
- On startup: delete files older than 7 days
- Background job (runs hourly): purge expired temp files

**Storage Requirements:**
- Disk space: ~500GB recommended for concurrent uploads
- No database storage of video binaries
- Only metadata (file_path, size, duration) stored in DB

## Components and Interfaces

### Frontend Components

**1. VideoUploadWorkflow Component**
```typescript
interface VideoUploadWorkflowProps {
  accounts: SSAccount[];
  onPublishComplete: (result: PublishProof) => void;
}

interface VideoSource {
  type: 'upload' | 'veo3';
  file?: File;
  prompt?: string;
  generatedPath?: string;
}

interface VideoMetadata {
  title: string;              // max 100 chars
  description: string;        // max 5000 chars
  tags: string[];
  privacy: 'public' | 'unlisted' | 'private';
  postType: 'VIDEO' | 'SHORT';
  madeForKids: boolean;
  categoryId: string;        // default '22' (People & Blogs)
  thumbnail?: File;
}
```

**Component Structure:**
- `<VideoSourceSelector>`: Toggle between "Upload File" and "Generate with AI"
- `<VideoFileUpload>`: File picker with validation (format, size, duration)
- `<Veo3Generator>`: Prompt textarea + generate button + progress indicator
- `<VideoPreview>`: Video player for preview before publish
- `<VideoMetadataForm>`: All metadata fields + privacy settings
- `<ThumbnailUpload>`: Optional custom thumbnail picker
- `<PublishButton>`: Triggers publish with loading state

### Backend API Endpoints

**POST /api/social-studio/upload-video**
```python
# Request: multipart/form-data with video file
# Response: { "file_id": str, "file_path": str, "size": int, "duration": int }
# Validation: format, size (256GB max), duration (12h max)
# Storage: /tmp/social-studio-uploads/{uuid}_{filename}
```

**POST /api/social-studio/veo3/generate**
```python
# Request: { "prompt": str (max 1000), "account_id": int }
# Response: SSE stream with progress updates
# Events:
#   - queued: generation started
#   - progress: {percent: int, status: str}
#   - complete: {file_id: str, file_path: str, duration: int, preview_url: str}
#   - error: {message: str}
```

**POST /api/social-studio/posts (extended for video)**
```python
# Existing endpoint extended to handle video
# Request: {
#   "topic": str,
#   "platforms": ["youtube"],
#   "video_file_id": str,
#   "thumbnail_file_id": str | null,
#   "metadata": VideoMetadata,
#   "account_map": { "youtube": account_id }
# }
# Creates parent post + platform_posts with post_type=VIDEO/SHORT
```

**GET /api/social-studio/video-upload/status/{file_id}**
```python
# Check upload progress for resumable uploads
# Response: { "uploaded_bytes": int, "total_bytes": int, "percent": int }
```

### Publisher Integration

**Extended publish_platform_post() function:**

```python
def publish_platform_post(
    platform_post_id: int,
    platform: str,
    content: str,
    hashtags: str,
    access_token: str,
    platform_credentials: Optional[dict] = None,
    account_id: Optional[int] = None,
    # NEW: video-specific params
    video_file_path: Optional[str] = None,
    thumbnail_file_path: Optional[str] = None,
    post_type: PostType = PostType.TEXT,
    video_metadata: Optional[dict] = None,
) -> dict:
    """
    Extended to handle video uploads for YouTube.
    
    Video-specific flow:
    1. Detect post_type VIDEO or SHORT
    2. Construct PublishContent with media_files=[video_file_path]
    3. Add metadata to content.extra (privacy, category, madeForKids, thumbnail_file)
    4. Call provider.publish_post()
    5. On success: delete temp files, log success
    6. On failure: log error, schedule retry, preserve temp files
    """
```

### YouTubeProvider Video Support

**Already implemented** in `agents/social_studio/providers/youtube.py`:

```python
def publish_post(self, access_token: str, content: PublishContent) -> PublishResult:
    """
    Handles video uploads via resumable upload protocol.
    
    Steps:
    1. POST to /upload/youtube/v3/videos?uploadType=resumable
       - Returns upload URI
    2. PUT binary data to upload URI
       - Supports chunked uploads for large files
    3. (Optional) POST thumbnail to /upload/youtube/v3/thumbnails/set
    4. Return PublishResult with video_id and watch URL
    
    Content structure:
    - content.post_type: VIDEO or SHORT
    - content.media_files: ["/tmp/social-studio-uploads/xyz.mp4"]
    - content.extra: {
        "privacy_status": "public" | "unlisted" | "private",
        "self_declared_made_for_kids": bool,
        "category_id": "22",
        "tags": ["tag1", "tag2"],
        "thumbnail_file": "/tmp/social-studio-uploads/thumb.jpg"
      }
    """
```

**Shorts Detection:**
```python
# In publish_post():
if content.post_type == PostType.SHORT and "#Shorts" not in title:
    title = f"{title} #Shorts".strip()
```

### Google Veo 3 Integration

**New module: `agents/social_studio/veo3_client.py`**

```python
import os
import asyncio
import httpx
from typing import AsyncIterator

VEO3_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

async def generate_video(
    prompt: str,
    output_path: str,
    api_key: str,
    project_id: str,
) -> AsyncIterator[dict]:
    """
    Generate video from text prompt using Google Veo 3.
    
    Yields progress updates via async iterator (for SSE):
    - {"status": "queued", "message": "Generation started"}
    - {"status": "progress", "percent": 25, "message": "Rendering frames"}
    - {"status": "complete", "file_path": str, "duration": int}
    - {"status": "error", "message": str}
    
    Implementation:
    1. POST /models/veo3:generateVideo
       - Body: {"prompt": str, "config": {...}}
       - Returns: {"name": "operations/abc123"}
    2. Poll GET /operations/{operation_id}
       - Every 5 seconds until done=true
    3. On completion: download video bytes
    4. Save to output_path
    5. Extract duration using ffprobe
    
    Error handling:
    - Quota exceeded → user-friendly message
    - Invalid prompt → validation error
    - Network errors → retryable
    """
    
def validate_veo3_credentials() -> bool:
    """Check if GOOGLE_VEO3_API_KEY and PROJECT_ID are set."""
    
def is_veo3_enabled() -> bool:
    """Returns True if Veo 3 credentials are configured."""
```

**API Endpoint Implementation:**

```python
@app.post("/api/social-studio/veo3/generate")
async def veo3_generate_video(request: Request):
    """
    SSE endpoint for real-time video generation progress.
    
    Request body:
    {
      "prompt": str (max 1000 chars),
      "account_id": int
    }
    
    Response: Server-Sent Events stream
    """
    body = await request.json()
    prompt = body.get("prompt", "").strip()
    
    if len(prompt) > 1000:
        raise HTTPException(400, "Prompt exceeds 1000 characters")
    
    if not is_veo3_enabled():
        raise HTTPException(503, "Veo 3 is not configured")
    
    file_id = str(uuid.uuid4())
    output_path = f"/tmp/social-studio-uploads/{file_id}_veo3.mp4"
    
    async def event_generator():
        try:
            async for progress in generate_video(
                prompt=prompt,
                output_path=output_path,
                api_key=os.environ["GOOGLE_VEO3_API_KEY"],
                project_id=os.environ["GOOGLE_VEO3_PROJECT_ID"],
            ):
                yield json.dumps(progress)
        except Exception as e:
            yield json.dumps({"status": "error", "message": str(e)})
    
    return EventSourceResponse(event_generator())
```

## Data Models

### Database Schema Changes

**1. Add video columns to `ss_platform_posts` table:**

```sql
ALTER TABLE ss_platform_posts ADD COLUMN media_type TEXT DEFAULT 'TEXT';
  -- Values: 'TEXT', 'VIDEO', 'SHORT'

ALTER TABLE ss_platform_posts ADD COLUMN video_file_path TEXT;
  -- Temporary file path (deleted after upload)

ALTER TABLE ss_platform_posts ADD COLUMN thumbnail_file_path TEXT;
  -- Custom thumbnail path (deleted after upload)

ALTER TABLE ss_platform_posts ADD COLUMN video_duration_seconds INTEGER;
  -- Duration extracted from video file

ALTER TABLE ss_platform_posts ADD COLUMN privacy_status TEXT DEFAULT 'public';
  -- Values: 'public', 'unlisted', 'private'

ALTER TABLE ss_platform_posts ADD COLUMN video_category_id TEXT DEFAULT '22';
  -- YouTube category ID (22 = People & Blogs)

ALTER TABLE ss_platform_posts ADD COLUMN made_for_kids INTEGER DEFAULT 0;
  -- YouTube "Made for Kids" declaration

ALTER TABLE ss_platform_posts ADD COLUMN video_source TEXT DEFAULT 'upload';
  -- Values: 'upload', 'veo3'

ALTER TABLE ss_platform_posts ADD COLUMN veo3_prompt TEXT;
  -- Original prompt if generated via Veo 3
```

**2. Create video upload tracking table:**

```sql
CREATE TABLE IF NOT EXISTS ss_video_uploads (
    id TEXT PRIMARY KEY,  -- UUID
    platform_post_id INTEGER REFERENCES ss_platform_posts(id),
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    duration_seconds INTEGER,
    format TEXT,  -- 'MP4', 'MOV', etc.
    resolution TEXT,  -- '1920x1080'
    upload_progress_bytes INTEGER DEFAULT 0,
    upload_status TEXT DEFAULT 'pending',  -- 'pending', 'uploading', 'completed', 'failed'
    source TEXT DEFAULT 'upload',  -- 'upload', 'veo3'
    veo3_prompt TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ssvid_pp ON ss_video_uploads(platform_post_id);
CREATE INDEX IF NOT EXISTS idx_ssvid_status ON ss_video_uploads(upload_status);
```

### Data Access Functions

**New store.py functions:**

```python
@DBOS.transaction()
def ss_create_video_upload(
    file_id: str,
    file_path: str,
    file_size: int,
    duration: int,
    format: str,
    resolution: str,
    source: str = "upload",
    veo3_prompt: Optional[str] = None,
) -> dict:
    """Store video upload metadata."""

@DBOS.transaction()
def ss_get_video_upload(file_id: str) -> Optional[dict]:
    """Retrieve video upload by ID."""

@DBOS.transaction()
def ss_update_upload_progress(file_id: str, uploaded_bytes: int) -> None:
    """Update upload progress for resumable uploads."""

@DBOS.transaction()
def ss_mark_video_uploaded(file_id: str) -> None:
    """Mark video upload complete."""

@DBOS.transaction()
def ss_cleanup_old_videos() -> int:
    """Delete video files older than 7 days. Returns count deleted."""

@DBOS.transaction()
def ss_create_platform_post_with_video(
    post_id: int,
    account_id: int,
    platform: str,
    caption: str,
    hashtags: str,
    video_file_id: str,
    thumbnail_file_id: Optional[str],
    metadata: dict,
) -> int:
    """Create platform_post with video metadata."""
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

Reviewing all testable properties from prework to eliminate redundancy:

**Video Format Validation (1.1, 1.4, 1.7):**
- 1.1 tests format acceptance
- 1.4 tests that validation happens before upload
- 1.7 tests error message for invalid formats
- **Decision**: Combine 1.1 and 1.4 into one property about format validation. Keep 1.7 as example.

**Video Size Validation (1.2, 1.5, 1.6):**
- 1.2 tests size limit acceptance
- 1.5 tests that validation happens before upload
- 1.6 tests error message for oversized files
- **Decision**: Combine 1.2 and 1.5 into one property about size validation. Keep 1.6 as example.

**Privacy Settings (3.3, 3.4, 3.5):**
- All three test privacy parameter mapping
- **Decision**: Combine into one property about privacy settings mapping correctly.

**Thumbnail Format/Size/Resolution (4.1, 4.2, 4.3):**
- All test thumbnail validation
- **Decision**: Combine into one comprehensive thumbnail validation property.

**Metadata Character Limits (2.1, 2.2, 2.5):**
- 2.1 tests title limit
- 2.2 tests description limit
- 2.5 tests description truncation
- **Decision**: Keep separate as they test different behaviors (acceptance vs truncation).

**Upload Progress/Resumability (6.4, 6.5):**
- Both test resumable upload protocol
- **Decision**: Combine into one property about resumable uploads.

**Publisher Video Detection (7.1, 7.2):**
- 7.1 tests detection of video content
- 7.2 tests calling correct provider
- **Decision**: Combine into one property about video content routing.

**Shorts Title Handling (5.2, 13.2):**
- Both test #Shorts tag addition
- One at UI level, one at provider level
- **Decision**: Keep provider-level property (13.2) as it's the actual implementation.

**File Cleanup (10.3, 10.4, 10.5):**
- All test cleanup behavior
- **Decision**: Keep all separate as they test different cleanup scenarios (success, failure, age).

**Filename Uniqueness (10.2):**
- Tests UUID generation uniqueness
- **Decision*