# Requirements Document

## Introduction

The YouTube Video Upload Workflow enables users to upload videos to YouTube through the Social Studio interface. Unlike text-based platforms (Twitter, LinkedIn, Facebook), YouTube is video-only and requires a dedicated workflow that handles video file uploads, metadata configuration, privacy settings, thumbnail customization, and support for both regular videos and YouTube Shorts. The system also supports AI-powered video generation using Google Veo 3, allowing users to create videos from text prompts without recording equipment.

## Glossary

- **Video_Upload_System**: The dedicated YouTube video publishing workflow in Social Studio
- **Upload_Manager**: The component handling video file storage and transfer to YouTube
- **Metadata_Form**: The UI component collecting title, description, tags, and settings
- **YouTubeProvider**: The existing backend provider with resumable upload support
- **Publisher**: The backend publishing orchestrator (publisher.py)
- **Social_Studio_UI**: The React/TypeScript frontend interface
- **Short**: A vertical video under 60 seconds designed for YouTube Shorts
- **Regular_Video**: Standard horizontal YouTube video content
- **Resumable_Upload**: YouTube's chunked upload protocol supporting large files
- **Custom_Thumbnail**: User-provided image for video preview (1280x720px recommended)
- **Veo_3**: Google's AI video generation model that creates videos from text prompts
- **AI_Video_Generator**: The component that interfaces with Google Veo 3 API for video generation
- **Video_Prompt**: Text description up to 1000 characters used to generate AI video content

## Requirements

### Requirement 1: Video File Upload

**User Story:** As a content creator, I want to upload video files to YouTube, so that I can publish video content through Social Studio.

#### Acceptance Criteria

1. THE Video_Upload_System SHALL accept video files in MP4, MOV, AVI, WMV, FLV, 3GP, WebM, and MPEG formats
2. THE Video_Upload_System SHALL accept video files up to 256GB in size
3. THE Video_Upload_System SHALL accept video files up to 12 hours in duration
4. WHEN a user provides a video file, THE Upload_Manager SHALL validate file format before upload
5. WHEN a user provides a video file, THE Upload_Manager SHALL validate file size before upload
6. IF a video file exceeds 256GB, THEN THE Video_Upload_System SHALL display an error message stating the size limit
7. IF a video file format is unsupported, THEN THE Video_Upload_System SHALL display an error message listing supported formats

### Requirement 2: Video Metadata Configuration

**User Story:** As a content creator, I want to add titles, descriptions, and tags to my videos, so that viewers can discover my content.

#### Acceptance Criteria

1. THE Metadata_Form SHALL accept video titles up to 100 characters
2. THE Metadata_Form SHALL accept video descriptions up to 5000 characters
3. THE Metadata_Form SHALL accept hashtags as comma-separated or space-separated tags
4. WHEN a user enters a title exceeding 100 characters, THE Metadata_Form SHALL display a character count warning
5. WHEN a user enters a description exceeding 5000 characters, THE Metadata_Form SHALL truncate at 5000 characters
6. THE Metadata_Form SHALL display remaining character counts for title and description fields

### Requirement 3: Privacy Settings Control

**User Story:** As a content creator, I want to control video privacy settings, so that I can manage who can view my content.

#### Acceptance Criteria

1. THE Metadata_Form SHALL provide privacy options: Public, Unlisted, and Private
2. THE Video_Upload_System SHALL default privacy setting to Public
3. WHEN a user selects Private, THE Video_Upload_System SHALL publish the video visible only to the account owner
4. WHEN a user selects Unlisted, THE Video_Upload_System SHALL publish the video accessible only via direct link
5. WHEN a user selects Public, THE Video_Upload_System SHALL publish the video visible in search results and channel listings

### Requirement 4: Custom Thumbnail Upload

**User Story:** As a content creator, I want to upload custom thumbnails for my videos, so that I can improve video presentation and click-through rates.

#### Acceptance Criteria

