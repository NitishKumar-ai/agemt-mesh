# YouTube OAuth Setup Guide

## Error: Access Blocked - Google Verification Process

You're seeing this error because your Google Cloud project is in "Testing" mode and hasn't completed Google's verification process. This is normal for development and requires adding test users.

## Solution: Add Test Users to Your Google Cloud Project

### Step 1: Go to Google Cloud Console
1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (the one with your OAuth credentials)

### Step 2: Configure OAuth Consent Screen
1. In the left sidebar, go to **APIs & Services** → **OAuth consent screen**
2. You should see your app is in "Testing" mode

### Step 3: Add Test Users
1. Scroll down to the **Test users** section
2. Click **+ ADD USERS**
3. Add your Gmail address: `shreeharshastark@gmail.com`
4. Add any other email addresses that need access
5. Click **SAVE**

### Step 4: Retry Connection
1. Go back to Social Studio
2. Try connecting YouTube again
3. The OAuth flow should now work

## Important Notes

### Testing Mode vs Production
- **Testing Mode** (current): Limited to 100 test users, no verification needed
- **Production Mode**: Requires Google verification process, takes 1-6 weeks
- For development/personal use, Testing mode is sufficient

### Required Scopes for YouTube
The app requests these scopes:
- `https://www.googleapis.com/auth/youtube.upload` - Upload videos
- `https://www.googleapis.com/auth/youtube.readonly` - Read channel info
- `https://www.googleapis.com/auth/youtube.force-ssl` - Full access via HTTPS

### Optional Analytics Scope
If you want advanced analytics:
- `https://www.googleapis.com/auth/yt-analytics.readonly` - YouTube Analytics data

## Alternative: Use Your Developer Account

If you're the project owner:
1. Make sure you're signed in with the Google account that owns the Cloud project
2. You should automatically have access as the developer
3. The error suggests you might be using a different Google account

## Troubleshooting

### "Developer-approved testers" Error
- **Cause**: Your email is not in the test users list
- **Fix**: Add your email as a test user (see Step 3 above)

### Multiple Google Accounts
- Make sure you're using the same account that owns the Google Cloud project
- Try signing out of all Google accounts and signing in with just the project owner account
- Use Incognito/Private mode to avoid account conflicts

### Still Getting Errors?
1. Verify the OAuth Client ID and Secret match what's in your `.env` file
2. Check that the redirect URI is correctly configured:
   ```
   http://localhost:8000/api/social-studio/oauth/youtube/callback
   ```
3. Make sure you've enabled the YouTube Data API v3 in your Google Cloud project

## Environment Variables

Verify these are set in your `.env` file:

```bash
# Google OAuth (for YouTube)
PLATFORM_GOOGLE_CLIENT_ID=your_client_id_here
PLATFORM_GOOGLE_CLIENT_SECRET=your_client_secret_here
```

## Publishing to Production (Optional)

If you want to allow any Google user to connect:

1. **Prepare for Verification**:
   - Add privacy policy URL
   - Add terms of service URL
   - Verify domain ownership
   - Provide app demo video

2. **Submit for Verification**:
   - In OAuth consent screen, click **PUBLISH APP**
   - Fill out the verification questionnaire
   - Wait 1-6 weeks for Google review

3. **Requirements**:
   - Homepage URL must be HTTPS
   - Privacy policy and ToS must be publicly accessible
   - App must comply with Google API Services User Data Policy

For most development and personal use cases, staying in Testing mode is recommended.
