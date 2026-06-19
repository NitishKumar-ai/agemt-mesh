# Facebook OAuth Setup Guide

⚠️ **IMPORTANT: Facebook Publishing is No Longer Available** ⚠️

As of 2024, Facebook has **deprecated all publishing permissions** for third-party apps. The `pages_manage_posts` permission is no longer valid and cannot be requested, even in Development Mode or through App Review.

## What This Means

- ✅ You **CAN** connect Facebook accounts and read Page data
- ✅ You **CAN** view Page analytics and engagement metrics
- ✅ You **CAN** generate content for Facebook
- ❌ You **CANNOT** automatically publish posts to Facebook Pages
- ❌ App Review **WILL NOT** grant publishing permissions

## Alternatives

### Option 1: Manual Publishing (Recommended)
1. Generate content in Social Studio
2. Copy the generated text
3. Manually post to Facebook through their web interface or mobile app

### Option 2: Use Meta Business Suite API
Meta now requires businesses to use their official Business Suite for publishing. This requires:
- Business verification with Meta
- Using Meta's official tools
- Not available for third-party apps

### Option 3: Use Other Platforms
Consider focusing on platforms with better API access:
- **Instagram** - Still supports posting (with review)
- **Threads** - Newer platform with active API
- **LinkedIn** - Great API support
- **Twitter/X** - Open API
- **Bluesky** - Open protocol

## Why Connect Facebook Then?

Even without publishing, connecting Facebook is useful for:
- Reading Page analytics and insights
- Generating platform-specific content
- Monitoring engagement metrics
- Planning content strategy

## Setup Instructions (Read-Only Access)

If you still want to connect Facebook for analytics:

## Prerequisites

