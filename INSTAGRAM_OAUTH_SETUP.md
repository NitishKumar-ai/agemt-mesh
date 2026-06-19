# Instagram OAuth Setup Guide

This guide walks you through setting up Instagram Business Account integration for the Social Studio feature.

## Prerequisites

- A Facebook account
- An Instagram Business or Creator account
- A Facebook Page connected to your Instagram account
- Access to [Meta for Developers](https://developers.facebook.com/)

## Important: Instagram Requirements

⚠️ **Instagram API requires:**
- An **Instagram Business Account** or **Instagram Creator Account** (not personal)
- A **Facebook Page** linked to the Instagram account
- Facebook app with Instagram product enabled

## Step 1: Convert to Instagram Business Account

If your Instagram account is personal, convert it first:

1. Open Instagram mobile app
2. Go to **Settings** → **Account**
3. Tap **"Switch to Professional Account"**
4. Choose **"Business"** or **"Creator"**
5. Connect to your Facebook Page

## Step 2: Create Facebook App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **"My Apps"** → **"Create App"**
3. Select **"Business"** as the app type
4. Fill in app details:
   - **App name**: `AgentMesh` (or your preferred name)
   - **App contact email**: Your email
5. Click **"Create App"**

## Step 3: Add Instagram Product

1. From your app dashboard, click **"Add Product"**
2. Find **"Instagram"** and click **"Set Up"**
3. The Instagram Basic Display or Instagram Graph API will be added

## Step 4: Add Facebook Login Product

Instagram API uses Facebook Login for authentication:

1. Click **"Add Product"** again
2. Find **"Facebook Login"** and click **"Set Up"**
3. Select **"Web"** as the platform

## Step 5: Configure OAuth Settings

1. Go to **"Facebook Login"** → **"Settings"**
2. Under **"Valid OAuth Redirect URIs"**:
   
   **For Development:**
   - ✅ `http://localhost` redirects are automatically allowed in development mode
   - No need to add localhost URIs manually
   
   **For Production:**
   Add your production callback URL:
   ```
   https://yourdomain.com/api/social-studio/oauth/instagram/callback
   ```
3. Click **"Save Changes"**

## Step 6: Get Your App Credentials

1. Go to **"Settings"** → **"Basic"**
2. Copy your **App ID** (client_id)
3. Copy your **App Secret** (client_secret)

## Step 7: Configure Environment Variables

Add your credentials to `.env`:

```env
INSTAGRAM_APP_ID=your_app_id_here
INSTAGRAM_APP_SECRET=your_app_secret_here
```

**Note:** Instagram uses the same Facebook app credentials, so you can reuse `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` if you're also setting up Facebook.

## Step 8: Request Permissions (Production)

For production, submit your app for review to get these permissions:

1. Go to **"App Review"** → **"Permissions and Features"**
2. Request these permissions:
   - ✅ **`instagram_basic`** - Basic profile access
   - ✅ **`instagram_content_publish`** - Publish photos, videos, and stories
   - ✅ **`instagram_manage_comments`** - Manage comments
   - ✅ **`instagram_manage_insights`** - View analytics and insights

## OAuth Flow Implementation

Add these endpoints to `api.py`:

```python
@app.get("/api/social-studio/oauth/instagram/login")
async def ss_instagram_oauth_login():
    """Start Instagram OAuth flow."""
    from agents.social_studio.providers.instagram import InstagramProvider
    
    client_id = os.getenv("INSTAGRAM_APP_ID")
    if not client_id:
        raise HTTPException(500, "INSTAGRAM_APP_ID not set")
    
    provider = InstagramProvider(credentials={"client_id": client_id})
    redirect_uri = "http://localhost:8000/api/social-studio/oauth/instagram/callback"
    url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_instagram")
    return RedirectResponse(url)

@app.get("/api/social-studio/oauth/instagram/callback")
async def ss_instagram_oauth_callback(code: str = "", state: str = "", error: str = ""):
    """Handle Instagram OAuth callback."""
    if error:
        return RedirectResponse(f"http://localhost:3000/social-studio?error={error}")
    
    from agents.social_studio.providers.instagram import InstagramProvider
    from store import ss_connect_account
    
    client_id = os.getenv("INSTAGRAM_APP_ID")
    client_secret = os.getenv("INSTAGRAM_APP_SECRET")
    
    provider = InstagramProvider(credentials={
        "client_id": client_id,
        "client_secret": client_secret
    })
    redirect_uri = "http://localhost:8000/api/social-studio/oauth/instagram/callback"
    
    # Exchange code for access token
    tokens = provider.exchange_code(code, redirect_uri)
    
    # Exchange for long-lived token
    long_lived = provider.refresh_token(tokens.access_token)
    
    # Get profile
    profile = provider.get_profile(long_lived.access_token)
    
    ss_connect_account(
        platform="instagram",
        account_id=profile.platform_id,
        display_name=profile.name,
        username=profile.handle,
        access_token=long_lived.access_token,
        refresh_token=long_lived.refresh_token,
        avatar_url=profile.avatar_url,
        follower_count=profile.follower_count
    )
    
    return RedirectResponse("http://localhost:3000/social-studio?success=instagram")
```

## Scopes Required

```python
required_scopes = [
    "instagram_basic",                # Profile access
    "instagram_content_publish",      # Post content
    "instagram_manage_comments",      # Manage comments
    "instagram_manage_insights",      # Analytics
]
```

## Content Publishing Limitations

### Supported Content Types
- ✅ Single photo posts
- ✅ Single video posts (Reels)
- ✅ Carousel posts (up to 10 items)
- ✅ Stories (photos and videos)

### Requirements
- **Images**: JPEG or PNG, max 8MB
- **Videos**: MP4, max 100MB, 3-60 seconds for feed, up to 15 seconds for stories
- **Aspect ratios**: 1:1 (square), 4:5 (portrait), 1.91:1 (landscape)
- Media must be hosted on a **publicly accessible URL** (HTTPS)

### What's NOT Supported
- ❌ Direct publishing to personal accounts
- ❌ IGTV posts (use Reels instead)
- ❌ Publishing to Instagram from local files (must use URLs)

## Troubleshooting

### Error: "No Instagram Business Account found"
- Ensure your Instagram account is a Business or Creator account
- Verify it's connected to a Facebook Page
- Check that you're an admin of the connected Facebook Page

### Error: "Invalid OAuth Redirect URI"
- Verify the redirect URI in Facebook app settings matches exactly
- Check for trailing slashes
- Ensure http vs https matches

### Error: "Invalid Scopes"
- In development mode, you can only test with accounts you admin
- For production, submit for App Review to get permissions

### Publishing Fails: "Media not ready"
- Instagram needs time to process media from URLs
- The provider includes automatic polling to wait for processing
- Ensure your media URLs are publicly accessible via HTTPS

### Error: "Media URL not accessible"
- Instagram must be able to access your media URLs
- URLs must be HTTPS (not HTTP)
- Test URLs in a browser to ensure they're publicly accessible

## Production Deployment

### 1. Update Redirect URIs

In Facebook app settings, update to production URLs:
```
https://yourdomain.com/api/social-studio/oauth/instagram/callback
```

### 2. Submit App Review

1. Go to **App Review** → **Permissions and Features**
2. Request all required Instagram permissions
3. Provide:
   - Detailed explanations of how you use each permission
   - Screencasts demonstrating the features
   - Privacy Policy and Terms of Service links

### 3. Switch to Live Mode

Toggle your app from **Development** to **Live** mode

### 4. Token Management

- Short-lived tokens expire in ~1 hour
- Exchange for long-lived tokens (60 days)
- Implement token refresh before expiration

## Resources

- [Instagram Graph API Documentation](https://developers.facebook.com/docs/instagram-api)
- [Instagram Content Publishing](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)
- [Instagram Insights](https://developers.facebook.com/docs/instagram-api/guides/insights)
- [Instagram Business Account Setup](https://help.instagram.com/502981923235522)
