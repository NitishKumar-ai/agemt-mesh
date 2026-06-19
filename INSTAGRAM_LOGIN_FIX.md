# Instagram Login OAuth Fix

## Problem
Instagram Login OAuth was failing with `PLATFORM__INVALID_APP_ID` error when trying to connect Instagram accounts.

## Root Cause
The `InstagramLoginProvider` was using incorrect OAuth URLs:
- ❌ **Wrong**: Used `https://www.facebook.com/oauth` (Facebook OAuth)
- ✅ **Correct**: Should use `https://www.instagram.com/oauth/authorize` (Instagram native OAuth)

## Solution
Replaced the provider with the correct BrightBean Studio implementation that uses Instagram's native OAuth flow.

### Key Changes

**1. OAuth URLs Fixed**
```python
# OLD (incorrect)
OAUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth"
TOKEN_URL = "https://graph.facebook.com/v21.0/oauth/access_token"

# NEW (correct)
AUTH_URL = "https://www.instagram.com/oauth/authorize"
TOKEN_URL = "https://api.instagram.com/oauth/access_token"
GRAPH_HOST = "https://graph.instagram.com"
API_BASE = f"{GRAPH_HOST}/v21.0"
```

**2. Token Exchange Method**
```python
# NEW: Uses multipart/form-data, not URL-encoded form
def exchange_code(self, code: str, redirect_uri: str) -> OAuthTokens:
    fields = {
        "client_id": self.credentials["client_id"],
        "client_secret": self.credentials["client_secret"],
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    resp = self._request(
        "POST",
        TOKEN_URL,
        files={k: (None, v) for k, v in fields.items()},  # multipart/form-data
    )
```

**3. Long-Lived Token Exchange**
```python
# NEW: Automatically exchanges short-lived token (~1 hour) for long-lived (~60 days)
def _exchange_for_long_lived_token(self, short_lived_token: str) -> OAuthTokens:
    resp = self._request(
        "GET",
        f"{GRAPH_HOST}/access_token",
        params={
            "grant_type": "ig_exchange_token",
            "client_id": self.credentials["client_id"],
            "client_secret": self.credentials["client_secret"],
            "access_token": short_lived_token,
        },
    )
```

**4. OAuth Parameters**
```python
# NEW: Includes Instagram-specific parameters
def get_auth_url(self, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": self.credentials["client_id"],
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": ",".join(self.required_scopes),
        "response_type": "code",
        "enable_fb_login": "0",      # NEW: Disable Facebook fallback
        "force_authentication": "1",  # NEW: Force re-auth
    }
```

## Instagram App Credentials

According to BrightBean Studio documentation, Instagram Login uses **separate credentials** from Facebook:

1. Go to Meta App Dashboard → **Use cases** → **Instagram API**
2. Under **"API setup with Instagram Login"**, note your:
   - **Instagram App ID** (different from Facebook App ID)
   - **Instagram App Secret** (different from Facebook App Secret)

However, some users report the "Instagram App ID" is just UI labeling. Try both approaches:

**Option A: Use separate Instagram credentials (per BrightBean docs)**
```env
INSTAGRAM_LOGIN_APP_ID=846552378187092
INSTAGRAM_LOGIN_APP_SECRET=8de26c148103c1314bfd177734938512
```

**Option B: Use Facebook App credentials (if Option A fails)**
```env
INSTAGRAM_LOGIN_APP_ID=1407597041207580
INSTAGRAM_LOGIN_APP_SECRET=5275597a38b1c960780e5bd9d8c86b10
```

## Required Meta App Configuration

### 1. Add Instagram API Use Case
- Go to **Use cases** → Add **"Instagram API"**

### 2. Request Permissions
Go to **Permissions and features** and add:
- ✅ `instagram_business_basic`
- ✅ `instagram_business_content_publish`
- ✅ `instagram_business_manage_comments`
- ✅ `instagram_business_manage_messages`
- ✅ `instagram_business_manage_insights`

### 3. Configure Redirect URI
Under **API setup with Instagram Login → Step 4: Set up Instagram business login**:
```
http://localhost:8000/api/social-studio/oauth/instagram_login/callback
```

For production:
```
https://yourdomain.com/api/social-studio/oauth/instagram_login/callback
```

### 4. Account Requirements
- Instagram account must be **Professional** (Business or Creator)
- Personal accounts have NO API access (Instagram Basic Display API retired Dec 2024)
- Convert at: Instagram Settings → Account type and tools → Switch to professional account

## Testing the Integration

1. **Start backend**:
   ```bash
   py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
   ```

2. **Open Social Studio** → **Connections**

3. **Connect Instagram (Direct)** (NOT regular Instagram)

4. **Authorize** with your Professional Instagram account

5. **Test**: Generate and publish a post

## OAuth Flow

```
User clicks "Connect Instagram (Direct)"
  ↓
GET /api/social-studio/oauth/instagram_login/login
  ↓
Redirect to https://www.instagram.com/oauth/authorize
  ↓
User authorizes on Instagram
  ↓
Instagram redirects to /api/social-studio/oauth/instagram_login/callback?code=...
  ↓
POST https://api.instagram.com/oauth/access_token (exchange code for short-lived token)
  ↓
GET https://graph.instagram.com/access_token (exchange for long-lived token ~60 days)
  ↓
GET https://graph.instagram.com/v21.0/me (get profile)
  ↓
Save to database
  ↓
Redirect user to frontend with success message
```

## Key Differences: Instagram vs Instagram (Direct)

| Feature | Instagram (Facebook Login) | Instagram (Direct) |
|---------|---------------------------|-------------------|
| **OAuth URL** | facebook.com/oauth | instagram.com/oauth |
| **Requires Facebook Page** | Yes | No |
| **Account Type** | Business linked to Page | Professional (Business/Creator) |
| **Publishing** | Deprecated ❌ | Fully supported ✅ |
| **Token Lifetime** | Short-lived | 60 days |

## Files Modified

1. **agents/social_studio/providers/instagram_login.py** - Complete rewrite with correct OAuth
2. **.env** - Updated INSTAGRAM_LOGIN_APP_ID/SECRET with correct values
3. **INSTAGRAM_LOGIN_SETUP.md** - Updated documentation

## API Integration Status

The `api.py` file already has full support for `instagram_login`:
- ✅ OAuth login endpoint (`/api/social-studio/oauth/instagram_login/login`)
- ✅ OAuth callback handler (`/api/social-studio/oauth/instagram_login/callback`)
- ✅ Provider registration in `PROVIDERS` dict
- ✅ Content generation rules in `PLATFORM_RULES`
- ✅ Publisher credentials handling

## Next Steps

1. Try connecting with the Instagram App ID from Meta dashboard (`846552378187092`)
2. If that fails with `PLATFORM__INVALID_APP_ID`, try using Facebook App ID (`1407597041207580`)
3. Verify redirect URI is configured exactly in Meta app settings
4. Ensure Instagram account is Professional (not Personal)
5. Check Meta App is in Development Mode for testing (or has App Review approval for production)

## References

- [BrightBean Studio - Instagram (Direct) Setup](https://github.com/brightbeanxyz/brightbean-studio#instagram-direct-via-instagram-login)
- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)
- [Instagram Business Login Documentation](https://developers.facebook.com/docs/instagram-api/overview#authentication)