- A Facebook account
- Access to [Meta for Developers](https://developers.facebook.com/)

## Step 1: Create a Facebook App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **"My Apps"** → **"Create App"**
3. Select **"Business"** as the app type (for posting to Pages)
4. Fill in the app details:
   - **App name**: `AgentMesh` (or your preferred name)
   - **App contact email**: Your email
   - **Business account**: Select or create one (optional)
5. Click **"Create App"**

## Step 2: Add Facebook Login Product

1. From your app dashboard, click **"Add Product"**
2. Find **"Facebook Login"** and click **"Set Up"**
3. Select **"Web"** as the platform
4. Enter your site URL (e.g., `http://localhost:8000`)

## Step 3: Configure OAuth Settings

1. Go to **"Facebook Login"** → **"Settings"** in the left sidebar
2. Under **"Valid OAuth Redirect URIs"**:
   
   **For Development:**
   - ✅ `http://localhost` redirects are automatically allowed in development mode
   - No need to add localhost URIs manually
   
   **For Production:**
   Add your production callback URL:
   ```
   https://yourdomain.com/api/social-studio/oauth/facebook/callback
   ```
3. Click **"Save Changes"**

## Step 4: Get Your App Credentials

1. Go to **"Settings"** → **"Basic"** in the left sidebar
2. Copy your **App ID** (this is your `client_id`)
3. Copy your **App Secret** (this is your `client_secret`)
   - You may need to click **"Show"** and enter your Facebook password

## Step 5: Request Permissions (IMPORTANT - Facebook Restrictions)

**⚠️ Facebook has significantly restricted publishing permissions as of 2024:**

- `pages_manage_posts` - **DEPRECATED**
- `pages_read_user_content` - **DEPRECATED**

**Currently available permissions:**
- ✅ **`pages_show_list`** - View list of Pages you manage
- ✅ **`pages_read_engagement`** - Read engagement metrics
- ✅ **`public_profile`** - Basic profile info
- ✅ **`email`** - User email

**To publish posts to Facebook Pages, you now need:**
1. **Business Asset User Profile Access** (requires business verification)
2. OR use the **Facebook Business Suite** or **Meta Business Suite** API
3. OR apply for **Content Publishing API** access (requires app review)

For most use cases, consider using **Meta Business Suite API** or **Instagram** instead, as Facebook has made it increasingly difficult for third-party apps to post to Pages.

## Step 6: Set App Mode

1. Toggle the app mode from **"Development"** to **"Live"** when ready for production
2. In development mode, only app administrators, developers, and testers can authorize

## Step 7: Configure Environment Variables

Add your Facebook credentials to `.env`:

```env
FACEBOOK_APP_ID=your_app_id_here
FACEBOOK_APP_SECRET=your_app_secret_here
```

## Step 8: Test the Integration

1. Start your backend server:
   ```bash
   python api.py
   ```

2. Navigate to Social Studio → Connections → Connect Account → Facebook
3. Click **"Connect with Facebook"**
4. You should be redirected to Facebook to authorize
5. Select the Page you want to post to
6. After authorization, you'll be redirected back

## OAuth Flow Implementation

Add these endpoints to `api.py`:

```python
@app.get("/api/social-studio/oauth/facebook/login")
async def ss_facebook_oauth_login():
    """Start Facebook OAuth flow."""
    from agents.social_studio.providers.facebook import FacebookProvider
    
    client_id = os.getenv("FACEBOOK_APP_ID")
    if not client_id:
        raise HTTPException(500, "FACEBOOK_APP_ID not set")
    
    provider = FacebookProvider(credentials={"client_id": client_id})
    redirect_uri = "http://localhost:8000/api/social-studio/oauth/facebook/callback"
    url = provider.get_auth_url(redirect_uri=redirect_uri, state="mesh_oauth_facebook")
    return RedirectResponse(url)

@app.get("/api/social-studio/oauth/facebook/callback")
async def ss_facebook_oauth_callback(code: str = "", state: str = "", error: str = ""):
    """Handle Facebook OAuth callback."""
    if error:
        return RedirectResponse(f"http://localhost:3000/social-studio?error={error}")
    
    from agents.social_studio.providers.facebook import FacebookProvider
    from store import ss_connect_account
    
    client_id = os.getenv("FACEBOOK_APP_ID")
    client_secret = os.getenv("FACEBOOK_APP_SECRET")
    
    provider = FacebookProvider(credentials={
        "client_id": client_id,
        "client_secret": client_secret
    })
    redirect_uri = "http://localhost:8000/api/social-studio/oauth/facebook/callback"
    
    tokens = provider.exchange_code(code, redirect_uri)
    profile = provider.get_profile(tokens.access_token)
    
    ss_connect_account(
        platform="facebook",
        account_id=profile.platform_id,
        display_name=profile.name,
        username=profile.handle,
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        avatar_url=profile.avatar_url,
        follower_count=profile.follower_count
    )
    
    return RedirectResponse("http://localhost:3000/social-studio?success=facebook")
```

## Current Status: Read-Only Access

```python
# Valid Facebook permissions (as of 2024+)
required_scopes = [
    "pages_show_list",           # View Pages
    "pages_read_engagement",      # Read metrics
    "public_profile",             # Basic profile
]

# DEPRECATED - NO LONGER AVAILABLE:
# ❌ "pages_manage_posts" - REMOVED by Facebook
# ❌ "pages_read_user_content" - REMOVED by Facebook  
# ❌ "email" - Requires App Review
```

**Facebook has shut down third-party publishing. This integration can:**
- ✅ Generate Facebook-optimized content
- ✅ Read Page analytics
- ✅ Monitor engagement
- ❌ **Cannot publish posts automatically**

Users must manually copy generated content and post through Facebook's interface.

## Important Notes

### Facebook Pages vs Personal Profiles

- You **cannot** post to personal Facebook profiles via the API
- You must have a **Facebook Page** to use this integration
- The OAuth flow will let you select which Page to manage

### Page Access Tokens

- When you connect, you'll get a Page access token
- This token is specific to the selected Page
- Each Page needs a separate connection

## Troubleshooting

### Error: "Can't Load URL"
- Verify your redirect URI is exactly as configured in Facebook app settings
- Check for http vs https mismatch
- Ensure there are no trailing slashes

### Error: "App Not Setup"
- Make sure Facebook Login product is added to your app
- Verify OAuth redirect URIs are configured

### Error: "Invalid Scopes"
- Some permissions require App Review for production
- In development mode, you can only use your own account

### No Pages Available
- Make sure you are an admin of at least one Facebook Page
- Create a Facebook Page if you don't have one

## Production Deployment

When deploying to production:

1. **Update redirect URIs** in Facebook app settings:
   ```
   https://yourdomain.com/api/social-studio/oauth/facebook/callback
   ```

2. **Submit for App Review**:
   - Go to App Review → Permissions and Features
   - Request all required permissions
   - Provide screencasts and explanations of how you use each permission

3. **Switch to Live Mode**:
   - Toggle from Development to Live in app settings

4. **Set production environment variables**:
   ```env
   FACEBOOK_APP_ID=your_production_app_id
   FACEBOOK_APP_SECRET=your_production_app_secret
   ```

## Resources

- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login/)
- [Pages API Documentation](https://developers.facebook.com/docs/pages-api)
- [Graph API Reference](https://developers.facebook.com/docs/graph-api)
- [App Review Guide](https://developers.facebook.com/docs/app-review)
