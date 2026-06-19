# ngrok Setup for Threads HTTPS OAuth

Threads requires HTTPS redirect URIs. Use ngrok to create a secure tunnel for local development.

## Step 1: Install ngrok

**Windows:**
1. Download ngrok from https://ngrok.com/download
2. Extract `ngrok.exe` to a folder (e.g., `C:\ngrok\`)
3. Add to PATH or run from that folder

**Or install via package manager:**
```powershell
# Using Chocolatey
choco install ngrok

# Using Scoop
scoop install ngrok
```

## Step 2: Sign up for ngrok (Optional but Recommended)

1. Go to https://dashboard.ngrok.com/signup
2. Sign up for a free account
3. Get your auth token from https://dashboard.ngrok.com/get-started/your-authtoken
4. Run: `ngrok authtoken YOUR_AUTH_TOKEN`

Free account benefits:
- Persistent subdomain
- More concurrent tunnels
- Better reliability

## Step 3: Start ngrok Tunnel

Open a **new terminal** and run:

```bash
ngrok http 8000
```

You'll see output like:
```
ngrok                                                                    

Session Status                online
Account                       your_email@example.com
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123def456.ngrok-free.app -> http://localhost:8000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Copy the HTTPS URL** (e.g., `https://abc123def456.ngrok-free.app`)

## Step 4: Update Meta Threads Settings

1. Go to https://developers.facebook.com/apps/1328794975343818
2. Navigate to **Threads** → **Settings**
3. In **Redirect Callback URLs**, add:
   ```
   https://YOUR_NGROK_URL.ngrok-free.app/api/social-studio/oauth/threads/callback
   ```
   Example: `https://abc123def456.ngrok-free.app/api/social-studio/oauth/threads/callback`
4. Click **Save Changes**

## Step 5: Access Your App via ngrok URL

Instead of `http://localhost:5173`, use:
```
https://YOUR_NGROK_URL.ngrok-free.app
```

**Important:** You need to access BOTH frontend and backend through the ngrok URL.

For frontend, you may need a separate ngrok tunnel:
```bash
# In another terminal
ngrok http 5173
```

Then access the frontend via its ngrok HTTPS URL.

## Step 6: Test Threads OAuth

1. Open your app at the ngrok HTTPS URL
2. Go to Social Studio → Connections
3. Click Connect → Threads
4. OAuth should now work with HTTPS!

## Tips

### Keep ngrok Running
Keep the ngrok terminal open while testing. If it closes, the tunnel stops.

### Free Tier Limitations
- URL changes each time you restart ngrok
- You'll need to update the redirect URI in Meta Portal each time
- Consider paying for a persistent subdomain ($8/month)

### Alternative: Use Static Domain (Paid)
With ngrok paid plan:
```bash
ngrok http 8000 --domain=myapp.ngrok.io
```

This gives you a permanent URL that doesn't change.

### Debug with ngrok Web Interface
Open http://127.0.0.1:4040 to see all HTTP requests going through ngrok.
Useful for debugging OAuth flows.

## Troubleshooting

### "ERR_NGROK_6024: Tunnel not found"
- Your free ngrok session expired
- Restart ngrok to get a new URL

### "Invalid redirect URI"
- Make sure you're accessing the app via the ngrok HTTPS URL
- Verify the redirect URI in Meta Portal matches exactly
- Include `/api/social-studio/oauth/threads/callback` at the end

### CORS errors
- Some CORS issues may occur with ngrok
- Usually resolved by accessing everything through the ngrok URL

## Production Deployment

For production, use a real HTTPS domain instead of ngrok:
- Deploy to Vercel, Netlify, Railway, Render, etc.
- All provide free HTTPS certificates
- Update Meta Portal with production URL
- No ngrok needed in production!

## Quick Reference

```bash
# Start ngrok tunnel
ngrok http 8000

# With custom subdomain (paid plan)
ngrok http 8000 --domain=myapp.ngrok.io

# Set auth token (one-time)
ngrok authtoken YOUR_TOKEN

# Check ngrok status
# Open http://127.0.0.1:4040 in browser
```

## Next Steps

Once ngrok is running:
1. ✅ Copy the HTTPS URL
2. ✅ Update Meta Threads redirect URI
3. ✅ Access app via ngrok URL
4. ✅ Test Threads OAuth connection
5. ✅ Threads should now work!
