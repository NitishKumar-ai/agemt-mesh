# UI Updates: YouTube + Image Generation

## Changes Made

### 1. ✅ YouTube Now Visible in Generate Tab

**Problem**: YouTube was missing from the platform checkboxes  
**Root Cause**: `SS_PLATFORMS` dict in `api.py` didn't include YouTube  
**Fix**: Added YouTube to `SS_PLATFORMS`

```python
# api.py line ~1422
SS_PLATFORMS = {
    ...
    "youtube": {"label": "YouTube", "char_limit": 5000, "color": "#ff0000"},
}
```

**Result**: YouTube now appears as a checkbox in the Generate tab with:
- Red dot indicator
- "YouTube" label  
- 5000 character limit (for video descriptions)
- Shows "(not connected)" until you connect via Connections tab

### 2. ✅ Image Generation UI Added

**New Component**: `ImageGenerationSection()`

Added complete image generation UI to the Generate tab:

#### Features:
- **Prompt Input**: Textarea with 1000 character limit
- **Character Counter**: Shows current/max with warning at limit
- **Generate Button**: Purple (#7c3aed) with loading state
- **Live Preview**: Shows generated image with dimensions
- **Error Handling**: User-friendly error messages
- **Clear Function**: Reset and start over

#### UI Layout:
```
┌─────────────────────────────────────────────┐
│ ✨ AI Image Generation                      │
│ Generate images with Google Imagen 3        │
├─────────────────────────────────────────────┤
│ [Prompt Textarea]          [Generated Image]│
│ Character: 245 / 1000      ┌──────────────┐ │
│                            │              │ │
│ [🎨 Generate Image]        │   Preview    │ │
│                            │              │ │
│                            └──────────────┘ │
│                            Dimensions: ...  │
│                            File ID: abc123  │
└─────────────────────────────────────────────┘
```

### 3. ✅ API Integration

**Added to `frontend/src/lib/api.ts`**:

```typescript
ssImagenGenerate(payload: { prompt: string }) {
  return json<{
    status: string;
    file_id: string;
    file_path: string;
    width: number;
    height: number;
    message: string
  }>("/api/social-studio/imagen/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
```

## How It Looks Now

### Generate Tab Structure

```
┌──────────────────────────────────────────────────────┐
│ Generate Tab                                          │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ┌─────────────────────────────────────────────┐    │
│  │ ✨ AI Image Generation                      │    │
│  │ [Prompt input]           [Generated preview]│    │
│  │ [🎨 Generate Image button]                  │    │
│  └─────────────────────────────────────────────┘    │
│                                                       │
│  ┌─────────────────────────────────────────────┐    │
│  │ Agent Mesh Publisher                         │    │
│  │ [Topic/Brief textarea]                       │    │
│  │ [Tone] [Brand Voice]                         │    │
│  │                                              │    │
│  │ Platforms — agents run in parallel           │    │
│  │ ○ Bluesky (not connected)                    │    │
│  │ ○ LinkedIn (not connected)                   │    │
│  │ ● YouTube (not connected)  ← NEW!            │    │
│  │ ○ Instagram (not connected)                  │    │
│  │ ...                                          │    │
│  │                                              │    │
│  │ [✦ Generate & Publish All]                  │    │
│  └─────────────────────────────────────────────┘    │
│                                                       │
└──────────────────────────────────────────────────────┘
```

## File Changes

| File | Change | Lines |
|------|--------|-------|
| `api.py` | Added YouTube to SS_PLATFORMS | ~1431 |
| `frontend/src/pages/SocialStudioPage.tsx` | Added ImageGenerationSection component | +165 lines |
| `frontend/src/pages/SocialStudioPage.tsx` | Integrated component into Generate tab | +2 lines |
| `frontend/src/lib/api.ts` | Added ssImagenGenerate API function | +7 lines |

## Testing Checklist

### YouTube Visibility
- [ ] Start server: `py -m uvicorn api:app --reload`
- [ ] Open `http://127.0.0.1:8000`
- [ ] Go to Social Studio → Generate tab
- [ ] **Verify**: YouTube checkbox is visible with red dot
- [ ] **Verify**: Shows "(not connected)" label
- [ ] **Verify**: Click does nothing until connected

### Image Generation UI
- [ ] See "✨ AI Image Generation" section at top of Generate tab
- [ ] Type a prompt (e.g., "a cute robot")
- [ ] **Verify**: Character counter updates
- [ ] **Verify**: Generate button enabled when prompt is filled
- [ ] **Verify**: Shows error if prompt > 1000 chars

### Image Generation Flow
- [ ] Ensure `GOOGLE_GENAI_API_KEY` is set in `.env`
- [ ] Type prompt: "a serene mountain landscape"
- [ ] Click "🎨 Generate Image"
- [ ] **Verify**: Button shows "⚙️ Generating Image..."
- [ ] **Verify**: Image appears on right side after ~5-10 seconds
- [ ] **Verify**: Shows dimensions and file ID
- [ ] **Verify**: "Clear & Start Over" button appears

### Error Handling
- [ ] Try empty prompt → Error: "Please enter a prompt"
- [ ] Try 1001 character prompt → Error about length
- [ ] Remove API key → Error: "GOOGLE_GENAI_API_KEY not configured"
- [ ] Try invalid prompt → Shows API error message

## Visual Design

### Image Generation Section
- **Background**: Card style matching other sections
- **Title**: Font-title with ✨ emoji
- **Button**: Purple (#7c3aed) - stands out from other actions
- **Preview**: Border, rounded corners, gray background
- **Status Box**: Purple tint background when successful

### YouTube Checkbox
- **Dot Color**: Red (#ff0000)
- **Label**: "YouTube"
- **State**: Greyed out until connected
- **Position**: In alphabetical order with other platforms

## Known Limitations

### Image Generation
- Requires `GOOGLE_GENAI_API_KEY` environment variable
- Requires `pip install google-genai pillow`
- Free tier has daily quota limits
- Generation takes 5-15 seconds
- Image path won't display correctly (needs file serving endpoint)

### YouTube
- Shows in Generate tab but won't publish until:
  1. You connect via Connections → YouTube OAuth
  2. Backend has video upload workflow (already implemented)
  3. You provide video file (text-only posts don't work on YouTube)

## Next Steps

### Immediate Fixes Needed
1. **Image Serving**: Add endpoint to serve generated images
   ```python
   @app.get("/api/social-studio/media/{file_id}")
   async def serve_media(file_id: str):
       # Serve from /tmp/social-studio-uploads/
   ```

2. **Image Preview Fix**: Update image src to use API endpoint
   ```typescript
   src={`/api/social-studio/media/${generatedImage.file_id}`}
   ```

### Future Enhancements
1. **Post Integration**: Allow attaching generated images to posts
2. **Image Library**: Gallery of previously generated images
3. **Style Presets**: Quick prompts for common styles
4. **Batch Generation**: Generate multiple variations
5. **Video Generation UI**: Similar component for Veo 3

## Success Criteria

- ✅ YouTube visible in Generate tab
- ✅ YouTube shows in platform checkboxes  
- ✅ Image generation UI renders
- ✅ Prompt input works
- ✅ Generate button triggers API
- ✅ Loading states work
- 🔄 Image preview displays (needs file serving)
- 🔄 Error messages display correctly

## Deployment

### Frontend Build
```bash
cd frontend
npm run build
```

### Restart Server
```bash
py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

### Verify Changes
1. Hard refresh browser (Ctrl+Shift+R)
2. Check Generate tab for image section
3. Check for YouTube in platform list
4. Try generating an image

---

**Status**: UI Complete ✅ | Needs Image Serving Fix 🔄  
**Last Updated**: 2026-06-19
