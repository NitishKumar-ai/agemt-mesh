# Implementation Plan: YouTube Video Upload Workflow

## Overview

This plan implements video upload capabilities for YouTube through Social Studio, including file upload handling, AI video generation with Google Veo 3, metadata configuration, and UI integration. The implementation extends existing patterns (publisher.py, YouTubeProvider, SocialStudioPage) and adds new video-specific infrastructure.

## Tasks

- [x] 1. Database schema extensions for video support
  - Add video-related columns to ss_platform_posts table (media_type, video_file_path, thumbnail_file_path, video_duration_seconds, privacy_status, video_category_id, made_for_kids, video_source, veo3_prompt)
  - Create ss_video_uploads table for upload tracking
  - Create indexes for performance (platform_post_id, upload_status)
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 2. Database access functions in store.py
  - [x] 2.1 Implement video upload tracking functions
    - Create ss_create_video_upload() for storing video metadata
    - Create ss_get_video_upload() for retrieving upload records
    - Create ss_update_upload_progress() for resumable upload tracking
    - Create ss_mark_video_uploaded() to mark completion
    - _Requirements: 6.4, 6.5_

  - [x] 2.2 Implement video cleanup functions
    - Create ss_cleanup_old_videos() to delete files older than 7 days
    - Create ss_delete_video_file() for immediate deletion after success
    - _Requirements: 10.3, 10.4, 10.5_

  - [x] 2.3 Implement platform post creation with video
    - Create ss_create_platform_post_with_video() accepting video metadata
    - Store video file paths, duration, privacy settings, category
    - _Requirements: 12.1, 12.2, 12.3_

- [ ] 3. Google Veo 3 AI video generation client
  - [x] 3.1 Create veo3_client.py module
    - Implement generate_video() async function with SSE progress streaming
    - Implement validate_veo3_credentials() to check env vars
    - Implement is_veo3_enabled() configuration check
    - Handle API polling, video download, duration extraction via ffprobe
    - _Requirements: 14.4, 14.5, 14.6, 15.1, 15.2, 15.3_

  - [ ] 3.2 Add error handling for Veo 3 API
    - Handle quota exceeded errors with user-friendly messages
    - Handle invalid prompt validation errors
    - Handle network errors with retry logic
    - _Requirements: 14.8_

- [ ] 4. Backend API endpoints for video upload
  - [ ] 4.1 Implement POST /api/social-studio/upload-video
    - Accept multipart/form-data video files
    - Validate format (MP4, MOV, AVI, WMV, FLV, 3GP, WebM, MPEG)
    - Validate size (256GB max) and duration (12h max)
    - Store in /tmp/social-studio-uploads/ with UUID filename
    - Extract video metadata (duration, resolution) using ffprobe
    - Return file_id, file_path, size, duration
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 10.1, 10.2_

  - [ ] 4.2 Implement POST /api/social-studio/veo3/generate
    - Accept prompt (max 1000 characters) and account_id
    - Return SSE stream with progress events (queued, progress, complete, error)
    - Call veo3_client.generate_video() asynchronously
    - Save generated video to /tmp/social-studio-uploads/{uuid}_veo3.mp4
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3_

  - [ ] 4.3 Extend POST /api/social-studio/posts for video
    - Accept video_file_id, thumbnail_file_id, and video metadata fields
    - Create parent post and platform_posts with media_type VIDEO/SHORT
    - Store video file paths, privacy settings, category, and metadata
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 4.3, 5.1, 11.1, 11.2, 11.3_

  - [ ] 4.4 Implement GET /api/social-studio/video-upload/status/{file_id}
    - Query upload progress from ss_video_uploads table
    - Return uploaded_bytes, total_bytes, percent
    - _Requirements: 6.1, 6.2, 6.4_

- [ ] 5. Checkpoint - Ensure backend API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Publisher integration for video uploads
  - [ ] 6.1 Extend publish_platform_post() function
    - Add parameters: video_file_path, thumbnail_file_path, post_type, video_metadata
    - Detect VIDEO or SHORT post types
    - Construct PublishContent with media_files and extra metadata
    - Pass privacy_status, category_id, made_for_kids, tags, thumbnail_file to provider
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 6.2 Add video file cleanup to publisher
    - Delete temporary video and thumbnail files on successful publish
    - Preserve files on failure for retry
    - Log all video upload attempts with duration and status
    - _Requirements: 7.4, 10.3, 10.4_

  - [ ] 6.3 Add retry logic for video uploads
    - Use existing backoff logic for retryable video upload errors
    - Schedule retries with next_retry_at
    - _Requirements: 7.5_

