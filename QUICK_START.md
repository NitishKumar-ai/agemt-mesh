# Quick Start: YouTube & Image Generation

## What You Can Do Now

### 1. ✅ See YouTube in Social Studio

**YouTube is now visible** in the Social Studio UI!

1. Start the server:
   ```bash
   py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
   ```

2. Open browser: `http://127.0.0.1:8000`

3. Navigate to **Social Studio** → **Connections**

4. Click **"+ Connect Account"**

5. **You will see YouTube** in the grid:
   - Red background color (#ffe5e5)
   - ▶ play icon
   - Label: "YouTube"
   - Description: "Videos & Shorts"

6. Click on YouTube → OAuth flow will start

### 2. ✅ Generate Images with AI

**Image generation is ready to use!**

#### Setup (One Time)

```bash
# 1. Add to .env file
GOOGLE_GENAI_API_KEY=your_api_key_here

# 2. Install dependencies
pip install google-genai pillow

# 3. Restart server
py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

#### Generate an Image (API)

```bash
curl -X POST http://127.0.0.1:8000/api/social-studio/imagen/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene mountain landscape at sunset with vibrant orange and purple sky"
  }'
```

**Response:**
```json
{
  "status": "complete",
  "file_id": "abc-123-def-456",
  "file_path": "/tmp/social-studio-uploads/abc-123-def-456_imagen.png",
  "width": 1024,
  "height": 1024,
  "message": "Image generated successfully!"
}
```

#### Generate an Image (Python)

```python
from google import genai

client = genai.Client(api_key="your_api_key")

response = client.models.generate_content(
    model="gemini-3.1-flash-image",
    contents=["A cute robot artist painting on a canvas"],
)

for part in response.parts:
    if part.inline_data is not None:
        image = part.as_image()
        image.save("my_image.png")
        print(f"Saved! Size: {image.width}x{image.height}")
```

### 3. ✅ Generate Videos with AI

**Video generation is also ready!**

```bash
curl -X POST http://127.0.0.1:8000/api/social-studio/veo3/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A close up of two people staring at a cryptic drawing on a wall"
  }'
```

This returns a **Server-Sent Events (SSE) stream** with progress updates:

```json
{"status": "queued", "message": "Starting generation..."}
{"status": "progress", "percent": 25, "message": "Generating..."}
{"status": "complete", "file_id": "xyz", "file_path": "/tmp/...mp4"}
```

## Verification Checklist

| Feature | Status | How to Verify |
|---------|--------|---------------|
| Bug fix applied | ✅ | Server starts without `NameError: name 'File' is not defined` |
| YouTube visible | ✅ | See YouTube card in Connections → Connect Account |
| YouTube OAuth | ✅ | Click YouTube → redirects to Google OAuth |
| Image API ready | ✅ | curl endpoint returns generated image |
| Video API ready | ✅ | curl endpoint returns SSE stream |
| Database ready | ✅ | Images/videos stored in `ss_video_uploads` table |
| Cleanup ready | ✅ | Files auto-deleted after 7 days |

## What's Working

### Backend (100% Complete)
- ✅ Image generation API
- ✅ Video generation API
- ✅ YouTube OAuth integration
- ✅ Database storage
- ✅ File management
- ✅ Error handling
- ✅ All diagnostics pass

### Frontend (Partially Complete)
- ✅ YouTube visible in connections
- ✅ YouTube OAuth flow
- ✅ Account connection UI
- 🔄 Image generation UI (next step)
- 🔄 Video generation UI (next step)
- 🔄 Post composer integration (next step)

## Example Prompts

### For Images (Imagen 3)
```
"A professional business team collaborating in a modern office"
"An abstract geometric pattern with teal and orange colors"
"A minimalist product photo of a smartphone on a white surface"
"A futuristic city skyline at night with neon lights"
"A cozy coffee shop interior with warm lighting"
```

### For Videos (Veo 3)
```
"A person walking through a misty forest at dawn"
"A chef preparing a gourmet dish in slow motion"
"A drone flying over a mountain valley with clouds"
"A time-lapse of a flower blooming"
"A person giving a presentation in a conference room"
```

## Troubleshooting

### YouTube Not Visible?

1. **Check browser cache**: Hard refresh (Ctrl+Shift+R)
2. **Check frontend build**: `cd frontend && npm run build`
3. **Verify server restart**: Stop and start `uvicorn` again

### Image Generation Fails?

```bash
# Check API key
echo $GOOGLE_GENAI_API_KEY

# Test manually
python -c "from google import genai; print(genai.Client(api_key='your-key'))"

# Check logs
# Look for errors in server console output
```

### Import Errors?

```bash
# Reinstall dependencies
pip install -r requirements.txt

# Or install individually
pip install google-genai pillow fastapi
```

## Files You Can View

All generated files are saved here:
```
/tmp/social-studio-uploads/
├── abc123_imagen.png    (images)
├── def456_veo3.mp4      (videos)
└── ...
```

Check database:
```bash
sqlite3 agent_mesh.sqlite "SELECT * FROM ss_video_uploads LIMIT 5"
```

## Cost & Limits

**Free Tier** (Google AI):
- Limited daily generations
- Rate limits apply
- May require payment method

**Check Usage**:
- [Google AI Studio](https://aistudio.google.com)
- View quota and usage

## Next Steps for Full UI

1. Add Image Generator component to Generate tab
2. Add Video Generator component to Generate tab  
3. Add media preview in post composer
4. Add "Upload vs Generate" toggle
5. Add progress indicators
6. Add error notifications

## Documentation

- `IMAGEN_SETUP.md` - Full image generation setup
- `YOUTUBE_OAUTH_SETUP.md` - YouTube OAuth setup
- `BUG_FIXES.md` - Bug fix details
- `FEATURE_SUMMARY.md` - Complete feature list

---

**You're Ready to Go!** 🚀

YouTube is visible and image generation is working. Start generating!
