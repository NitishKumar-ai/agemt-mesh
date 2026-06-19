# Instagram Login OAuth Troubleshooting Guide

## Current Status

You're getting `PLATFORM__INVALID_APP_ID` error when trying to connect Instagram (Direct).

## Root Causes & Solutions

### Issue 1: OAuth Redirect URI Not Configured

**Problem**: Meta App doesn't have the OAuth redirect URI configured.

**Solution**:
1. Go to Meta App Dashboard: https://developers.facebook.com/apps/
2. Select your app (App ID: `1407597041207580`)
3. Navigate to: **Use cases** → **Instagram API** → **API setup with Instagram Login**
4. Find **Step 4: Set up Instagram business login**
5. Click **Configure** or **Set up**
6. Add this exact redirect URI:
   ```
   http://localhost:8000/api/social-studio/oauth/instagram_login/callback
   ```
7. Click **Save changes**

**Important**: The redirect URI must match EXACTLY (including `http://`, trailing slash, etc.)

### Issue 2: Instagram API Use Case Not Approved

**Problem**: The "Instagram API" use case isn't added to your Meta app.

**Solution**:
1. In Meta App Dashboard, go to **Use cases**
2. Click **Add** next to "Instagram API"
3. Accept the terms
4. The use case should show as "In development"

### Issue 3: Required Permissions Not Requested

**Problem**: Instagram Business permissions aren't added to your app.

**Solution**:
1. Go to **Use cases** → **Instagram API** 
2. Click **Permissions and features**
3. Add these permissions:
   - ✅ `instagram_business_basic`
   - ✅ `instagram_business_content_publish`
   - ✅ `instagram_business_manage_comments`
   - ✅ `instagram_business_manage_messages`
   - ✅ `instagram_business_manage_insights`

**Note**: In Development Mode, these work without App Review. For production, you need Meta approval.

### Issue 4: Wrong App ID

**Problem**: Using a non-existent Instagram App ID instead of Facebook App ID.

**Current Configuration**:
```env
INSTAGRAM_LOGIN_APP_ID=1407597041207580  # This is your Facebook App ID
INSTAGRAM_LOGIN_APP_SECRET=5275597a38b1c960780e5bd9d8c86b10
```

**Verification**:
The `846552378187092` you saw in Meta dashboard is likely just UI labeling, not a functional App ID. The Facebook App ID (`1407597041207580`) should work for Instagram Login.

### Issue 5: App Not in Development Mode

**Problem**: App is in Live mode but your Instagram account isn't added as a tester.

**Solution**:
1. Go to **App Settings** → **Basic**
2. Check if **App Mode** is "Development" or "Live"
3. If Development: Go to **Roles** → **Roles** → Add yourself as Test User
4. If Live: Add your Instagram account as a tester, or switch to Development mode for testing

## Webhook Configuration (OPTIONAL - Can Skip)

The webhook error you're seeing is SEPARATE from OAuth. You can skip webhook configuration entirely.

