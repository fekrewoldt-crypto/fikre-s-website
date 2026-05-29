# MediScan — AI-Powered Medical Diagnostic Assistant
## Science Fair Project Documentation

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [What is MediScan?](#what-is-mediscan)
3. [How Was It Built?](#how-was-it-built)
4. [Technologies Used](#technologies-used)
5. [Key Features](#key-features)
6. [How It Works](#how-it-works)
7. [Technical Architecture](#technical-architecture)
8. [Development Journey](#development-journey)
9. [Challenges Overcome](#challenges-overcome)
10. [What Makes It Unique?](#what-makes-it-unique)
11. [Future Improvements](#future-improvements)
12. [Live Demo Information](#live-demo-information)

---

## Project Overview

**MediScan** is an AI-powered medical diagnostic assistant web application designed for educational purposes and science fair demonstrations. It helps users understand potential health conditions by analyzing symptoms, body areas, and uploaded images using multiple AI models.

### Quick Facts

| Aspect | Details |
|--------|---------|
| **Project Name** | MediScan |
| **Type** | Web Application / Science Fair Project |
| **Development Time** | ~2 weeks |
| **Lines of Code** | ~5,000+ |
| **Files** | ~30 files |
| **Deployment** | Vercel (Cloud) |
| **Live URL** | https://fikre-s-website.vercel.app |
| **GitHub** | https://github.com/fekrewoldt-crypto/Fikre-s-website |

---

## What is MediScan?

MediScan is a **comprehensive health analysis tool** that combines artificial intelligence with intuitive user interface design to help users understand their symptoms and potential health conditions. It serves as an educational demonstration of how AI can be applied to healthcare.

### Core Purpose

The primary goal of MediScan is to demonstrate how modern AI technologies can be used to:

1. **Analyze symptoms** described by users in natural language
2. **Visualize pain locations** on an interactive body heatmap
3. **Process medical images** (skin conditions, rashes, visible symptoms)
4. **Provide educational information** about potential conditions
5. **Suggest next steps** for users to consider

### Important Disclaimer

> **MediScan is for educational purposes only and does not constitute medical advice. Always consult a qualified health professional for actual medical diagnosis and treatment.**

---

## How Was It Built?

### Development Process

The project was built through a systematic development process:

#### Phase 1: Planning & Research (2 days)
- Researched available AI models and APIs
- Studied medical diagnostic applications
- Designed the user interface concept
- Planned the technical architecture

#### Phase 2: Backend Development (5 days)
- Set up Express.js server
- Integrated multiple AI APIs (Gemini, Groq, Ollama)
- Implemented fallback chain for reliability
- Created API endpoints for analysis and chat
- Added rate limiting and caching

#### Phase 3: Frontend Development (5 days)
- Built glassmorphism UI with CSS
- Implemented interactive body heatmap
- Added image upload and camera capture
- Integrated voice input (speech-to-text)
- Created responsive design for mobile/desktop

#### Phase 4: Testing & Deployment (2 days)
- Tested all features locally
- Fixed bugs and optimized performance
- Deployed to Vercel cloud platform
- Verified production functionality

### Development Tools Used

- **Code Editor**: VS Code
- **Version Control**: Git & GitHub
- **API Testing**: Browser DevTools, curl
- **Documentation**: Obsidian (for notes)
- **Deployment**: Vercel CLI

---

## Technologies Used

### Frontend Technologies

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **HTML5** | Structure | Semantic markup, accessibility |
| **CSS3** | Styling | Custom glassmorphism design |
| **Vanilla JavaScript** | Interactivity | No framework overhead, faster development |
| **Chart.js 4.4.1** | Data visualization | Beautiful charts for health data |
| **Leaflet.js** | Maps | Hospital location mapping |
| **Web Speech API** | Voice input | Browser-native speech recognition |
| **Canvas API** | Image processing | Image compression and manipulation |

### Backend Technologies

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Node.js 18+** | Runtime | JavaScript everywhere, async I/O |
| **Express 4.19.2** | Web framework | Simple, lightweight, well-documented |
| **CORS** | Cross-origin requests | Enable API calls from browser |
| **dotenv** | Environment variables | Secure API key management |

### AI Models & APIs

| Model | Provider | Capabilities | Daily Limit |
|-------|----------|-------------|-------------|
| **Gemini 2.0 Flash** | Google | Text + Images | 1,500 requests |
| **Llama 3.3 70B** | Groq | Text only | 14,400 requests |
| **Llama 3.2** | Ollama | Text only (local) | Unlimited |
| **Demo Mode** | Built-in | Keyword matching | Unlimited |

### Deployment & Infrastructure

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Vercel** | Cloud hosting | Free tier, automatic HTTPS, GitHub integration |
| **GitHub** | Version control | Free hosting, collaboration |
| **Git** | Version control | Industry standard, branching |

### Design & Fonts

| Resource | Purpose |
|----------|---------|
| **DM Serif Display** | Headings and logo |
| **DM Sans** | Body text |
| **Noto Sans Ethiopic** | Ethiopian language support |

---

## Key Features

### 1. Symptom Analysis

Users can describe their symptoms in natural language, and the AI analyzes them to provide:

- **Primary condition** with confidence score
- **Severity assessment** (low, medium, high)
- **Detailed description** of the condition
- **Common symptoms** associated with the condition
- **Recommended next steps** for self-care
- **Urgent signs** that require immediate medical attention
- **Alternative conditions** with confidence scores

### 2. Interactive Body Heatmap

A 2D SVG-based body selector that allows users to:

- **Select body regions** where they feel pain or discomfort
- **Adjust pain intensity** on a scale of 0-10
- **Toggle between front and back views**
- **Switch between male and female body silhouettes**
- **Use enhanced muscles mode** with 70+ anatomically accurate regions

**Interaction Methods:**
- Click to select/deselect regions
- Hold (200ms) to increase intensity
- Shift+click to decrease intensity
- Visual feedback with color gradient (yellow → orange → red → purple)

### 3. Image Upload & Analysis

Users can upload images of:

- Skin conditions
- Rashes
- Visible symptoms
- Medical concerns

**Features:**
- Drag-and-drop upload zone
- Camera capture directly from browser
- Image compression (800px max, 75% quality)
- Preview before submission
- AI analysis of visual symptoms

### 4. Voice Input

Hands-free symptom description using:

- **Web Speech API** for speech-to-text
- **Multi-language support** (English, Amharic, Afaan Oromo, Tigrinya)
- **Real-time transcription** as user speaks
- **One-tap activation** with microphone button

### 5. AI Chat Assistant

Conversational AI for follow-up questions:

- **Context-aware responses** from AI models
- **Educational information** about health topics
- **Friendly, encouraging tone**
- **Fallback to demo mode** when APIs unavailable

### 6. Hospital Locator

Interactive map showing hospitals in Gondar, Ethiopia:

- **30+ hospital locations** with details
- **Leaflet.js map integration**
- **Click for more information**
- **Regional healthcare awareness**

### 7. Multi-Language Support

Localized interface for Ethiopian users:

- **English** (primary)
- **Amharic (አማርኛ)**
- **Afaan Oromo**
- **Tigrinya (ትግርኛ)**

### 8. Dark/Light Mode

Automatic theme switching:

- **System preference detection**
- **Manual toggle option**
- **Smooth transitions** between themes
- **Persistent user preference**

### 9. Responsive Design

Works seamlessly on:

- **Desktop browsers** (Chrome, Edge, Safari, Firefox)
- **Tablet devices**
- **Mobile phones**
- **Touch-optimized interactions**

### 10. History & Dashboard

Track past analyses:

- **Analysis history** with timestamps
- **Visual dashboard** with charts
- **Quick access** to previous results
- **Local storage** for privacy

---

## How It Works

### User Flow

```
1. User opens MediScan
   ↓
2. Describes symptoms (text or voice)
   ↓
3. Selects body regions on heatmap
   ↓
4. Optionally uploads image
   ↓
5. Clicks "Analyze Symptoms"
   ↓
6. Server processes request
   ↓
7. AI models analyze input
   ↓
8. Results displayed to user
   ↓
9. User can ask follow-up questions
```

### Technical Flow

```
Frontend (Browser)
   ↓
HTTP POST /api/analyze
   ↓
Express Server (Node.js)
   ↓
Check Cache → Hit? Return cached result
   ↓
Try AI Models in Priority Order:
   1. Gemini (supports images)
   2. Groq (text-only, fast)
   3. Ollama (local, unlimited)
   4. Demo mode (keyword matching)
   ↓
Parse JSON Response
   ↓
Cache Result
   ↓
Return to Frontend
   ↓
Display Results to User
```

### AI Model Selection Logic

The server uses a **smart fallback chain**:

1. **Gemini** (if API key available and not rate-limited)
   - Supports both text and images
   - High-quality responses
   - 1,500 requests/day limit

2. **Groq** (if Gemini fails or rate-limited)
   - Text-only but very fast
   - 14,400 requests/day limit
   - Uses Llama 3.3 70B model

3. **Ollama** (if Groq fails)
   - Local model, unlimited requests
   - Text-only
   - Requires local installation

4. **Demo Mode** (final fallback)
   - Keyword matching
   - Pre-defined conditions
   - Always available

### Response Caching

To improve performance and reduce API costs:

- **Cache key**: MD5 hash of symptoms + body area
- **Cache duration**: 1 hour
- **Cache storage**: In-memory Map
- **Cache hit**: Returns cached result instantly
- **Cache miss**: Calls AI, stores result

---

## Technical Architecture

### File Structure

```
Science Project/
├── IIndex.html                    # Main application UI
├── Server-v2.js                   # Express backend server
├── package.json                   # Dependencies and scripts
├── vercel.json                    # Vercel deployment config
├── .env                           # API keys (local, not committed)
├── .gitignore                     # Files to exclude from Git
├── CLAUDE.md                      # Project documentation
├── IMPROVEMENTS-BRAINSTORM.md     # Future improvement ideas
├── SECURITY-NOTE.md              # Security considerations
│
├── modules/                       # Reusable components
│   ├── body-heatmap.js           # Basic 2D body heatmap
│   ├── body-heatmap-muscles.js   # Enhanced muscles heatmap (70+ regions)
│   ├── demo-body-heatmap-simple.js  # Simple demo heatmap
│   ├── heatmap-state.js          # State management
│   └── heatmap-switcher.js       # Heatmap orchestrator
│
├── assets/                        # Static assets
│
├── hospitals-gondar.json         # Hospital location data
├── hospital-map.js               # Hospital map module
├── hospital-map.css              # Hospital map styles
│
├── male-front.png                # Reference images
├── male-back.png
├── female-front.png
├── female-back.png
├── reference-male.png
├── reference-female.png
│
├── prototype-body-heatmap.html   # Standalone demo
├── demo-body-heatmap-simple.html # Simple demo
│
└── .archive/                      # Archived files
    └── 3d-heatmap/               # Archived 3D heatmap files
```

### API Endpoints

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|---------------|----------|
| `/api/analyze` | POST | Analyze symptoms | `{ prompt, symptoms, bodyArea, imageBase64, imageMimeType }` | Diagnosis JSON |
| `/api/chat` | POST | Chat with AI | `{ prompt }` | `{ reply, modelUsed }` |
| `/api/health` | GET | Health check | None | `{ status, timestamp, uptime, version }` |
| `/api/status` | GET | Model availability | None | `{ models: {...}, rateLimitResetsAt, demoMode }` |

### Response Format

All API responses follow this structure:

```json
{
  "primaryCondition": "Condition Name",
  "confidence": 78,
  "severity": "low|medium|high",
  "subtitle": "Brief medical category",
  "description": "2-3 sentence explanation",
  "symptoms": ["symptom1", "symptom2", ...],
  "nextSteps": ["step1", "step2", ...],
  "urgentSigns": "When to seek emergency care",
  "alternatives": [
    { "name": "Alternative 1", "confidence": 45 },
    { "name": "Alternative 2", "confidence": 28 }
  ],
  "disclaimer": "Medical disclaimer text",
  "modelUsed": "gemini|groq|ollama|demo",
  "modelsAttempted": [...],
  "responseTimeMs": 1234,
  "demoMode": false,
  "cached": false
}
```

### State Management

The application uses several state management strategies:

1. **Form State**: Auto-saved to `localStorage.mediscan_form` (24hr TTL)
2. **Heatmap State**: Managed by `HeatmapState` class
3. **Chat History**: Bounded to 20 messages max
4. **Analysis History**: Bounded to 30 entries max
5. **Rate Limits**: In-memory Map (resets on deployment)

---

## Development Journey

### Initial Concept

The project started with a simple idea: **Can AI help people understand their symptoms?**

I wanted to create something that:
- Demonstrates the power of AI in healthcare
- Is accessible to people in Ethiopia
- Provides educational value
- Looks professional and modern

### First Steps

1. **Research**: Studied existing medical AI applications
2. **API Selection**: Chose Gemini for its image capabilities
3. **UI Design**: Decided on glassmorphism for modern look
4. **Architecture**: Planned frontend/backend separation

### Iterative Development

The project evolved through multiple iterations:

#### Iteration 1: Basic Symptom Analysis
- Simple text input
- Single AI model (Gemini)
- Basic results display

#### Iteration 2: Body Heatmap
- Added 2D SVG body selector
- Click-to-select functionality
- Pain intensity levels

#### Iteration 3: Image Support
- Image upload capability
- Camera capture
- AI image analysis

#### Iteration 4: Enhanced Features
- Voice input
- Multi-language support
- Hospital locator
- Dark/light mode

#### Iteration 5: Robustness
- Multiple AI models with fallback
- Rate limiting
- Response caching
- Error handling

#### Iteration 6: Deployment
- Vercel deployment
- Environment variable configuration
- Production testing

### Lessons Learned

1. **API Rate Limits**: Always have a fallback plan
2. **Error Handling**: Users will encounter errors, handle them gracefully
3. **Caching**: Improves performance and reduces costs
4. **Testing**: Test on multiple browsers and devices
5. **Documentation**: Good documentation saves time later

---

## Challenges Overcome

### Challenge 1: API Rate Limits

**Problem**: Free API tiers have daily limits that can be exhausted quickly.

**Solution**: Implemented a multi-model fallback chain:
- Try Gemini first (best quality)
- Fall back to Groq (higher limit)
- Fall back to Ollama (local, unlimited)
- Final fallback to demo mode (keyword matching)

**Result**: The application always works, even when APIs are unavailable.

### Challenge 2: Vercel Deployment

**Problem**: Vercel's serverless environment has limitations:
- File system is read-only
- Rate limits reset on each deployment
- Local services (Ollama) don't work

**Solution**:
- Used in-memory rate limiting
- Disabled Ollama on Vercel
- Added environment variable configuration
- Created proper root route handler

**Result**: Successful deployment to Vercel with all features working.

### Challenge 3: Module Loading

**Problem**: ES modules have separate scope and don't export globally.

**Solution**:
- Used regular scripts instead of ES modules
- Exported classes to `window` object
- Added polling to wait for module loading
- Implemented proper loading order

**Result**: All modules load correctly and are accessible globally.

### Challenge 4: Image Compression

**Problem**: Large images slow down uploads and hit API limits.

**Solution**:
- Compress images before upload (800px max, 75% quality)
- Use Canvas API for client-side compression
- Show preview before submission

**Result**: Faster uploads and reduced API costs.

### Challenge 5: JSON Parsing

**Problem**: AI models sometimes return malformed JSON with markdown formatting.

**Solution**:
- Created `extractJSON()` function
- Removes markdown code blocks
- Fixes trailing commas
- Handles control characters
- Provides helpful error messages

**Result**: Robust JSON parsing that handles various AI response formats.

### Challenge 6: Browser Compatibility

**Problem**: Different browsers have varying feature support.

**Solution**:
- Used feature detection
- Provided graceful degradation
- Tested on Chrome, Edge, Safari, Firefox
- Added fallbacks for unsupported features

**Result**: Application works on all major browsers.

---

## What Makes It Unique?

### 1. Multi-Model AI Fallback Chain

Unlike most applications that rely on a single AI model, MediScan uses a **smart fallback chain** that ensures the application always works, even when APIs are unavailable or rate-limited.

### 2. Interactive Body Heatmap

The 2D SVG body heatmap with:
- **70+ anatomically accurate muscle regions** (enhanced mode)
- **Hold-to-increase intensity** interaction
- **Front/back view toggle**
- **Male/female body options**
- **Visual pain gradient** (yellow → orange → red → purple)

### 3. Ethiopian Localization

Designed specifically for Ethiopian users:
- **Multi-language support** (English, Amharic, Afaan Oromo, Tigrinya)
- **Hospital locator for Gondar, Ethiopia**
- **Ethiopic font support** (Noto Sans Ethiopic)
- **Cultural awareness** in design

### 4. Glassmorphism Design

Modern, professional UI with:
- **Frosted glass effects**
- **Smooth animations**
- **Gradient backgrounds**
- **Floating particles**
- **Responsive layout**

### 5. Comprehensive Feature Set

All-in-one health analysis tool:
- Symptom analysis
- Body heatmap
- Image upload
- Voice input
- Camera capture
- AI chat
- Hospital locator
- History tracking
- Dashboard visualization

### 6. Educational Focus

Designed for science fair and educational purposes:
- **Clear explanations** of how it works
- **Medical disclaimers** prominently displayed
- **Confidence scores** to show AI uncertainty
- **Alternative conditions** to show possibilities

### 7. Privacy-First Design

- **No user accounts required**
- **Local storage only** (no database)
- **No personal data collection**
- **Session-based analysis**

### 8. Production-Ready

Not just a prototype:
- **Deployed to cloud** (Vercel)
- **Error handling** throughout
- **Rate limiting** implemented
- **Response caching** for performance
- **Responsive design** for all devices

---

## Future Improvements

### Short Term (Next 1-2 months)

1. **Enhanced AI Models**
   - Add more specialized medical AI models
   - Fine-tune models on Ethiopian medical data
   - Improve confidence scoring

2. **Database Integration**
   - Store user history securely
   - Enable account creation
   - Add data export functionality

3. **Mobile App**
   - React Native or Flutter application
   - Push notifications
   - Offline mode

4. **Real-time Chat**
   - WebSocket-based chat
   - Conversation memory
   - Follow-up question suggestions

### Medium Term (3-6 months)

1. **PWA Capabilities**
   - Service worker for offline mode
   - Install as app
   - Background sync

2. **Advanced Features**
   - Symptom trend analysis
   - Health insights dashboard
   - Risk factor calculator

3. **Multi-language Expansion**
   - More Ethiopian languages
   - Better translation
   - RTL layout support

### Long Term (6+ months)

1. **Professional Medical Integration**
   - Partner with healthcare providers
   - Telemedicine integration
   - Prescription management

2. **Epidemic Tracking**
   - Real-time disease outbreak data
   - Regional health alerts
   - Public health integration

3. **AI Research**
   - Custom model training
   - Medical image recognition
   - Predictive analytics

---

## Live Demo Information

### Accessing the Live Demo

**URL**: https://fikre-s-website.vercel.app

### Demo Mode

For science fair demonstrations, the application can run in **demo mode**:

- **No API keys required**
- **Keyword-based diagnosis**
- **Always available**
- **Pre-defined conditions**

To enable demo mode, set `DEMO_MODE=true` in environment variables.

### Testing Checklist

For judges to test:

- [ ] Page loads correctly
- [ ] Body heatmap displays and responds to clicks
- [ ] Symptom analysis works
- [ ] Voice input functions (if supported browser)
- [ ] Camera capture works (if HTTPS)
- [ ] Dark/light mode toggle works
- [ ] Hospital map displays
- [ ] Chat assistant responds
- [ ] History tracking works
- [ ] Responsive on mobile

### Known Limitations

- **Voice input**: Limited browser support (Chrome/Edge best)
- **Camera**: Requires HTTPS (works on Vercel)
- **Ollama**: Disabled on Vercel (serverless environment)
- **Rate limits**: Reset on each Vercel deployment
- **Medical accuracy**: For educational purposes only

---

## Technical Statistics

### Code Metrics

| Metric | Value |
|--------|-------|
| **Total Files** | ~30 files |
| **Lines of Code** | ~5,000+ lines |
| **Dependencies** | 7 production packages |
| **API Endpoints** | 4 endpoints |
| **Body Regions** | 30+ (basic), 70+ (muscles) |
| **Mock Conditions** | 7 pre-defined conditions |

### Performance Metrics

| Metric | Value |
|--------|-------|
| **Average Response Time** | 1-3 seconds (AI), <100ms (cached) |
| **Image Compression** | 800px max, 75% quality |
| **Cache Duration** | 1 hour |
| **Rate Limit Reset** | Daily (midnight) |
| **History Limit** | 30 entries |

### API Usage

| Model | Daily Limit | Cost |
|-------|-------------|------|
| Gemini | 1,500 requests | Free tier |
| Groq | 14,400 requests | Free tier |
| Ollama | Unlimited | Free (local) |
| Demo | Unlimited | Free (built-in) |

---

## Acknowledgments

### Technologies Used

- **Frontend**: HTML, CSS, JavaScript, Chart.js, Leaflet.js
- **Backend**: Node.js, Express
- **AI**: Google Gemini, Groq, Ollama
- **Deployment**: Vercel, GitHub
- **Design**: Glassmorphism, Responsive design

### Inspiration

- Medical AI assistants
- Science fair projects
- Educational technology
- Healthcare accessibility

### Special Thanks

- Google AI for Gemini API
- Groq for fast AI inference
- Vercel for free hosting
- Open source community

---

## Conclusion

MediScan demonstrates how modern AI technologies can be applied to healthcare in an accessible, educational way. By combining multiple AI models, intuitive user interface design, and thoughtful localization, it provides a comprehensive health analysis tool that works reliably even with limited resources.

The project showcases:
- **AI integration** with multiple models
- **Robust error handling** and fallback mechanisms
- **Modern UI design** with glassmorphism
- **Responsive development** for all devices
- **Cloud deployment** with Vercel
- **Educational focus** with clear disclaimers

This science fair project represents the intersection of artificial intelligence, web development, and healthcare accessibility—showing how technology can be used to improve health awareness and education.

---

*Last updated: May 4, 2026*
*Project by: Fikre Woldetadegegn*
