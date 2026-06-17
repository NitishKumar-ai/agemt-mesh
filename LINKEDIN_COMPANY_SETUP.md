# LinkedIn Company Page Setup Guide

## Overview
To connect LinkedIn Company Pages in Social Studio, you need proper OAuth scopes and LinkedIn app permissions.

## Requirements

### 1. LinkedIn Personal Account Connection
- Your personal LinkedIn account MUST be connected first
- This account will be used to query company pages you administer

### 2. Required OAuth Scopes
The following scopes must be granted during OAuth flow:
- `w_member_social` - Post on behalf of member
- `profile` - Read basic profile info
- `openid` - OpenID Connect
- `w_organization_social` - Post on behalf of organization **[REQUIRED FOR COMPANY PAGES]**
- `r_organization_social` - Read organization social content **[REQUIRED FOR COMPANY PAGES]**
- `rw_organization_admin` - Manage organization pages **[REQUIRED FOR COMPANY PAGES]**

### 3. LinkedIn App Configuration
In your LinkedIn Developer Portal (https://www.linkedin.com/developers/):

1. Go to your app settings
2. Navigate to the "Products" tab
3. **Request access to these products:**
   - Marketing Developer Platform
   - Share on LinkedIn
   - Sign In with LinkedIn using OpenID Connect
   
4. In the "Auth" tab, verify your OAuth 2.0 scopes include organization permissions

### 4. Admin Access
- You must be an administrator of at least one LinkedIn company page
- To check: Visit linkedin.com → Work → Company Pages and verify you have admin access

## Common Issues

### "403 Forbidden" Error
**Cause:** Missing organization scopes or LinkedIn app not approved for company page access

**Solutions:**
1. Disconnect and reconnect your LinkedIn personal account
2. During OAuth, ensure all permissions are granted (don't skip any)
3. Verify your LinkedIn app has "Marketing Developer Platform" product enabled
4. Check if your app is still in development mode (may have limitations)

### "No company pages found"
**Cause:** User is not an administrator of any company pages

**Solutions:**
1. Verify you're an admin on linkedin.com
2. Ask the company page owner to grant you admin access
3. Ensure the LinkedIn account you connected has admin rights

### "No LinkedIn personal account found"
**Cause:** Only a company page is connected, not a personal account

**Solution:** Connect your personal LinkedIn account first before trying to access company pages

## Testing the Setup

1. Connect your LinkedIn personal account via OAuth
2. Click "Browse My Company Pages"
3. If successful, you'll see a list of company pages you administer
4. Click "Connect" on the desired page

## API Details

### Endpoint for Fetching Company Pages
```
GET /api/social-studio/oauth/linkedin_company/pages
```

This endpoint:
- Uses the personal account's access token
- Calls LinkedIn's `/v2/organizationalEntityAcls` API
- Filters for organizations where you have ADMINISTRATOR role
- Returns list of company pages with id, name, handle, and logo

### LinkedIn API Reference
- [Organization Access Control](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/organizations/organization-access-control)
- [OAuth 2.0 Scopes](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication)
