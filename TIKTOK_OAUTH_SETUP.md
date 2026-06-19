# TikTok OAuth Setup Guide

This guide walks you through setting up TikTok API integration for the Social Studio feature.

## Prerequisites

- A TikTok account
- Access to [TikTok for Developers](https://developers.tiktok.com/)
- Business verification may be required for some features

## Step 1: Register for TikTok Developer Access

1. Go to [TikTok for Developers](https://developers.tiktok.com/)
2. Click **"Register"** or **"Log in"**
3. Log in with your TikTok account
4. Complete the developer registration:
   - Accept Developer Terms of Service
   - Verify your email
   - Complete your profile

## Step 2: Create a TikTok App

1. Go to [TikTok Developer Portal](https://developers.tiktok.com/apps/)
2. Click **"+ Create App"**
3. Fill in app details:
   - **App name**: `AgentMesh Social Studio`
   - **Category**: Select appropriate category (e.g., "Social Media Management")
   - **Description**: Describe your social media management tool
4. Click **"Create"**

## Step 3: Configure App Settings

1. In your app dashboard, go to **"Basic Information"**
2. Add required information:
   - **App icon**: Upload a logo (recommended: 256x256px)
   - **Privacy Policy URL**: Your privacy policy
   - **Terms of Service URL**: Your terms of service

## Step 4: Add Login Kit Product

1. In your app dashboard, find **"Products"**
2. Click **"Add Product"** 
3. Select **"Login Kit"**
4. Configure Login Kit settings:
   - **Redirect URI**:
     ```
     http://localhost:8000/api/social-studio/oauth/tiktok/callback
     http://127.0.0.1:8000/api/social-studio/oauth/tiktok/callback
     ```
5. Click **"Save"**

## Step 5: Request API Scopes

1. Go to **"API Scopes"** section
2. Request access to these scopes:
   - ✅ `user.info.basic` - Basic user profile
   - ✅ `video.upload` - Upload videos
   - ✅ `video.publish` - Publish videos
   - ✅ `video.list` - List user's videos

Some scopes require review and approval from TikTok.

## Step 6: Get App Credentials

1. Go to **"Basic Information"**
2. Copy your credentials:
   - **Client Key** (this is your `client_id`)
   - **Client Secret** (this is your `client_secret`)

## Step 7: Configure Environment Variables

Add your TikTok credentials to `.env`:

```env
TIKTOK_CLIENT_KEY=your_client_key_here
TIKTOK_CLIENT_SECRET=your_client_secret_here
```

## Step 8: Submit for Review (Production)

For production access:

1. Go to **"Submit for Review"**
2. Provide required information:
   - **App description**: Detailed explanation of your app
   - **Use case**: How you'll use each scope
   - **Screenshots/Videos**: Demo of your app functionality
   - **Testing instructions**: How reviewers can test your app
3. Submit and wait for approval (typically 2-5 business days)

## OAuth Flow Implementation

Add these endpoints to `api.py`:

```python
@app.get("/api/social-studio/oauth/tiktok/login")
async def ss_tiktok_oauth_login():
    """Start TikTok OAuth flow."""
    from agents.social_studio.providers.tiktok import TikTokProvider
    
    client_key = os.getenv("TIKTOK_CLIENT_KEY")
    if not client_key:
        raise HTTPException(500, "TIKTOK_CLIENT_KEY not set")
    
    provider = TikTokProvider(credentials={"client_id": client_key})
    redirect_uri = "http://localhost:8000/api/social-studio/oauth/tiktok/callback"
    url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_tiktok")
    return RedirectResponse(url)

@app.get("/api/social-studio/oauth/tiktok/callback")
async def ss_tiktok_oauth_callback(code: str = "", state: str = "", error: str = ""):
    """Handle TikTok OAuth callback."""
    if error:
        return RedirectResponse(f"http://localhost:3000/social-studio?error={error}")
    
    from agents.social_studio.providers.tiktok import TikTokProvider
    from store import ss_connect_account
    
    client_key = os.getenv("TIKTOK_CLIENT_KEY")
    client_secret = os.getenv("TIKTOK_CLIENT_SECRET")
    
    provider = TikTokProvider(credentials={
        "client_id": client_key,
        "client_secret": client_secret
    })
    redirect_uri = "http://localhost:8000/api/social-studio/oauth/tiktok/callback"
    
    # Exchange code for tokens
    tokens = provider.exchange_code(code, redirect_uri)
    
    # Get profile
    profile = provider.get_profile(tokens.access_token)
    
    ss_connect_account(
        platform="tiktok",
        account_id=profile.platform_id,
        display_name=profile.name,
        username=profile.handle,
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        avatar_url=profile.avatar_url,
        follower_count=profile.follower_count
    )
    
    return RedirectResponse("http://localhost:3000/social-studio?success=tiktok")
```

## Scopes Required

```python
required_scopes = [
    "user.info.basic",    # User profile
    "video.upload",       # Upload videos
    "video.publish",      # Publish videos
    "video.list",         # List videos
]
```

## Content Publishing Features

### Supported Content Types
- ✅ Short-form videos (15-60 seconds)
- ✅ Video posts with captions (up to 2,200 characters)
- ✅ Privacy settings (public, friends, private)
- ✅ Comments control
- ✅ Duet and Stitch settings

### Video Requirements
- **Format**: MP4, MOV
- **Resolution**: Minimum 720p, recommended 1080p
- **Aspect ratio**: 9:16 (vertical), 1:1 (square), or 16:9 (horizontal)
- **Size**: Max 287MB
- **Length**: 15 seconds to 10 minutes
- **Frame rate**: 23-60 fps

### What's NOT Supported
- ❌ Photo posts (TikTok is video-only)
- ❌ Live streaming
- ❌ TikTok Stories (deprecated feature)
- ❌ Direct publishing from URLs (must upload video file)

## Publishing Flow

TikTok uses a multi-step upload process:

1. **Initialize upload** - Get upload URL and session
2. **Upload video** - Upload video file in chunks
3. **Create post** - Publish with caption and settings

The provider handles this automatically in the `publish_post` method.

## Rate Limits

### User API
- **Upload**: 20 videos per day per user
- **Queries**: 100 requests per day per user

### Open API
- **Rate limit**: 100 QPM (queries per minute)
- **Daily quota**: Varies by access level

Monitor these headers in responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

## Troubleshooting

### Error: "Invalid Redirect URI"
- Verify redirect URI in TikTok app settings matches exactly
- No trailing slashes
- Must be HTTPS in production

### Error: "Insufficient Scope"
- Required scope not granted during OAuth
- Request scope approval in Developer Portal
- Re-authorize the user with updated scopes

### Error: "Video Upload Failed"
- Check video meets requirements (format, size, resolution)
- Ensure video file is not corrupted
- Verify upload URL hasn't expired

### Error: "Account Not Eligible"
- TikTok account may have restrictions
- Account must be in good standing
- Some regions may have limited API access

### Publishing Fails with "Spam Detection"
- TikTok has strict anti-spam measures
- Avoid posting identical content multiple times
- Space out posts (don't post too frequently)
- Vary your content

## Token Management

### Access Tokens
- Valid for **24 hours** by default
- Some tokens may have longer expiration

### Refresh Tokens
- Use to get new access tokens without re-authorization
- Implement refresh before token expiration

```python
# Refresh token before expiration
if token_expires_soon():
    new_tokens = provider.refresh_token(refresh_token)
    update_stored_tokens(new_tokens)
```

## Production Deployment

### 1. Update Redirect URIs

In TikTok app settings:
```
https://yourdomain.com/api/social-studio/oauth/tiktok/callback
```

### 2. Complete App Review

- Provide comprehensive documentation
- Include video demonstrations
- Explain data usage and privacy practices
- Wait for TikTok approval (2-5 business days typically)

### 3. Business Verification (if required)

Some features require business verification:
- Submit business documentation
- Provide company registration details
- Wait for verification approval

### 4. Set Production URLs

Update all references from localhost to production URLs:
```env
TIKTOK_CLIENT_KEY=your_production_client_key
TIKTOK_CLIENT_SECRET=your_production_client_secret
```

## Best Practices

### Content Guidelines
- Follow TikTok Community Guidelines
- Ensure content is appropriate for all audiences
- Respect copyright and intellectual property
- Include proper music licensing if using copyrighted audio

### Video Optimization
- Use vertical video format (9:16) for best mobile experience
- Keep videos engaging in first 3 seconds
- Add captions for accessibility
- Use trending sounds and hashtags appropriately

### API Usage
- Implement chunked upload for large videos
- Add retry logic with exponential backoff
- Monitor rate limits proactively
- Cache responses when appropriate

### Security
- Store credentials securely
- Never expose client secret in client-side code
- Validate all file uploads before processing
- Implement CSRF protection

## Testing

### Sandbox Environment
TikTok provides limited sandbox testing:
- Test with your own account first
- Use smaller video files for faster testing
- Verify all metadata before production

### Common Test Scenarios
1. Upload minimum duration video (15 seconds)
2. Upload maximum duration video
3. Test different aspect ratios
4. Verify caption length limits
5. Test privacy settings

## Limitations and Considerations

### Content Restrictions
- No political content in some regions
- Age-restricted content requires special handling
- Copyrighted music may be automatically removed

### Geographic Restrictions
- API availability varies by region
- Some features unavailable in certain countries
- Check TikTok's regional policies

### Account Requirements
- Account must be active and in good standing
- Some features require minimum follower count
- Business accounts may have additional capabilities

## Resources

- [TikTok for Developers](https://developers.tiktok.com/)
- [TikTok API Documentation](https://developers.tiktok.com/doc)
- [Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [Login Kit Documentation](https://developers.tiktok.com/doc/login-kit-web)
- [Community Guidelines](https://www.tiktok.com/community-guidelines)
- [Developer Support](https://developers.tiktok.com/support)
