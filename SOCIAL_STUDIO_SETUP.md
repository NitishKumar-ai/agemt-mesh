# Social Studio Setup Guide

Complete guide for setting up OAuth integrations for all supported social media platforms in Agent Mesh Social Studio.

## Overview

Social Studio supports **8 major social media platforms**:

- 🔵 **LinkedIn** (Personal & Company Pages)
- 📸 **Instagram** (Business Accounts)
- 🦋 **Bluesky** (AT Protocol)
- @ **Threads** (Meta)
- 🐦 **Twitter/X**
- 📘 **Facebook** (Pages)
- 🎵 **TikTok**

## Quick Start

### 1. Choose Your Platforms

Each platform has different requirements and capabilities. Choose based on your needs:

| Platform | Auth Type | Best For | Approval Required |
|----------|-----------|----------|-------------------|
| LinkedIn | OAuth 2.0 | Professional content, B2B | Yes (for posting) |
| Instagram | OAuth 2.0 | Visual content, Stories, Reels | Yes |
| Bluesky | Session | Decentralized social, Twitter alternative | No |
| Threads | OAuth 2.0 | Text + images, Meta ecosystem | Yes |
| Twitter/X | OAuth 2.0 | Real-time updates, short-form | Optional (Elevated) |
| Facebook | OAuth 2.0 | Pages, long-form, communities | Yes |
| TikTok | OAuth 2.0 | Short-form video | Yes |

### 2. Follow Platform-Specific Guides

Each platform has a dedicated setup guide:

- 📘 [LinkedIn OAuth Setup](./LINKEDIN_OAUTH_SETUP.md)
- 📘 [LinkedIn Company Setup](./LINKEDIN_COMPANY_SETUP.md)
- 📸 [Instagram OAuth Setup](./INSTAGRAM_OAUTH_SETUP.md)
- @ [Threads OAuth Setup](./THREADS_OAUTH_SETUP.md)
- 🐦 [Twitter/X OAuth Setup](./TWITTER_OAUTH_SETUP.md)
- 📘 [Facebook OAuth Setup](./FACEBOOK_OAUTH_SETUP.md)
- 🎵 [TikTok OAuth Setup](./TIKTOK_OAUTH_SETUP.md)

### 3. Configure Environment Variables

Create or update your `.env` file with credentials for each platform you want to support:

```env
# LinkedIn
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret

# Instagram (uses Facebook app)
INSTAGRAM_APP_ID=your_facebook_app_id
INSTAGRAM_APP_SECRET=your_facebook_app_secret

# Threads (uses Facebook/Meta app)
THREADS_APP_ID=your_threads_app_id
THREADS_APP_SECRET=your_threads_app_secret

# Twitter/X
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_BEARER_TOKEN=your_bearer_token

# Facebook
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# TikTok
TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret

# Bluesky (per-user, no app-level credentials needed)
# Users provide handle + app password when connecting
```

## OAuth Redirect URIs Reference

When configuring OAuth apps, use these redirect URIs:

### Development (localhost)

**Meta Platforms (Facebook, Instagram, Threads):**
- ✅ `http://localhost` redirects are automatically allowed in development mode
- No manual configuration needed

**Other Platforms:**
```
http://localhost:8000/api/social-studio/oauth/linkedin/callback
http://localhost:8000/api/social-studio/oauth/twitter/callback
http://localhost:8000/api/social-studio/oauth/tiktok/callback
```

### Production
```
https://yourdomain.com/api/social-studio/oauth/linkedin/callback
https://yourdomain.com/api/social-studio/oauth/instagram/callback
https://yourdomain.com/api/social-studio/oauth/threads/callback
https://yourdomain.com/api/social-studio/oauth/twitter/callback
https://yourdomain.com/api/social-studio/oauth/facebook/callback
https://yourdomain.com/api/social-studio/oauth/tiktok/callback
```

## Platform Comparison

### Content Types Supported

| Platform | Text | Image | Video | Carousel | Stories | Polls |
|----------|------|-------|-------|----------|---------|-------|
| LinkedIn | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Instagram | ✅ | ✅ | ✅ (Reels) | ✅ | ✅ | ❌ |
| Bluesky | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Threads | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Twitter/X | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Facebook | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| TikTok | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

### Character Limits

| Platform | Text Limit | Notes |
|----------|-----------|-------|
| LinkedIn | 3,000 | Professional articles can be longer |
| Instagram | 2,200 | Captions |
| Bluesky | 300 | Grapheme count |
| Threads | 500 | Text threads |
| Twitter/X | 280 | 4,000 for Twitter Blue |
| Facebook | 63,206 | Practically unlimited |
| TikTok | 2,200 | Video captions |

### Rate Limits (Typical)

| Platform | Posts/Day | API Calls/Hour | Notes |
|----------|-----------|----------------|-------|
| LinkedIn | 150 | 200 | Per user |
| Instagram | 25 | 200 | Via Graph API |
| Bluesky | Unlimited* | 5,000 | Self-hosted limits vary |
| Threads | 250 | 200 | Per user |
| Twitter/X | Varies | Varies | Based on tier (Free/Basic/Elevated) |
| Facebook | 200 | 200 | Per Page |
| TikTok | 20 | 100 | Per user |

