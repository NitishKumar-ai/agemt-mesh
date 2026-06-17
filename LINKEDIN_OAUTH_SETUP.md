# LinkedIn OAuth Setup Guide

This guide walks you through setting up LinkedIn OAuth for the Social Studio feature.

## Prerequisites

- A LinkedIn account
- Access to [LinkedIn Developers Portal](https://www.linkedin.com/developers/apps)

## Step 1: Create a LinkedIn App

1. Go to [LinkedIn Developers Portal](https://www.linkedin.com/developers/apps)
2. Click **"Create app"**
3. Fill in the app details:
   - **App name**: `AgentMesh` (or your preferred name)
   - **LinkedIn Page**: Select your LinkedIn page or create one
   - **Privacy policy URL**: Your privacy policy URL
   - **App logo**: Upload a logo (optional)
4. Click **"Create app"**

## Step 2: Configure OAuth Settings

1. Go to the **"Auth"** tab of your LinkedIn app
2. Under **"OAuth 2.0 settings"**, add the following redirect URLs:
   ```
   http://localhost:8000/api/social-studio/oauth/linkedin/callback
   http://127.0.0.1:8000/api/social-studio/oauth/linkedin/callback
   ```
3. Copy your **Client ID** and **Client Secret** (you'll need these for the `.env` file)

## Step 3: Add Required Products

1. Go to the **"Products"** tab
2. Click **"Request access"** or **"Select"** for these products:
   - ✅ **"Sign In with LinkedIn using OpenID Connect"** (Required for profile access)
   - ✅ **"Share on LinkedIn"** (Required for posting - may require Marketing Developer Platform access)

### Note on Products

- **"Sign In with LinkedIn using OpenID Connect"** provides:
  - `openid` - Basic OpenID Connect
  - `profile` - User profile information
  - `email` - User email (optional)

- **"Share on LinkedIn"** provides:
  - `w_member_social` - Post on behalf of the user
  - Additional scopes for organization posting (requires approval)

## Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env` if you haven't already:
   ```bash
   cp .env.example .env
   ```

2. Add your LinkedIn credentials to `.env`:
   ```env
   LINKEDIN_CLIENT_ID=your_client_id_here
   LINKEDIN_CLIENT_SECRET=your_client_secret_here
   ```

## Step 5: Test the Integration

1. Start your backend server:
   ```bash
   python api.py
   ```

2. Start your frontend:
   ```bash
   cd frontend
   npm run dev
   ```

3. Navigate to the Social Studio page in your app
4. Click "Connect LinkedIn Account"
5. You should be redirected to LinkedIn to authorize
6. After authorization, you'll be redirected back to your app

## OAuth Flow Endpoints

The following endpoints are configured in `api.py`:

- **Login**: `GET /api/social-studio/oauth/linkedin/login`
  - Initiates OAuth flow
  - Redirects to LinkedIn authorization page

- **Callback**: `GET /api/social-studio/oauth/linkedin/callback`
  - Handles OAuth callback from LinkedIn
  - Exchanges authorization code for access token
  - Saves account to database
  - Redirects back to frontend

## Scopes Required

The LinkedIn provider requests these scopes (defined in `agents/social_studio/providers/linkedin.py`):

```python
required_scopes = [
    "w_member_social",  # Post on behalf of the user
    "profile",          # Read profile information
    "openid",          # OpenID Connect
]
```

## Troubleshooting

### Error: "LINKEDIN_CLIENT_ID not set"
- Make sure you've added `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` to your `.env` file
- Restart your backend server after updating `.env`

### Error: "redirect_uri_mismatch"
- Verify the callback URL in your LinkedIn app matches exactly:
  - `http://localhost:8000/api/social-studio/oauth/linkedin/callback`
- Check for trailing slashes or http vs https mismatches

### Error: "access_denied"
- User cancelled the authorization
- Or required products aren't enabled in your LinkedIn app

### Error: "invalid_scope"
- One or more requested scopes aren't available
- Make sure "Sign In with LinkedIn using OpenID Connect" product is enabled
- If posting fails, you may need "Share on LinkedIn" product access

### "Share on LinkedIn" Product Not Available
- Some LinkedIn API products require Marketing Developer Platform access
- Personal accounts can use `w_member_social` for personal posts
- Organization posting requires company page admin access and product approval

## Security Considerations

- Never commit `.env` file to version control
- Rotate secrets regularly
- Use environment variables in production
- Consider using a secrets manager for production deployments

## Production Deployment

When deploying to production:

1. Update the redirect URI in both:
   - Your LinkedIn app settings
   - The `api.py` callback URL (line 1441 and 1465)

2. Set environment variables in your hosting platform:
   ```env
   LINKEDIN_CLIENT_ID=your_production_client_id
   LINKEDIN_CLIENT_SECRET=your_production_client_secret
   ```

3. Update frontend URL in `api.py` (line 1448):
   ```python
   frontend_url = "https://your-production-domain.com/"
   ```

## Resources

- [LinkedIn OAuth Documentation](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication)
- [LinkedIn Marketing API](https://learn.microsoft.com/en-us/linkedin/marketing/)
- [LinkedIn Developer Portal](https://www.linkedin.com/developers/)
