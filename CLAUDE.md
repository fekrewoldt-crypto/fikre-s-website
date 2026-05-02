# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MediScan** - A medical diagnostic assistant web application with AI-powered symptom analysis and interactive body heatmap visualization.

## Quick Start

```bash
npm start              # Start server on http://localhost:3000
open http://localhost:3000   # Open main app
```

## Architecture

### Frontend (Vanilla JS + Glassmorphism UI)
- **IIndex.html** - Main application UI (dark mode, animations, voice input, 2D body heatmap)
- **prototype-body-heatmap.html** - 2D SVG body pain selector standalone demo

### Backend (Express + Multi-Model AI Fallback Chain)
- **Server-v2.js** - Stable production backend with fallback: Gemini → Groq → Ollama → Demo
- **Server.js** - Legacy backend with Claude/OpenAI in fallback chain (deprecated)
- **Server-free.js** - Free-tier only implementation (legacy)

### Modules
- **modules/body-heatmap.js** - 2D SVG body heatmap: gender toggle (M/F), front/back view, 0-10 intensity, hold-to-increase
- **modules/body-heatmap-muscles.js** - Enhanced 2D heatmap with 70+ anatomically accurate muscle regions from body-muscles library
- **modules/heatmap-switcher.js** - Orchestrator for 2D heatmap with state management
- **modules/heatmap-state.js** - Shared state management for heatmap selections
- **modules/hospital-map.js** - Leaflet.js map for Gondar hospital locations

### Data
- **hospitals-gondar.json** - 30 hospital locations in Gondar, Ethiopia (used by hospital-map.js)
- **.env** - API keys (GEMINI_API_KEY, GROQ_API_KEY, DEMO_MODE)
- **.archive/3d-heatmap/** - Archived 3D heatmap files (body-heatmap-3d.js, body-heatmap-3d-new.js)

## Key Features

### Body Heatmap System

#### 2D Heatmap Features

| Feature | Description |
|---------|-------------|
| File | modules/body-heatmap.js (basic) / modules/body-heatmap-muscles.js (enhanced) |
| Model | SVG-based body silhouettes |
| Regions | ~10 basic regions / 70+ muscle regions (enhanced) |
| Interaction | Click, hold (200ms), Shift+click to decrease |
| Intensity | 0-10, +1/150ms during hold |
| Visualization | HSL gradient (yellow → orange → red → purple) |
| Views | Front/Back toggle |
| Gender | Male/Female toggle |

#### Medical Gradient
```
Yellow (0-3) → Orange (3-7) → Red (7-10) → Deep Purple (10)
```

#### HeatmapSwitcher API
```javascript
import { HeatmapSwitcher } from './modules/heatmap-switcher.js';

const heatmap = new HeatmapSwitcher('container-id', {
  onSelectionChange: (data, mode) => { /* handle */ },
  state: optionalSharedState
});

await heatmap.init();
const data = heatmap.getEnhancedFormat();
```

Exports via `getEnhancedFormat()` returning:
```javascript
{
  regions: [{ area, name, intensity, points }],
  maxIntensity: number,
  legacy: { selectedBody, painLevel } // backward compatible
}
```

### AI Analysis Pipeline
```
POST /api/analyze → { symptoms, bodySelections, imageBase64 } → diagnosis JSON
POST /api/chat    → { prompt, chatHistory } → conversational response
GET  /api/health  → { status, models: {...}, uptime }
GET  /api/status  → { available: { gemini, groq, ollama, claude, openai } }
```

Response format (all endpoints):
```javascript
{
  primaryCondition: string,
  confidence: number (55-92),
  severity: "low" | "medium" | "high",
  subtitle: string,
  description: string,
  symptoms: string[],
  nextSteps: string[],
  urgentSigns: string,
  alternatives: [{ name, confidence }],
  disclaimer: string,
  modelUsed: string,
  responseTimeMs: number
}
```

### Demo Mode
Set `DEMO_MODE=true` in `.env` to return mock diagnoses without API calls. Auto-fallback when API quota exceeded.

### API Error Handling
The server includes enhanced error handling and debugging:
- **extractJSON function**: Handles malformed JSON responses, removes markdown code blocks, fixes trailing commas
- **Debug logging**: Gemini and Groq functions log request details and response previews
- **Fallback chain**: Gemini → Groq → Ollama → Demo mode with automatic fallback on errors
- **Response validation**: Ensures API responses match expected JSON structure

## Development Patterns

### Cache-Busting for Testing
Browser caching is aggressive. Always use query strings when testing:
```html
<script src="./modules/heatmap-switcher.js?v=20260430" type="module"></script>
```
Or hard refresh: Cmd+Shift+R (Mac) / Ctrl+Shift+F5 (Windows)

### Prototyping Strategy
1. Never edit stable files (`IIndex.html`, `Server-v2.js`) directly for experiments
2. Create `prototype-*.html` for new UI features
3. Create `modules/*.js` for reusable components
4. Features default behind feature flags until validated

### Module Pattern
```javascript
// 2D BodyHeatmap - auto-init via data attribute or constructor
new BodyHeatmap('container-id', {
  onSelectionChange: (data) => { /* handle */ },
  initialSelection: []
});

