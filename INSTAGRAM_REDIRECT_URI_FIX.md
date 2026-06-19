# Instagram Login Redirect URI Configuration Fix

## Problem
Meta is rejecting the redirect URI with "Error saving redirect URIs" when trying to configure Instagram Login.

## Why This Happens
- Instagram API setup has stricter requirements than Facebook Login
- Localhost may not be allowed for Instagram Login redirect URIs
- HTTPS is often required even for development

## Solutions (Try in Order)

### Solution 1: Use Facebook Login Settings Instead

Instagram Login uses Facebook's OAuth infrastructure, so you can configure the redirect URI under Facebook Login settings:

1. **Go to Meta App Dashboard**: https://developers.facebook.com/apps/
2. **Select your app** (App ID: 1407597041207580)
3. **Add Facebook Login Product**:
   - If not already added: **Add Product** → **Facebook Login** → **Set Up**
4. **Configure OAuth Settings**:
   - Go to **Facebook Login** → **Settings** (in left sidebar)
   - Find **Valid OAuth Redirect URIs**
   - Add these URIs (one per line):
     ```
     http://localhost:8000/api/social-studio/oauth/instagram_login/callback
     http://localhost:8000/api/social-studio/oauth/instagram/callback
     http://localhost:8000/api/social-studio/oauth/facebook/callback
     http://localhost:8000/api/social-studio/oauth/threads/callback
     ```
5. **Save Changes**
6. **Scroll down** and also check:
   - **Client OAuth Login**: YES (enabled)
   - **Web OAuth Login**: YES (enabled)
   - **Enforce HTTPS**: NO (for localhost development)

### Solution 2: Use ngrok for Public HTTPS URL

Meta prefers HTTPS URLs even for development. Use ngrok to create a public tunnel:

1. **Install ngrok**: Download from https://ngrok.com/ (free)

2. **Start ngrok**:
   ```bash
   ngrok http 8000
   ```

3. **Copy the HTTPS URL** (e.g., `https://abc123.ngrok-free.app`)

4. **Add to Facebook Login Settings**:
   ```
   https://abc123.ngrok-free.app/api/social-studio/oauth/instagram_login/callback
   ```

5. **Keep ngrok running** while testing OAuth

### Solution 3: Use 127.0.0.1 Instead of localhost

Some OAuth providers differentiate between `localhost` and `127.0.0.1`:

**Try this redirect URI**:
```
http://127.0.0.1:8000/api/social-studio/oauth/instagram_login/callback
```

**Also update your backend** to listen on 127.0.0.1:
```bash
py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

### Solution 4: Check App Mode and Settings

1. **Verify App Mode**:
   - Go to **Settings** → **Basic**
   - Check **App Mode**: Should be "Development" for localhost
   - If "Live": Switch to Development mode

2. **Verify App Domains**:
   - Go to **Settings** → **Basic**
   - Find **App Domains**
   - Add: `localhost` (for development)

3. **Check Site URL**:
   - Still in **Settings** → **Basic**
   - Find **Website** → **Site URL**
   - Set to: `http://localhost:8000`

### Solution 5: Use Separate Instagram Basic Display API

If Instagram Login continues to be problematic, you could use Instagram Basic Display API instead:

1. Add **Instagram Basic Display** product (not Instagram API)
2. Configure redirect URIs there
3. However, this is LIMITED - no publishing, only viewing posts

**Note**: This is NOT recommended as Basic Display API was deprecated Dec 2024.

## Recommended Approach for Development

**Use Facebook Login Settings** (Solution 1) because:
- ✅ More permissive with localhost
- ✅ Allows HTTP for development
- ✅ Works for Instagram Login OAuth
- ✅ Same credentials work for Facebook, Instagram, Threads

## After Configuring Facebook Login Settings

1. **Verify settings saved**:
   - Go back to **Facebook Login** → **Settings**
   - Check **Valid OAuth Redirect URIs** shows your URLs

2. **Try connecting Instagram**:
   - Start backend: `py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000`
   - Open Social Studio: http://localhost:5173
   - Go to **Connections**
   - Click **Connect Instagram (Direct)**

3. **Check for errors**:
   - If still `PLATFORM__INVALID_APP_ID`: Verify App ID in `.env` matches Meta App
   - If `redirect_uri_mismatch`: Double-check the URI matches exactly
   - If `access_denied`: Make sure Instagram account is Professional

## For Production Deployment

When deploying to production:

1. **Get your production domain** (e.g., `https://yourdomain.com`)

2. **Add production redirect URIs** to Facebook Login Settings:
   ```
   https://yourdomain.com/api/social-studio/oauth/instagram_login/callback
   https://yourdomain.com/api/social-studio/oauth/facebook/callback
   https://yourdomain.com/api/social-studio/oauth/threads/callback
   ```

3. **Keep localhost URIs** for development (you can have both)

4. **Submit for App Review** if you need production access:
   - Go to **App Review** → **Permissions and Features**
   - Request each Instagram permission
   - Provide use case and demo video

## Verification Checklist

Before trying OAuth again:

### Meta App Configuration
- [ ] Facebook Login product is added
- [ ] Redirect URI is in **Facebook Login** → **Settings** → **Valid OAuth Redirect URIs**
- [ ] Client OAuth Login is enabled
- [ ] Web OAuth Login is enabled
- [ ] App is in Development mode (for localhost testing)

### Backend Configuration
- [ ] `.env` has correct `INSTAGRAM_LOGIN_APP_ID` and `INSTAGRAM_LOGIN_APP_SECRET`
- [ ] Backend is running on port 8000
- [ ] Can access: http://localhost:8000/api/social-studio/oauth/instagram_login/login

### Instagram Account
- [ ] Account is Professional (Business or Creator)
- [ ] You're logged into Instagram in your browser
- [ ] You're an admin/developer of the Meta app (for Development mode)

## Still Getting Errors?

If you're still seeing "Error saving redirect URIs":

1. **Try exact URLs** from BrightBean's working config:
   ```
   http://127.0.0.1:8000/api/social-studio/oauth/instagram_login/callback
   ```

2. **Check for typos**:
   - No extra spaces
   - Correct spelling of `oauth` and `callback`
   - Proper slashes `/`

3. **Clear browser cache** and try again

4. **Use a different browser** (sometimes helps with Meta's UI bugs)

5. **Wait 5 minutes** and try again (Meta's settings can be slow to sync)

## Alternative: Skip Instagram Login, Use Regular Instagram

If all else fails, use the regular Instagram provider (via Facebook Login) instead:

1. **Connect Facebook Page first**
2. **Link Instagram Business account** to that Facebook Page (in Instagram app)
3. **Use regular "Instagram"** option (not "Instagram Direct")

This works because Facebook OAuth is more permissive and your Facebook App ID already works for it.

## Next Steps

1. ✅ Try Solution 1 (Facebook Login Settings) first
2. ✅ If that fails, try Solution 2 (ngrok)
3. ✅ Verify all checklist items
4. ✅ Test OAuth connection from Social Studio
