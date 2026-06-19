# Instagram Direct Login Setup Guide

This guide explains how to set up **Instagram API with Business Login for Instagram** - the NEW way to publish to Instagram that works WITHOUT requiring a Facebook Page.

## Why Two Instagram Options?

Your Social Studio now has TWO Instagram integrations:

1. **Instagram** (via Facebook Login) - ❌ Read-only, deprecated, requires Facebook Page
2. **Instagram (Direct)** (via Instagram Login) - ✅ Full publishing, works standalone

This guide is for **Instagram (Direct)** - the one that actually works.

## Prerequisites

- **Professional Instagram Account** (Business or Creator type)
  - Personal accounts have NO API access (Instagram Basic Display API was retired Dec 2024)
  - Convert at: Instagram Settings → Account type and tools → Switch to professional account (FREE)
- A Meta (Facebook) Developer Account
- Your existing Meta app (or create a new one)

## Step 1: Add Instagram API Use Case

1. Go to your Meta App: https://developers.facebook.com/apps/
2. In the left sidebar, click **Use cases**
3. Click **Add** next to "Instagram API"
4. Accept the terms

## Step 2: Get Instagram App Credentials

**IMPORTANT**: Despite what the Meta UI shows, you use the SAME Facebook App credentials for Instagram Login. The "Instagram App ID" shown is just UI labeling, not a separate app.

1. Go to **Settings** → **Basic** in your Meta App
2. Copy your **App ID** (same as Facebook App ID)
3. Copy your **App Secret** (same as Facebook App Secret)

These are the SAME credentials as your Facebook/Threads integration.

## Step 3: Configure OAuth Redirect URI

1. Still in **API setup with Instagram Login**
2. Go to **Step 4: Set up Instagram business login**
3. Click **Set up**
4. Add redirect URI (must match EXACTLY, including trailing slash):
   ```
   http://localhost:8000/api/social-studio/oauth/instagram_login/callback
   ```
5. For production, also add:
   ```
   https://yourdomain.com/api/social-studio/oauth/instagram_login/callback
   ```

## Step 4: Request Permissions

1. Go to **Permissions and features** (in left sidebar)
2. Add these permissions:
   - ✅ `instagram_business_basic` - Basic account info
   - ✅ `instagram_business_content_publish` - Publish posts
   - ✅ `instagram_business_manage_comments` - Manage comments
   - ✅ `instagram_business_manage_insights` - Read analytics
   - ✅ `instagram_business_manage_messages` - Read/send DMs (optional)

**Note:** These require **App Review** for production use, but work in Development Mode for testing.

## Step 5: Configure Webhooks (Optional but Recommended)

1. Under **API setup with Instagram Login** → **Step 3: Configure webhooks**
2. Set:
   - **Callback URL**: `http://localhost:8000/webhooks/instagram_login/` (or your domain)
   - **Verify token**: Generate a random string and save it
3. Click **Verify and save**
4. Subscribe to fields: `messages`, `comments`, `mentions`

## Step 6: Environment Variables

Add these to your `.env` file:

```env
# Instagram Direct Login credentials
# Uses the SAME Facebook App ID and Secret (not a separate Instagram app)
INSTAGRAM_LOGIN_APP_ID=1407597041207580
INSTAGRAM_LOGIN_APP_SECRET=your_facebook_app_secret_here

# Webhook verify token (from Step 5, if using webhooks)
INSTAGRAM_LOGIN_WEBHOOK_VERIFY_TOKEN=your_random_token_here
```

## Step 7: Test the Integration

1. **Start your backend**:
   ```bash
   py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
   ```

2. **Go to Social Studio** → **Connections**

3. **Connect Instagram (Direct)** - NOT the regular Instagram option

4. **Authorize** with your Professional Instagram account

5. **Generate and publish a test post**

## Development vs Production

### Development Mode
- App is in Development Mode by default
- Only app admins/developers/testers can connect
- All permissions work without App Review
- Perfect for testing

### Production Mode (Going Live)
1. **Submit for App Review**:
   - Go to **App Review** → **Permissions and features**
   - Request each `instagram_business_*` permission
   - Provide use case descriptions and screencasts
   
2. **Business Verification**:
   - Required for Advanced Access
   - Verify your business with Meta
   
3. **Switch to Live**:
   - Toggle app from Development to Live mode
   - Update redirect URIs to production domains

## Troubleshooting

### "Account type not supported"
- Your Instagram account must be **Professional** (Business or Creator)
- Convert at: Instagram Settings → Account → Switch to professional account

### "Invalid OAuth redirect URI"
- Redirect URI must match EXACTLY (including http vs https and trailing slash)
- Check for typos in your Meta app settings

### "Permission denied"
- Make sure you're an admin/developer of the Meta app
- Check that app is in Development Mode for testing
- Verify permissions are added in Meta App Dashboard

### "No permissions granted"
- When connecting, make sure to grant ALL requested permissions
- Don't click "Skip" or deny any permissions

## Comparison: Instagram vs Instagram (Direct)

| Feature | Instagram (Facebook Login) | Instagram (Direct) |
|---------|---------------------------|-------------------|
| **Status** | Deprecated ❌ | Active ✅ |
| **Publishing** | No | Yes |
| **Requires Facebook Page** | Yes | No |
| **Account Type** | Business linked to Page | Professional (Business/Creator) |
| **OAuth Flow** | Facebook Login | Instagram Login |
| **App Credentials** | Facebook App ID/Secret | Instagram App ID/Secret |
| **Use This For** | Legacy analytics only | Publishing posts ✅ |

## Resources

- [Instagram API Documentation](https://developers.facebook.com/docs/instagram-api)
- [Business Login for Instagram](https://developers.facebook.com/docs/instagram-api/overview#authentication)
- [Permissions Reference](https://developers.facebook.com/docs/permissions/reference)
- [Content Publishing](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)

## Summary

**Instagram (Direct)** uses Instagram's modern API that:
- ✅ Works with Professional Instagram accounts
- ✅ No Facebook Page required
- ✅ Full publishing capability
- ✅ Better suited for social media management tools
- ⚠️ Requires App Review for production (but works in dev mode)

This is the Instagram integration you should use going forward!