- [ ] 7. YouTubeProvider enhancements
  - [ ] 7.1 Verify video upload support in publish_post()
    - Confirm handling of PostType.VIDEO and PostType.SHORT
    - Confirm resumable upload protocol implementation
    - Confirm thumbnail upload after video
    - _Requirements: 13.1, 13.3, 13.4, 13.5_

  - [ ] 7.2 Add #Shorts tag injection for SHORT post type
    - Check if "#Shorts" exists in title
    - Append "#Shorts" if missing when post_type is SHORT
    - _Requirements: 5.2, 13.2_

  - [ ] 7.3 Add error handling for YouTube-specific failures
    - Map YouTube API errors to user-friendly messages
    - Handle quota limit errors
    - Handle authentication errors
    - Handle format errors
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 8. Checkpoint - Ensure backend integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Frontend video upload UI components
  - [ ] 9.1 Create VideoSourceSelector component
    - Toggle between "Upload File" and "Generate with AI"
    - Conditionally show AI option only if Veo 3 is enabled
    - _Requirements: 14.1, 15.3_

  - [ ] 9.2 Create VideoFileUpload component
    - File picker for video selection
    - Display selected file name and size
    - Validate format client-side before upload
    - Validate size (256GB max) and show error for oversized files
    - Call POST /api/social-studio/upload-video endpoint
    - Display upload progress with percentage and estimated time remaining
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 6.1, 6.2, 8.3, 8.4, 8.5_

  - [ ] 9.3 Create Veo3Generator component
    - Prompt textarea with max 1000 character limit
    - Character count display
    - Generate button triggering SSE stream
    - Progress indicator showing generation status
    - Display generated video preview on completion
    - Error display for failed generation
    - _Requirements: 14.2, 14.3, 14.4, 14.5, 14.7, 14.8_

  - [ ] 9.4 Create VideoPreview component
    - HTML5 video player for preview
    - Display video duration
    - Show resolution and format info
    - _Requirements: 8.6, 14.7_

  - [ ] 9.5 Create VideoMetadataForm component
    - Title input field (max 100 chars) with character counter
    - Description textarea (max 5000 chars) with character counter
    - Tags input accepting comma/space-separated values
    - Privacy selector (Public, Unlisted, Private) with default Public
    - Post type selector (Regular Video, Short)
    - Made for Kids checkbox
    - Category selector dropdown with YouTube categories
    - Detect vertical aspect ratio + <60s duration and suggest Short type
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 5.1, 5.3, 11.1, 11.2, 11.3, 11.4_

  - [ ] 9.6 Create ThumbnailUpload component
    - Optional file picker for custom thumbnail
    - Validate PNG/JPEG formats
    - Validate minimum 1280x720 resolution
    - Validate max 2MB size
    - Display thumbnail preview
    - _Requirements: 4.1, 4.2, 4.3, 8.4_

  - [ ] 9.7 Create VideoUploadWorkflow parent component
    - Integrate all child components in proper flow order
    - Manage state for video source, file, metadata
    - Handle form submission to POST /api/social-studio/posts
    - Display success notification with video URL
    - Handle error display for upload failures
    - _Requirements: 6.3, 8.1, 8.2, 9.1, 9.2, 9.3, 9.4_

- [ ] 10. Integrate video workflow into SocialStudioPage
  - [ ] 10.1 Add YouTube platform detection
    - Show VideoUploadWorkflow when YouTube is selected
    - Hide text-only post composer when YouTube is selected
    - _Requirements: 8.1, 8.2_

  - [ ] 10.2 Wire up publish flow
    - Connect VideoUploadWorkflow to existing publish infrastructure
    - Handle successful publish with post list update
    - Display error notifications for publish failures
    - _Requirements: 8.1_

- [ ] 11. Video file cleanup background job
  - [ ] 11.1 Implement cleanup on startup
    - Call ss_cleanup_old_videos() on application startup
    - Delete files older than 7 days
    - _Requirements: 10.5_

  - [ ] 11.2 Implement hourly cleanup task
    - Schedule background job to run ss_cleanup_old_videos() every hour
    - Log cleanup activity (files deleted, disk space freed)
    - _Requirements: 10.5_

- [ ] 12. Error handling and user feedback
  - [ ] 12.1 Implement error message mapping
    - Map network errors to "Network error - upload will retry automatically"
    - Map auth errors to "Authentication expired - please reconnect your YouTube account"
    - Map quota errors to "Daily upload quota exceeded - try again tomorrow"
    - Map format errors to "Unsupported format - please convert to MP4 or MOV"
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 12.2 Add error logging to ss_publish_log
    - Log all upload attempts with status codes
    - Log error messages and response bodies
    - Log upload duration
    - _Requirements: 7.4, 9.5_

- [ ] 13. Final checkpoint - End-to-end testing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Video files are stored temporarily in /tmp/social-studio-uploads/ and deleted after successful upload or 7 days
- The YouTubeProvider already has resumable upload support implemented
- The publisher.py retry logic is reused for video uploads
- Frontend uses existing SocialStudioPage patterns for consistency
- Veo 3 AI generation is optional and only shown if credentials are configured
- All video metadata validation happens on both frontend and backend for security