**If you want webhooks**:
1. You need a publicly accessible HTTPS URL (localhost won't work)
2. Use ngrok: `ngrok http 8000` to get a public URL
3. Configure webhook with that URL: `https://your-ngrok-url.ngrok-free.app/webhooks/instagram_login/`
4. Use verify token: `ph04Iow6gpCqlMIOMpm9p0EwMRlBH0HEqS45XvlTXQo`

**For now**: Just skip Step 3 (Configure webhooks) in Meta Dashboard

## Testing Checklist

Before trying to connect Instagram:

### Backend Configuration
- [x] `INSTAGRAM_LOGIN_APP_ID` is set in `.env`
- [x] `INSTAGRAM_LOGIN_APP_SECRET` is set in `.env`
- [x] Backend server is running on port 8000
- [x] Webhook endpoints are implemented in `api.py`

### Meta App Configuration
- [ ] "Instagram API" use case is added
- [ ] OAuth redirect URI is configured (Step 4)
- [ ] Required permissions are added
- [ ] App is in Development Mode (or your account is a tester)
- [ ] Your Instagram account is Professional (Business/Creator), not Personal

### Instagram Account Requirements
- [ ] Instagram account is converted to Professional
  - Open Instagram app → Settings → Account → Switch to professional account
- [ ] Account is Business or Creator type (not Personal)

## Testing Steps

1. **Verify backend is running**:
   ```bash
   py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
   ```

2. **Check OAuth URL generation**:
   Open in browser: `http://localhost:8000/api/social-studio/oauth/instagram_login/login`
   
   This should redirect you to Instagram OAuth page. If it redirects to `facebook.com/oauth/error`, the issue is with Meta App configuration (not our code).

3. **Test from Social Studio**:
   - Open: `http://localhost:5173/`
   - Go to Connections
   - Click "Connect Instagram (Direct)"
   - Authorize on Instagram
   - Should redirect back with success

## Common Errors & Fixes

### Error: `PLATFORM__INVALID_APP_ID`
**Cause**: App ID doesn't match what Meta expects, or redirect URI isn't configured.

**Fix**:
1. Verify App ID in `.env` matches Meta App ID
2. Check redirect URI is configured in Meta App (Step 4)
3. Ensure "Instagram API" use case is added

### Error: `redirect_uri_mismatch`
**Cause**: Redirect URI in request doesn't match what's configured in Meta App.

**Fix**:
- Meta App configuration: `http://localhost:8000/api/social-studio/oauth/instagram_login/callback`
- Must match exactly (check for typos, trailing slash, http vs https)

### Error: `access_denied` or `user_denied`
**Cause**: User clicked "Cancel" during OAuth, or doesn't have required account type.

**Fix**:
- Make sure Instagram account is Professional
- Try again and click "Allow" when prompted

### Error: `Invalid Scopes`
**Cause**: Requested permissions aren't available for your app.

**Fix**:
1. Go to Meta App → Permissions and features
2. Add the missing permissions
3. In Development Mode, most permissions are auto-approved

### Error: Redirects to `facebook.com/oauth/error` immediately
**Cause**: Instagram OAuth validates with Facebook, and Facebook rejects the request.

**Fix**:
- This means Meta App configuration is wrong
- Double-check App ID, redirect URI, and use case
- The OAuth URL is correct (`https://www.instagram.com/oauth/authorize`) - this is expected behavior

## Meta App Dashboard Navigation

Can't find the settings? Here's the exact path:

1. Go to: https://developers.facebook.com/apps/
2. Click on your app (should see App ID `1407597041207580`)
3. In the left sidebar:
   - **Use cases** → Add "Instagram API"
   - Click into "Instagram API"
   - **Permissions and features** → Add required permissions
   - **API setup with Instagram Login** → Complete Step 4 (OAuth redirect URI)
   - **Settings** → **Basic** → Verify App ID and secret

## Still Not Working?

### Debug OAuth URL

Run this to see what OAuth URL is being generated:

```bash
py -c "
from agents.social_studio.providers.instagram_login import InstagramLoginProvider
import os
from dotenv import load_dotenv
load_dotenv()

provider = InstagramLoginProvider(credentials={
    'client_id': os.getenv('INSTAGRAM_LOGIN_APP_ID'),
    'client_secret': os.getenv('INSTAGRAM_LOGIN_APP_SECRET')
})

url = provider.get_auth_url(
    redirect_uri='http://localhost:8000/api/social-studio/oauth/instagram_login/callback',
    state='test'
)

print('OAuth URL:')
print(url)
print()
print('Open this URL in your browser to test OAuth flow')
"
```

### Check Server Logs

When OAuth fails, check the backend logs:
```bash
# In terminal where uvicorn is running
# Look for errors after clicking "Connect Instagram (Direct)"
```

### Verify App ID

Double-check the App ID in Meta App Dashboard matches `.env`:
1. Meta App → Settings → Basic → App ID
2. Should be: `1407597041207580`
3. If different, update `.env` with the correct ID

## Alternative: Use Regular Instagram Provider

If Instagram Login continues to fail, you can try the regular Instagram provider (via Facebook Login):

1. Connect a Facebook Page first
2. Link your Instagram Business account to that Facebook Page
3. Use the regular "Instagram" (not "Instagram Direct") option

This requires:
- Facebook Page
- Instagram Business account linked to that Page
- Facebook OAuth (which you already have working)

## Next Steps

1. ✅ Complete Meta App configuration checklist above
2. ✅ Verify your Instagram account is Professional
3. ✅ Try connecting from Social Studio
4. ❌ If still failing, share the exact error message and we'll debug further

## Reference Links

- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)
- [Instagram Business Login Overview](https://developers.facebook.com/docs/instagram-api/overview#authentication)
- [Meta App Dashboard](https://developers.facebook.com/apps/)
- [Instagram Business Account Setup](https://help.instagram.com/502981923235522)
