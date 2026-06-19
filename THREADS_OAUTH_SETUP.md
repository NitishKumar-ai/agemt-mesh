# Threads OAuth Setup Guide

This guide walks you through setting up Threads API integration for the Social Studio feature.

## Prerequisites

- A Threads account (linked to your Instagram)
- Access to [Meta for Developers](https://developers.facebook.com/)
- Your Threads account must be a **public account** (not private)

## Important: Threads API Requirements

⚠️ **Threads API requires:**
- A **public Threads account** (private accounts cannot use the API)
- A Meta (Facebook) Developer account
- App review approval for production use

## Step 1: Create Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **"My Apps"** → **"Create App"**
3. Select **"Business"** as the app type
4. Fill in app details:
   - **App name**: `AgentMesh` (or your preferred name)
   - **App contact email**: Your email
5. Click **"Create App"**

## Step 2: Add Threads Product

1. From your app dashboard, scroll to **"Add products to your app"**
2. Find **"Threads"** and click **"Set Up"**
3. The Threads API will be added to your app

## Step 3: Configure OAuth Settings

1. In the left sidebar, find **"Threads"** section
2. Click on **"Settings"** under Threads
3. Under **"OAuth Redirect URIs"**:
   
   **For Development:**
   - ✅ `http://localhost` redirects are automatically allowed in development mode
   - No need to add localhost URIs manually
   
   **For Production:**
   Add your production callback URL:
   ```
   https://yourdomain.com/api/social-studio/oauth/threads/callback
   ```
4. Click **"Save Changes"**

## Step 4: Get App Credentials

1. Go to **"Settings"** → **"Basic"** in the left sidebar
2. Copy your **App ID** (this is your `client_id` or `app_id`)
3. Copy your **App Secret** (this is your `client_secret` or `app_secret`)

## Step 5: Configure Environment Variables

Add your Threads credentials to `.env`:

```env
THREADS_APP_ID=your_app_id_here
THREADS_APP_SECRET=your_app_secret_here
```

## Step 6: Request Permissions (Production)

For production access, submit your app for review:

1. Go to **"App Review"** → **"Permissions and Features"**
2. Request these permissions:
   - ✅ **`threads_basic`** - Basic profile information
   - ✅ **`threads_content_publish`** - Publish threads and replies
   - ✅ **`threads_manage_insights`** - View analytics and metrics
   - ✅ **`threads_manage_replies`** - Manage replies to your threads

## OAuth Flow Implementation

Add these endpoints to `api.py`:

```python
@app.get("/api/social-studio/oauth/threads/login")
async def ss_threads_oauth_login():
    """Start Threads OAuth flow."""
    from agents.social_studio.providers.threads import ThreadsProvider
    
    client_id = os.getenv("THREADS_APP_ID")
    if not client_id:
        raise HTTPException(500, "THREADS_APP_ID not set")
    
    provider = ThreadsProvider(credentials={"client_id": client_id})
    redirect_uri = "http://localhost:8000/api/social-studio/oauth/threads/callback"
    url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_threads")
    return RedirectResponse(url)

@app.get("/api/social-studio/oauth/threads/callback")
async def ss_threads_oauth_callback(code: str = "", state: str = "", error: str = ""):
    """Handle Threads OAuth callback."""
    if error:
        return RedirectResponse(f"http://localhost:3000/social-studio?error={error}")
    
    from agents.social_studio.providers.threads import ThreadsProvider
    from store import ss_connect_account
    
    client_id = os.getenv("THREADS_APP_ID")
    client_secret = os.getenv("THREADS_APP_SECRET")
    
    provider = ThreadsProvider(credentials={
        "client_id": client_id,
        "client_secret": client_secret
    })
    redirect_uri = "http://localhost:8000/api/social-studio/oauth/threads/callback"
    
    # Exchange code for token (automatically gets long-lived token)
    tokens = provider.exchange_code(code, redirect_uri)
    
    # Get profile
    profile = provider.get_profile(tokens.access_token)
    
    ss_connect_account(
        platform="threads",
        account_id=profile.platform_id,
        display_name=profile.name,
        username=profile.handle,
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        avatar_url=profile.avatar_url,
        follower_count=profile.follower_count
    )
    
    return RedirectResponse("http://localhost:3000/social-studio?success=threads")
```

## Scopes Required

```python
required_scopes = [
    "threads_basic",              # Profile access
    "threads_content_publish",    # Post threads
    "threads_manage_insights",    # Analytics
    "threads_manage_replies",     # Manage replies
]
```

## Content Publishing Features

### Supported Content Types
- ✅ Text posts (up to 500 characters)
- ✅ Single image posts
- ✅ Single video posts
- ✅ Carousel posts (multiple images/videos)
- ✅ Reply threads
- ✅ Quote posts

### Media Requirements
- **Images**: JPEG, PNG
- **Videos**: MP4, MOV
- **Text limit**: 500 characters
- Media must be hosted on a **publicly accessible HTTPS URL**

### What's NOT Supported
- ❌ Stories (Threads doesn't have stories)
- ❌ Direct publishing from local files (must use URLs)
- ❌ Private account posting

## Token Management

Threads uses a two-step token exchange:

1. **Short-lived token** (1 hour) - received after OAuth
2. **Long-lived token** (60 days) - exchanged automatically by the provider

The provider handles this automatically in the `exchange_code` method.

## Troubleshooting

### Error: "Account is Private"
- Threads API only works with public accounts
- Go to Threads app → Settings → Privacy → Make your account public

### Error: "Invalid OAuth Redirect URI"
- Verify redirect URI in Meta app settings matches exactly
- Check for trailing slashes
- Ensure http vs https matches your local setup

### Error: "Invalid Scopes"
- Some permissions require App Review for production
- Development mode works with your own account only

### Error: "Could not determine Threads user_id"
- The user may not have a Threads account
- Or the Threads account may not be public
- Ensure the Instagram account linked to Threads is accessible

### Publishing Fails: "Media URL not accessible"
- Threads must be able to access media URLs via HTTPS
- Test URLs in a browser to ensure they're publicly accessible
- localhost URLs won't work - use a tunneling service like ngrok

## Development vs Production

### Development Mode
- Only you (the app developer) can authorize
- No submission required
- Great for testing

### Production Mode
- Any Threads user can authorize
- Requires App Review approval
- Must provide:
  - Privacy Policy
  - Terms of Service
  - Detailed use case explanations
  - Video demonstration

## Production Deployment

### 1. Update Redirect URIs

In Meta app settings:
```
https://yourdomain.com/api/social-studio/oauth/threads/callback
```

### 2. Submit for App Review

1. Go to **App Review** → **Permissions and Features**
2. For each permission, provide:
   - **Detailed explanation** of how you'll use it
   - **Screencast** showing the feature
   - Privacy Policy and Terms links

### 3. Switch to Live Mode

Toggle app from Development to Live

### 4. Implement Token Refresh

Long-lived tokens expire after 60 days. Implement refresh:

```python
# Refresh token before expiration
refreshed_tokens = provider.refresh_token(current_access_token)
# Update stored access_token in database
```

## Best Practices

### Rate Limiting
- **Default limits**: 250 posts per day per user
- Implement retry logic with exponential backoff
- Monitor rate limit headers in responses

### Content Guidelines
- Follow Threads Community Guidelines
- Don't post spam or repetitive content
- Respect user privacy and data

### Media Hosting
- Host media on CDN for reliability
- Use HTTPS only
- Optimize image/video sizes for faster processing

## Resources

- [Threads API Documentation](https://developers.facebook.com/docs/threads)
- [Threads Publishing Guide](https://developers.facebook.com/docs/threads/publish)
- [Threads Insights](https://developers.facebook.com/docs/threads/insights)
- [Meta App Review Process](https://developers.facebook.com/docs/app-review)