1. THE Metadata_Form SHALL accept thumbnail images in PNG and JPEG formats
2. THE Metadata_Form SHALL accept thumbnail images with minimum resolution 1280x720 pixels
3. THE Metadata_Form SHALL accept thumbnail images up to 2MB in size
4. WHEN a user uploads a custom thumbnail, THE Upload_Manager SHALL upload the thumbnail after successful video upload
5. IF thumbnail upload fails, THEN THE Video_Upload_System SHALL publish the video with YouTube auto-generated thumbnail
6. WHEN no custom thumbnail is provided, THE Video_Upload_System SHALL allow YouTube to auto-generate the thumbnail

### Requirement 5: YouTube Shorts Support

**User Story:** As a content creator, I want to publish YouTube Shorts, so that I can reach audiences consuming short-form vertical content.

#### Acceptance Criteria

1. THE Metadata_Form SHALL provide a post type selector with options: Regular Video and Short
2. WHEN a user selects Short post type, THE Video_Upload_System SHALL add "#Shorts" hashtag to the video title if not already present
3. WHEN a user uploads a video with vertical aspect ratio (9:16) under 60 seconds, THE Video_Upload_System SHALL suggest Short post type
4. THE Video_Upload_System SHALL publish Shorts using the same upload flow as Regular Videos

### Requirement 6: Upload Progress Tracking

**User Story:** As a content creator, I want to see upload progress for my videos, so that I know when large uploads will complete.

#### Acceptance Criteria

1. WHEN a video upload begins, THE Video_Upload_System SHALL display upload progress as a percentage
2. WHEN a video upload is in progress, THE Video_Upload_System SHALL display estimated time remaining
3. WHEN a video upload completes, THE Video_Upload_System SHALL display a success notification with the video URL
4. THE Video_Upload_System SHALL use resumable upload protocol for videos larger than 10MB
5. IF an upload is interrupted, THEN THE Upload_Manager SHALL resume from the last successful chunk

### Requirement 7: Publisher Integration

**User Story:** As a developer, I want the publisher to handle video uploads, so that YouTube integrates consistently with other platforms.

#### Acceptance Criteria

1. THE Publisher SHALL detect video content by checking for media_files in PublishContent
2. WHEN PublishContent contains media_files, THE Publisher SHALL call YouTubeProvider with video file paths
3. THE Publisher SHALL pass privacy settings, title, description, tags, and thumbnail to YouTubeProvider
4. THE Publisher SHALL log all upload attempts with status, duration, and error messages
5. IF video upload fails with a retryable error, THEN THE Publisher SHALL schedule retry using existing backoff logic

### Requirement 8: Social Studio UI Integration

**User Story:** As a content creator, I want to upload videos through the Social Studio interface, so that I have a unified publishing experience.

#### Acceptance Criteria

1. WHEN YouTube is selected as the target platform, THE Social_Studio_UI SHALL display the video upload workflow
2. WHEN YouTube is selected, THE Social_Studio_UI SHALL hide text-only post options
3. THE Social_Studio_UI SHALL provide a file picker for video selection
4. THE Social_Studio_UI SHALL provide an optional file picker for thumbnail selection
5. THE Social_Studio_UI SHALL display video file name and size after selection
6. THE Social_Studio_UI SHALL provide a preview of selected video before upload

### Requirement 9: Error Handling and User Feedback

**User Story:** As a content creator, I want clear error messages when uploads fail, so that I can fix issues and retry.

#### Acceptance Criteria

1. IF video upload fails due to network error, THEN THE Video_Upload_System SHALL display "Network error - upload will retry automatically"
2. IF video upload fails due to invalid token, THEN THE Video_Upload_System SHALL display "Authentication expired - please reconnect your YouTube account"
3. IF video upload fails due to quota limit, THEN THE Video_Upload_System SHALL display "Daily upload quota exceeded - try again tomorrow"
4. IF video upload fails due to unsupported format, THEN THE Video_Upload_System SHALL display "Unsupported format - please convert to MP4 or MOV"
5. THE Video_Upload_System SHALL log all errors to the publish_log table with error codes and messages

### Requirement 10: Video File Storage

**User Story:** As a developer, I want to store uploaded videos temporarily, so that the system can handle the upload to YouTube reliably.

#### Acceptance Criteria

