---
name: Multi-model fallback with image support
description: When an image is uploaded, skip text-only models (Groq, Ollama) in fallback chain - go straight to demo mode
type: feedback
---

**Rule:** When an image is uploaded (`imageBase64` present), the fallback chain must skip text-only models (Groq, Ollama) because they cannot process images. The fallback should go: Gemini → Demo (skip Groq/Ollama).

**Why:** Previously, when Gemini failed with an image upload, the fallback tried Groq and Ollama which don't accept image inputs. These models would fail, causing unnecessary delays and error logging before eventually reaching demo mode.

**How to apply:**
- Check `MODEL_CAPABILITIES[modelName]?.supportsImages` before attempting each model
- If `imageBase64` is present and model doesn't support images, skip with a log message
- Demo mode uses keyword matching on symptoms text, so it still works without images

The fix is in Server-v2.js:
```javascript
// Skip text-only models when an image is provided
if (imageBase64 && MODEL_CAPABILITIES[modelName]?.supportsImages === false) {
  console.log(`${modelName} does not support images, skipping...`);
  continue;
}
```
