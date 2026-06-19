"""Test Instagram Login OAuth URL generation."""
import os
from dotenv import load_dotenv
from agents.social_studio.providers.instagram_login import InstagramLoginProvider

load_dotenv()

# Get credentials from env
app_id = os.getenv("INSTAGRAM_LOGIN_APP_ID")
app_secret = os.getenv("INSTAGRAM_LOGIN_APP_SECRET")

print("=" * 70)
print("INSTAGRAM LOGIN OAUTH DIAGNOSTICS")
print("=" * 70)
print()

print(f"App ID: {app_id}")
print(f"App Secret: {app_secret[:10]}..." if app_secret else "App Secret: None")
print()

# Create provider
provider = InstagramLoginProvider(credentials={
    "client_id": app_id,
    "client_secret": app_secret
})

# Generate OAuth URL
redirect_uri = "http://localhost:8000/api/social-studio/oauth/instagram_login/callback"
state = "test_state_12345"

auth_url = provider.get_auth_url(redirect_uri=redirect_uri, state=state)

print("Generated OAuth URL:")
print(auth_url)
print()

# Parse and show parameters
from urllib.parse import urlparse, parse_qs
parsed = urlparse(auth_url)
params = parse_qs(parsed.query)

print("OAuth Parameters:")
for key, value in params.items():
    if key == "client_id":
        print(f"  {key}: {value[0]} {'✓ MATCHES' if value[0] == app_id else '✗ MISMATCH'}")
    else:
        print(f"  {key}: {value[0]}")

print()
print("=" * 70)
print("WHAT TO CHECK:")
print("=" * 70)
print()
print("1. OAuth URL starts with: https://www.instagram.com/oauth/authorize")
print("2. client_id matches your Facebook App ID")
print("3. redirect_uri matches Meta App configuration exactly")
print("4. scope includes: instagram_business_basic,instagram_business_content_publish...")
print()
print("=" * 70)
print("NEXT STEPS:")
print("=" * 70)
print()
print("1. Open the OAuth URL above in your browser")
print("2. If it redirects to facebook.com/oauth/error:")
print("   - App ID is invalid OR")
print("   - Redirect URI not configured in Meta App OR")
print("   - 'Instagram API' use case not added")
print()
print("3. If it shows Instagram login page: ✓ OAuth URL is correct!")
print("   - Log in with your Professional Instagram account")
print("   - Click 'Allow'")
print("   - Should redirect back to your callback URL")
print()
print("=" * 70)
print("META APP CONFIGURATION:")
print("=" * 70)
print()
print("Go to: https://developers.facebook.com/apps/")
print(f"Open App ID: {app_id}")
print()
print("Required Configuration:")
print("  1. Use cases → Add 'Instagram API'")
print("  2. Instagram API → Permissions → Add:")
print("     - instagram_business_basic")
print("     - instagram_business_content_publish")
print("     - instagram_business_manage_comments")
print("     - instagram_business_manage_insights")
print("  3. Instagram API → API setup → Step 4 → Add redirect URI:")
print(f"     {redirect_uri}")
print()
print("=" * 70)
