# Twitter/X OAuth Setup Guide

This guide walks you through setting up Twitter/X API v2 integration for the Social Studio feature.

## Prerequisites

- A Twitter/X account
- Access to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
- Approved Twitter Developer account (may require application)

## Step 1: Apply for Developer Access

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Click **"Sign up"** if you don't have developer access
3. Fill out the application:
   - **Use case**: Select appropriate option (e.g., "Making a bot")
   - **Description**: Explain your Social Studio use case
   - Agree to Developer Agreement and Policy
4. Wait for approval (usually instant for basic access)

## Step 2: Create a Twitter App

1. Go to [Developer Portal Dashboard](https://developer.twitter.com/en/portal/dashboard)
2. Click **"+ Create Project"**
3. Fill in project details:
   - **Project name**: `AgentMesh`
   - **Use case**: Select appropriate option
   - **Project description**: Describe your social media management tool
4. Click **"Next"** and create an **App** within the project
5. **App name**: `AgentMesh Social Studio` (must be unique across Twitter)

## Step 3: Enable OAuth 2.0

1. In your app settings, go to **"User authentication settings"**
2. Click **"Set up"**
3. Configure OAuth 2.0:
   - **App permissions**: Select **"Read and write"**
   - **Type of App**: **"Web App, Automated App or Bot"**
   - **App info**:
     - **Callback URI / Redirect URL**:
       ```
       http://localhost:8000/api/social-studio/oauth/twitter/callback
       ```
     - **Website URL**: `http://localhost:8000` (or your domain)
4. Click **"Save"**

## Step 4: Get Your API Keys

1. Go to **"Keys and tokens"** tab
2. Copy the following:
   - **API Key** (this is your `client_id`)
   - **API Key Secret** (this is your `client_secret`)
   - **Bearer Token** (optional, for app-level requests)

Note: Keep these credentials secure! They provide access to your Twitter account.

## Step 5: Configure Environment Variables

Add your Twitter credentials to `.env`:

```env
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_BEARER_TOKEN=your_bearer_token_here
```

## Step 6: Elevated Access (Optional)

For higher rate limits and additional features:

1. Go to your **Project Settings**
2. Click **"Elevated"** access level
3. Fill out the application with your use case
4. Wait for approval (may take a few days)

**Benefits of Elevated Access:**
- Higher rate limits
- Access to v1.1 endpoints
- Media upload capabilities
- Better analytics

## OAuth Flow Implementation

Add these endpoints to `api.py`:

```python
@app.get("/api/social-studio/oauth/twitter/login")
async def ss_twitter_oauth_login():
    """Start Twitter OAuth 2.0 flow."""
    from agents.social_studio.providers.twitter import TwitterProvider
    import secrets
    
    client_id = os.getenv("TWITTER_API_KEY")
    if not client_id:
        raise HTTPException(500, "TWITTER_API_KEY not set")
    
    # Generate PKCE code challenge (simplified version)
    code_verifier = secrets.token_urlsafe(32)
    # Store code_verifier in session/cache for callback validation
    
    provider = TwitterProvider(credentials={"client_id": client_id})
    redirect_uri = "http://localhost:8000/api/social-studio/oauth/twitter/callback"
    url = provider.get_auth_url(
        redirect_uri=redirect_uri,
        state="mesh_oauth_twitter",
        code_challenge=code_verifier  # Simplified - use proper PKCE in production
    )
    return RedirectResponse(url)

@app.get("/api/social-studio/oauth/twitter/callback")
async def ss_twitter_oauth_callback(code: str = "", state: str = "", error: str = ""):
    """Handle Twitter OAuth callback."""
    if error:
        return RedirectResponse(f"http://localhost:3000/social-studio?error={error}")
    
    from agents.social_studio.providers.twitter import TwitterProvider
    from store import ss_connect_account
    
    client_id = os.getenv("TWITTER_API_KEY")
    client_secret = os.getenv("TWITTER_API_SECRET")
    
    provider = TwitterProvider(credentials={
        "client_id": client_id,
        "client_secret": client_secret
    })
    redirect_uri = "http://localhost:8000/api/social-studio/oauth/twitter/callback"
    
    # Exchange code for tokens
    # Retrieve code_verifier from session/cache
    code_verifier = "stored_code_verifier"  # Get from session
    tokens = provider.exchange_code(code, redirect_uri, code_verifier)
    
    # Get profile
    profile = provider.get_profile(tokens.access_token)
    
    ss_connect_account(
        platform="twitter",
        account_id=profile.platform_id,
        display_name=profile.name,
        username=profile.handle,
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        avatar_url=profile.avatar_url,
        follower_count=profile.follower_count
    )
    
    return RedirectResponse("http://localhost:3000/social-studio?success=twitter")
```

## Scopes Required

```python
required_scopes = [
    "tweet.read",       # Read tweets
    "tweet.write",      # Post tweets
    "users.read",       # Read user profiles
    "offline.access",   # Refresh token for long-term access
]
```

## Content Publishing Features

### Supported Content Types
- ✅ Text tweets (280 characters)
- ✅ Tweets with images (up to 4 images)
- ✅ Tweets with videos
- ✅ Polls (2-4 options, 5 min to 7 days duration)
- ✅ Threaded tweets
- ✅ Quote tweets
- ✅ Reply tweets

### Media Requirements
- **Images**: JPEG, PNG, GIF (max 5MB per image)
- **Videos**: MP4 (max 512MB, up to 140 seconds)
- **Animated GIFs**: Max 15MB
- **Text limit**: 280 characters (4000 for Twitter Blue)

## PKCE Implementation

Twitter requires PKCE (Proof Key for Code Exchange) for OAuth 2.0:

```python
import secrets
import hashlib
import base64

# Generate code verifier
code_verifier = secrets.token_urlsafe(32)

# Generate code challenge (use S256 method in production)
code_challenge = base64.urlsafe_b64encode(
    hashlib.sha256(code_verifier.encode()).digest()
).decode().rstrip('=')

# Store code_verifier in session for callback
# Use code_challenge in authorization URL
```

## Rate Limits

### Free Access (Essential)
- **Tweets**: 1,500 tweets per month
- **Tweet reads**: 10,000 per month
- **Users**: 1,000 lookups per month

### Basic ($100/month)
- **Tweets**: 3,000 tweets per month
- **Tweet reads**: 50,000 per month
- **Users**: 10,000 lookups per month

### Elevated (Free, requires approval)
- **Tweets**: Higher limits
- **Read limits**: Significantly higher
- Full v2 + v1.1 access

## Troubleshooting

### Error: "Invalid OAuth 2.0 Redirect URI"
- Ensure callback URL in Twitter app settings matches exactly
- No trailing slashes
- Must match protocol (http vs https)

### Error: "403 Forbidden"
- You may need Elevated access for certain operations
- Check if your app has write permissions enabled
- Verify your API keys are correct

### Error: "Invalid PKCE Code Verifier"
- Ensure you're storing and retrieving code_verifier correctly
- Code verifier must be 43-128 characters
- Must be the same value used in authorization

### Error: "Rate limit exceeded"
- You've hit your plan's rate limit
- Implement exponential backoff retry logic
- Consider upgrading to higher tier

### Media Upload Fails
- Ensure you have Elevated access for media uploads
- Media must meet size and format requirements
- Use chunked upload for large videos

## Production Deployment

### 1. Update Redirect URIs

In Twitter app settings:
```
https://yourdomain.com/api/social-studio/oauth/twitter/callback
```

### 2. Implement Proper PKCE

Use SHA256 code challenge method:
```python
code_challenge_method = "S256"
```

### 3. Secure Credential Storage

- Never commit API keys to version control
- Use environment variables or secrets manager
- Rotate keys regularly

### 4. Implement Token Refresh

OAuth 2.0 tokens expire. Implement refresh logic:

```python
if token_expired():
    new_tokens = provider.refresh_token(refresh_token)
    update_stored_tokens(new_tokens)
```

### 5. Monitor Rate Limits

Track rate limit headers:
- `x-rate-limit-limit` - Request limit
- `x-rate-limit-remaining` - Remaining requests
- `x-rate-limit-reset` - Reset timestamp

## Best Practices

### Content Guidelines
- Follow Twitter Rules and Policies
- Don't spam or post repetitive content
- Respect user privacy
- Include proper attributions

### API Usage
- Cache responses when possible
- Implement retry logic with exponential backoff
- Monitor rate limits proactively
- Use batch endpoints where available

### Security
- Use HTTPS in production
- Implement CSRF protection
- Validate all redirect URIs
- Rotate secrets regularly

## Resources

- [Twitter API Documentation](https://developer.twitter.com/en/docs/twitter-api)
- [OAuth 2.0 Authorization Flow](https://developer.twitter.com/en/docs/authentication/oauth-2-0/authorization-code)
- [Tweet Publishing](https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/introduction)
- [Rate Limits](https://developer.twitter.com/en/docs/twitter-api/rate-limits)
- [Developer Portal](https://developer.twitter.com/en/portal/dashboard)
