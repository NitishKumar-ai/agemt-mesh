# Threads API Setup Guide

## Prerequisites

You need a **Meta app with Threads use case** enabled. When you create an app with Threads, Meta provides **2 separate App IDs**:
- Facebook App ID
- **Threads App ID** ← Use this one for Threads API

## Setup Steps

### 1. Create Meta App with Threads Use Case

1. Go to [Meta for Developers](https://developers.facebook.com/apps/)
2. **Create new app** or select existing app
3. **Add Threads** as a use case/product
4. Note the **Threads App ID** and **Threads App Secret** (different from Facebook credentials)

### 2. Configure OAuth Redirect URI

1. In your app dashboard → Threads → Settings
2. Add **Valid OAuth Redirect URIs**:
   - Development: `http://localhost:8000/api/social-studio/oauth/threads/callback`
   - Production: `https://yourdomain.com/api/social-studio/oauth/threads/callback`

### 3. Add Yourself as Threads Tester

**CRITICAL**: You must be a Threads Tester to use the API permissions without App Review.

1. Go to **App Dashboard** → **App roles** → **Roles** tab
2. Click **Add People** button
3. Select **Threads Tester**
4. Enter your Facebook/Threads username or email
5. Send invitation

### 4. Accept Threads Tester Invitation

1. Open **Threads app** or go to [threads.net](https://www.threads.net/)
2. Sign in to your account
3. Go to **Account Settings** → **Website permissions**
4. Accept the Threads Tester invitation

### 5. Update Environment Variables

In your `.env` file, use the **Threads-specific credentials**:

```env
# Use the Threads App ID (NOT the Facebook App ID)
THREADS_APP_ID=YOUR_THREADS_APP_ID_HERE
THREADS_APP_SECRET=YOUR_THREADS_APP_SECRET_HERE
```

**Important**: The Threads App ID is different from your Facebook App ID.

### 6. Test Connection

1. **Restart backend server** to load new credentials
2. Go to **Social Studio** → Connections
3. Click **Connect Account** → **Threads**
4. Authorize with your Threads Tester account
5. You should see all Threads permissions in the consent screen

## Permissions

Your app will request these permissions:

- ✅ `threads_basic` - Access profile and read Threads
- ✅ `threads_content_publish` - Publish new Threads
- ✅ `threads_manage_insights` - View analytics
- ✅ `threads_manage_replies` - Manage replies/comments

**For Threads Testers**: All permissions work immediately without App Review.

**For Public Users**: Requires App Review approval for each permission.

## Access Token Validity

- **Short-lived tokens**: Valid for 1 hour (exchanged for long-lived automatically)
- **Long-lived tokens**: Valid for 60 days
- **Permission grants**: Valid for 90 days (public profiles only)
- **Private profiles**: Permissions cannot be refreshed, must re-authorize

## Troubleshooting

### "Invalid Scopes" Error
- **Cause**: Not added as Threads Tester, or tester invitation not accepted
- **Fix**: Follow steps 3-4 above to become a Threads Tester

### "No app ID was sent"
- **Cause**: Using Facebook App ID instead of Threads App ID
- **Fix**: Use the Threads-specific App ID from your app dashboard

### "Authorization failed"
- **Cause**: Incorrect redirect URI or app not in correct mode
- **Fix**: Verify redirect URI matches exactly in app settings

## Production Deployment

For public users (non-testers):

1. **Submit for App Review**:
   - Go to App Dashboard → App Review → Permissions and Features
   - Request each Threads permission
   - Provide use case description and demo video
   - Wait for Meta approval (1-3 days typically)

2. **Publish your app**:
   - Switch app mode from Development to Live
   - All approved permissions will work for public users

3. **Update redirect URIs**:
   - Add production domain to Valid OAuth Redirect URIs
   - Update environment variables with production URLs

## References

- [Threads API Documentation](https://developers.facebook.com/docs/threads)
- [Getting Started Guide](https://developers.facebook.com/docs/threads/get-started)
- [Threads Sample App](https://github.com/fbsamples/threads_api)
- [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/)