*Bluesky technically unlimited but respect community norms

## Development Workflow

### 1. Initial Setup

```bash
# Clone repository
git clone <your-repo>
cd agent-mesh

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Configure at least one platform in .env
```

### 2. Start Development Server

```bash
# Start backend
python api.py

# In another terminal, start frontend
cd frontend
npm install
npm run dev
```

### 3. Test OAuth Flow

1. Navigate to `http://localhost:3000/social-studio`
2. Click **"Connections"** tab
3. Click **"+ Connect Account"**
4. Select a platform
5. Complete OAuth authorization
6. Verify account appears in connected accounts list

### 4. Test Publishing

1. Go to **"Generate"** tab
2. Enter a topic
3. Click **"Generate Content"**
4. Review generated posts for each platform
5. Click **"Publish"** to test live posting

## Production Deployment Checklist

### Pre-Deployment

- [ ] All OAuth apps approved for production
- [ ] Environment variables configured with production credentials
- [ ] Redirect URIs updated to production domain (HTTPS)
- [ ] Privacy Policy and Terms of Service published
- [ ] App logos and branding configured

### OAuth Apps

- [ ] LinkedIn: "Share on LinkedIn" product enabled
- [ ] Instagram: Business verification complete
- [ ] Threads: App review approved
- [ ] Twitter: Elevated access (if needed)
- [ ] Facebook: Page permissions approved
- [ ] TikTok: App review approved

### Security

- [ ] Use secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] Enable HTTPS everywhere
- [ ] Implement CSRF protection
- [ ] Add rate limiting
- [ ] Set up monitoring and alerts
- [ ] Regular security audits

### Code Updates

Update redirect URIs in `api.py` for each platform:

```python
# Change from:
redirect_uri = "http://localhost:8000/api/social-studio/oauth/linkedin/callback"

# To:
redirect_uri = "https://yourdomain.com/api/social-studio/oauth/linkedin/callback"
```

Also update frontend redirect URL after OAuth:

```python
# Change from:
return RedirectResponse("http://localhost:3000/social-studio?success=linkedin")

# To:
return RedirectResponse("https://yourdomain.com/social-studio?success=linkedin")
```

## Common Issues & Solutions

### "OAuth Redirect URI Mismatch"
- Verify redirect URI matches exactly in both app settings and code
- Check for trailing slashes
- Ensure http/https protocol matches

### "Invalid Credentials"
- Verify environment variables are loaded correctly
- Check for typos in client IDs and secrets
- Ensure `.env` file is in the correct location
- Restart server after updating `.env`

### "Insufficient Permissions"
- Verify all required scopes/permissions are requested
- Check if app review is required for certain permissions
- Ensure user has necessary roles (e.g., Page admin for Facebook)

### "Rate Limit Exceeded"
- Implement exponential backoff retry logic
- Cache API responses when appropriate
- Monitor rate limit headers
- Consider upgrading to higher tier if available

### "Token Expired"
- Implement automatic token refresh
- Store refresh tokens securely
- Handle token expiration gracefully with re-authentication flow

## Testing Tips

### Use Test Accounts

Most platforms provide test accounts for development:
- **Facebook/Instagram/Threads**: Create test users in app dashboard
- **Twitter**: Use a dedicated test account
- **TikTok**: Use sandbox environment if available

### Test All Features

- ✅ OAuth connection flow
- ✅ Profile fetching
- ✅ Text-only posts
- ✅ Posts with media
- ✅ Multiple media items (carousels)
- ✅ Analytics/metrics fetching
- ✅ Token refresh
- ✅ Error handling
- ✅ Rate limit handling

### Monitor API Quotas

Set up monitoring for:
- Daily API call counts
- Rate limit approaching warnings
- Failed requests
- Token expiration

## Support & Resources

### Platform Developer Portals

- [LinkedIn Developers](https://www.linkedin.com/developers/)
- [Meta for Developers](https://developers.facebook.com/) (Instagram, Threads, Facebook)
- [Twitter Developer Portal](https://developer.twitter.com/)
- [TikTok for Developers](https://developers.tiktok.com/)
- [Bluesky Documentation](https://atproto.com/)

### API Documentation

- [LinkedIn API Docs](https://learn.microsoft.com/en-us/linkedin/)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)
- [Threads API](https://developers.facebook.com/docs/threads)
- [Twitter API v2](https://developer.twitter.com/en/docs/twitter-api)
- [Facebook Graph API](https://developers.facebook.com/docs/graph-api)
- [TikTok API](https://developers.tiktok.com/doc)
- [AT Protocol (Bluesky)](https://atproto.com/specs/atp)

### Community

- Join platform developer communities
- Follow platform developer Twitter/X accounts for updates
- Subscribe to API change logs
- Monitor status pages for outages

## Next Steps

1. **Choose 1-2 platforms** to start with based on your target audience
2. **Complete OAuth setup** for those platforms using the specific guides
3. **Test thoroughly** in development
4. **Submit for app review** if required
5. **Deploy to production** once approved
6. **Monitor and optimize** based on usage patterns

Need help? Check the individual platform setup guides linked above for detailed instructions.