1. WHEN a user uploads a video file, THE Upload_Manager SHALL store the file in a temporary upload directory
2. THE Upload_Manager SHALL generate a unique filename to prevent collisions
3. WHEN video upload to YouTube completes successfully, THE Upload_Manager SHALL delete the temporary file
4. IF video upload fails with non-retryable error, THEN THE Upload_Manager SHALL delete the temporary file after 24 hours
5. THE Upload_Manager SHALL clean up temporary files older than 7 days on system startup

### Requirement 11: Category and Additional Metadata

**User Story:** As a content creator, I want to set video categories and additional YouTube-specific metadata, so that my videos are properly categorized.

#### Acceptance Criteria

1. THE Metadata_Form SHALL provide a category selector with YouTube standard categories
2. THE Video_Upload_System SHALL default to "People & Blogs" category (category ID 22)
3. THE Metadata_Form SHALL provide a checkbox for "Made for Kids" declaration
4. WHEN a user checks "Made for Kids", THE Video_Upload_System SHALL set selfDeclaredMadeForKids to true in the upload request
5. THE Video_Upload_System SHALL pass category ID in the snippet.categoryId field to YouTubeProvider

### Requirement 12: Database Schema Extension

**User Story:** As a developer, I want to extend the database schema to support video uploads, so that video metadata is properly stored.

#### Acceptance Criteria

1. THE Video_Upload_System SHALL add a media_type column to platform_posts table with values: TEXT, VIDEO, SHORT
2. THE Video_Upload_System SHALL add a video_file_path column to platform_posts table
3. THE Video_Upload_System SHALL add a thumbnail_file_path column to platform_posts table
4. THE Video_Upload_System SHALL add a video_duration_seconds column to platform_posts table
5. THE Video_Upload_System SHALL add a privacy_status column to platform_posts table with values: public, unlisted, private

### Requirement 13: YouTubeProvider Video Upload Support

**User Story:** As a developer, I want YouTubeProvider to handle video uploads with all metadata, so that the backend can publish videos correctly.

#### Acceptance Criteria

1. THE YouTubeProvider SHALL accept PublishContent with post_type VIDEO or SHORT
2. WHEN PublishContent.post_type is SHORT, THE YouTubeProvider SHALL ensure "#Shorts" appears in the title
3. THE YouTubeProvider SHALL use resumable upload protocol via UPLOAD_BASE URL
4. THE YouTubeProvider SHALL upload custom thumbnails when thumbnail_file is provided in extra
5. THE YouTubeProvider SHALL return video ID and watch URL in PublishResult

### Requirement 14: AI Video Generation with Google Veo 3

**User Story:** As a content creator, I want to generate videos from text prompts using Google Veo 3, so that I can create video content without recording equipment.

#### Acceptance Criteria

1. THE Video_Upload_System SHALL provide an option to select between "Generate Video with AI" or "Upload Video File"
2. WHEN a user selects "Generate Video with AI", THE Video_Upload_System SHALL display a prompt text field
3. THE Video_Upload_System SHALL accept AI video prompts up to 1000 characters
4. WHEN a user submits an AI video prompt, THE Video_Upload_System SHALL call Google Veo 3 API to generate the video
5. THE Video_Upload_System SHALL display generation progress with status updates
6. WHEN video generation completes, THE Video_Upload_System SHALL automatically populate the video file for upload
7. THE Video_Upload_System SHALL allow users to preview the AI-generated video before uploading to YouTube
8. IF video generation fails, THEN THE Video_Upload_System SHALL display error message and allow retry

### Requirement 15: Veo 3 Configuration

**User Story:** As a developer, I want to configure Veo 3 API credentials, so that the system can generate videos.

#### Acceptance Criteria

1. THE Video_Upload_System SHALL read GOOGLE_VEO3_API_KEY from environment variables
2. THE Video_Upload_System SHALL read GOOGLE_VEO3_PROJECT_ID from environment variables
3. IF Veo 3 credentials are missing, THEN THE Video_Upload_System SHALL hide the "Generate Video with AI" option
4. THE Video_Upload_System SHALL validate Veo 3 API credentials on startup