// HeatmapSwitcher - unified 2D orchestration (preferred)
import { HeatmapSwitcher } from './modules/heatmap-switcher.js';
```

### Heatmap Integration
- **HeatmapSwitcher** provides unified API for 2D heatmap implementations
- State sync via `HeatmapState` class - selections persist across sessions
- Supports both basic body-heatmap.js and enhanced body-heatmap-muscles.js
- Auto-initialization via data attribute in HTML

### State Management
- Form state auto-saves to `localStorage.mediscan_form` (24hr TTL)
- Chat history bounded to 20 messages max
- History bounded to 30 entries max

## Common Commands

```bash
npm start                              # Run server (port 3000)
open http://localhost:3000             # Main app
open http://localhost:3000/prototype-body-heatmap.html  # 2D standalone demo
```

## Technical Stack

- **Runtime**: Node.js 18+ (Express)
- **Frontend**: Vanilla JS (no framework), CSS glassmorphism
- **AI**: Gemini 2.0 Flash (primary), Groq (secondary), Ollama local (tertiary)
- **Maps**: Leaflet.js
- **Fonts**: DM Serif Display, DM Sans, Noto Sans Ethiopic
- **Charts**: Chart.js 4.4.1

## File Conventions

- `Server*.js` - Backend implementations (v2 = current stable)
- `IIndex.html` - Main frontend (capital "I" is intentional, legacy naming)
- `prototype-*.html` - Standalone demo/prototype pages
- `modules/*.js` - Reusable ES6 modules with classes
- `hospital-map.*` - Hospital location feature for Gondar

## Environment Variables

```
GEMINI_API_KEY=         # Primary AI model (required for production)
GROQ_API_KEY=           # Secondary AI provider (recommended)
DEMO_MODE=true|false    # Return mock data, skip API calls (default: false)
```

## Recent Fixes Applied (2026-04-25)

### Critical (Phase 1)
- package.json main → Server-v2.js
- .env added to .gitignore (security)
- Voice input language codes: `am-ET` → `am`
- Module paths standardized to `./modules/`

### High Priority (Phase 2)
- Hospital modal loads from `hospitals-gondar.json` (30 facilities)
- Body heatmap state sync fixed (deep clone)
- Chat history bounded to 20 messages
- Heatmap init error handling with toast notifications
- Form restore shows user notifications

### Medium Priority (Phase 3)
- Image compression: 800px max, 0.75 quality (reduced from 1200px/0.85)
- Loading steps: 1500ms per step (reduced from 3800ms)
- Confidence bar animation instant (removed 200ms delay)

## Recent Changes (2026-05-01)

### 3D to 2D Migration Complete
- **Archived 3D files**: Moved to `.archive/3d-heatmap/` (body-heatmap-3d.js, body-heatmap-3d-new.js)
- **Removed 3D CSS**: Cleaned up IIndex.html (removed lines 788-862)
- **Fixed static file serving**: Added `app.use(express.static('.'))` to Server-v2.js
- **Enhanced API error handling**: Improved extractJSON function with better debugging
- **Added debug logging**: Enhanced analyzeWithGemini and analyzeWithGroq with detailed logging
- **Muscles mode integration**: HeatmapSwitcher now supports both '2d' and 'muscles' modes

### Documentation Updates
- Removed all 3D heatmap references from documentation
- Updated architecture to reflect 2D-only implementation
- Documented musclelibrary integration (70+ anatomically accurate muscle regions)
- Simplified HeatmapSwitcher to 2D-only implementation with muscles mode support
- Updated technical stack to remove Three.js dependency

## Known Limitations

- No unit tests (test coverage gap)
- No API documentation (Swagger/OpenAPI)
- Particle animation not GPU-accelerated
- No keyboard navigation for body heatmaps (accessibility gap)
- 2D heatmap only (3D visualization removed for simplicity)
