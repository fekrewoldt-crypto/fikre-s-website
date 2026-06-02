/**
 * MediScan Interactive Body Heatmap Component
 * A gender-selectable, clickable body visualization with continuous intensity-based heatmap overlay
 *
 * Features:
 * - Male/Female body silhouette toggle
 * - Clickable anatomical regions with continuous 0-10 intensity scale
 * - Click-to-add, hold-to-increase (acceleration), Shift+click-to-decrease
 * - Smooth HSL color interpolation (yellow → orange → red → purple)
 * - Pulse animation for high-intensity regions (>7)
 * - Hover tooltip showing exact intensity value
 * - SVG-based with smooth CSS transitions
 * - Mobile-responsive and touch-friendly
 * - Glassmorphism design matching MediScan aesthetic
 * - Backward compatible with legacy form submission
 */

class BodyHeatmap {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      onSelectionChange: options.onSelectionChange || (() => {}),
      initialSelection: options.initialSelection || [],
      ...options
    };

    this.gender = 'male'; // 'male' or 'female'
    this.currentView = 'front';
    // regionId -> { intensity: 0-10 (float), points: [{x, y, intensity}] }
    this.selectedRegions = new Map();
    // Hold-to-increase timing
    this.holdTimer = null;
    this.holdInterval = null;
    this.holdTriggered = false;
    this.isHolding = false;
    this.holdThreshold = 200; // ms before acceleration starts
    this.holdAcceleration = 150; // ms between intensity increases during hold
    this.maxIntensity = 10;
    this.baseIntensityIncrement = 1;

    this.regions = this.defineRegions();
    this.init();
  }

  defineRegions() {
    return {
      // Front view regions
      'head-face': {
        id: 'head-face',
        name: 'Head / Face',
        path: 'head-path',
        category: 'front'
      },
      'eyes': {
        id: 'eyes',
        name: 'Eyes',
        path: 'eyes-path',
        category: 'front'
      },
      'throat-mouth': {
        id: 'throat-mouth',
        name: 'Throat / Mouth',
        path: 'throat-path',
        category: 'front'
      },
      'chest-lungs': {
        id: 'chest-lungs',
        name: 'Chest / Lungs',
        path: 'chest-path',
        category: 'front'
      },
      'stomach-gut': {
        id: 'stomach-gut',
        name: 'Stomach / Gut',
        path: 'stomach-path',
        category: 'front'
      },
      'arms-hands': {
        id: 'arms-hands',
        name: 'Arms / Hands',
        paths: ['arm-left-path', 'arm-right-path', 'hand-left-path', 'hand-right-path'],
        category: 'front'
      },
      'legs-feet': {
        id: 'legs-feet',
        name: 'Legs / Feet',
        paths: ['leg-left-path', 'leg-right-path', 'foot-left-path', 'foot-right-path'],
        category: 'front'
      },
      // Back view regions
      'back-upper': {
        id: 'back-upper',
        name: 'Upper Back',
        path: 'back-upper-path',
        category: 'back'
      },
      'back-lower': {
        id: 'back-lower',
        name: 'Lower Back',
        path: 'back-lower-path',
        category: 'back'
      },
      'back-neck': {
        id: 'back-neck',
        name: 'Neck / Shoulders',
        path: 'neck-back-path',
        category: 'back'
      }
    };
  }

  /**
   * Map intensity (0-10) to color using smooth HSL interpolation
   * 0-3: Yellow (#FFE135) → Orange (#FF9500)
   * 3-7: Orange (#FF9500) → Red (#DC143C)
   * 7-10: Red (#DC143C) → Deep Purple (#4A0E4E)
   * Opacity scales with intensity for subtle low values
   */
  intensityToColor(intensity, opacity = null) {
    if (intensity <= 0) return 'transparent';

    // Clamp intensity
    const clamped = Math.max(0, Math.min(10, intensity));

    // Calculate hue: 50 (yellow) → 30 (orange) → 0 (red) → 280 (purple)
    let hue;
    if (clamped <= 3) {
      // Yellow (50) to Orange (30)
      hue = 50 - (clamped / 3) * 20;
    } else if (clamped <= 7) {
      // Orange (30) to Red (0)
      hue = 30 - ((clamped - 3) / 4) * 30;
    } else {
      // Red (0) to Purple (280)
      hue = ((clamped - 7) / 3) * 280;
    }

    // Saturation: 85% → 95% (more intense at higher values)
    const saturation = 85 + (clamped / 10) * 10;

    // Lightness: 55% → 40% (darker at higher values)
    const lightness = 55 - (clamped / 10) * 15;

    // Opacity: scales with intensity, default range 0.3-0.95
    const effectiveOpacity = opacity !== null
      ? opacity
      : 0.3 + (clamped / 10) * 0.65;

    return `hsla(${hue.toFixed(1)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%, ${effectiveOpacity.toFixed(3)})`;
  }

  /**
   * Generate radial gradient for localized pain points within a region
   */
  generateRadialGradient(pointId, centerX, centerY, intensity) {
    const color = this.intensityToColor(intensity);
    const fadeColor = this.intensityToColor(0);

    return `
      <radialGradient id="grad-${pointId}" cx="${centerX}%" cy="${centerY}%" r="50%">
        <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${fadeColor};stop-opacity:0" />
      </radialGradient>
    `;
  }

  init() {
    this.render();
    this.attachEventListeners();
    this.loadInitialSelection();
  }

  render() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#e8f4ef' : '#1a1a18';
    const mutedColor = isDark ? '#a8b5a0' : '#6b6b60';
    const borderColor = isDark ? 'rgba(255,255,255,0.15)' : '#ddddd0';
    const glassBg = isDark ? 'rgba(15, 35, 25, 0.75)' : 'rgba(255, 255, 255, 0.75)';

    this.container.innerHTML = `
      <div class="body-heatmap-container">
        <!-- Gender Toggle -->
        <div class="gender-toggle">
          <button class="gender-btn ${this.gender === 'male' ? 'active' : ''}" data-gender="male">
            <span class="gender-icon">👨</span>
            <span>Male</span>
          </button>
          <button class="gender-btn ${this.gender === 'female' ? 'active' : ''}" data-gender="female">
            <span class="gender-icon">👩</span>
            <span>Female</span>
          </button>
        </div>

        <!-- View Toggle (Front/Back) -->
        <div class="view-toggle">
          <button class="view-btn active" data-view="front">Front View</button>
          <button class="view-btn" data-view="back">Back View</button>
        </div>

        <!-- Body SVG Container -->
        <div class="body-svg-wrapper">
          ${this.renderBodySVG(glassBg, borderColor)}
        </div>

        <!-- Legend -->
        <div class="heatmap-legend">
          <div class="legend-title">Pain Intensity (0-10)</div>
          <div class="legend-gradient-bar">
            <div class="legend-gradient-fill"></div>
          </div>
          <div class="legend-labels">
            <span>None</span>
            <span>Mild</span>
            <span>Moderate</span>
            <span>Severe</span>
            <span>Extreme</span>
          </div>
          <div class="legend-hint">Click to add pain · Hold to increase · Shift+click to reduce</div>
        </div>

        <!-- Selected Regions Summary -->
        <div class="selected-regions-summary" id="selected-regions-summary">
          <div class="summary-title">Selected Areas</div>
          <div class="summary-chips" id="summary-chips"></div>
        </div>
      </div>

      <style>
        .body-heatmap-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          padding: 1.5rem;
          animation: fadeIn 0.5s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Gender Toggle */
        .gender-toggle {
          display: flex;
          gap: 12px;
          background: ${glassBg};
          backdrop-filter: blur(20px);
          border: 1px solid ${borderColor};
          border-radius: 14px;
          padding: 6px;
        }

        .gender-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: ${mutedColor};
          font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .gender-btn:hover {
          background: rgba(26, 107, 74, 0.1);
          color: var(--green);
        }

        .gender-btn.active {
          background: linear-gradient(135deg, var(--green-light) 0%, rgba(212, 237, 218, 0.3) 100%);
          color: var(--green);
          box-shadow: 0 4px 12px rgba(26, 107, 74, 0.15);
        }

        .gender-icon {
          font-size: 1.2rem;
        }

        /* View Toggle */
        .view-toggle {
          display: flex;
          gap: 8px;
          background: ${glassBg};
          backdrop-filter: blur(20px);
          border: 1px solid ${borderColor};
          border-radius: 10px;
          padding: 4px;
        }

        .view-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: ${mutedColor};
          font-family: 'DM Sans', sans-serif;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .view-btn:hover {
          background: rgba(26, 107, 74, 0.1);
          color: var(--green);
        }

        .view-btn.active {
          background: var(--green);
          color: white;
          box-shadow: 0 2px 8px rgba(26, 107, 74, 0.3);
        }

        /* Body SVG Wrapper */
        .body-svg-wrapper {
          width: 100%;
          max-width: 340px;
          aspect-ratio: 1/2.2;
          position: relative;
        }

        .body-svg-wrapper svg {
          width: 100%;
          height: 100%;
        }

        /* SVG Region Styling */
        .body-region {
          fill: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(26, 107, 74, 0.08)'};
          stroke: ${borderColor};
          stroke-width: 1.5;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .body-region:hover {
          fill: rgba(26, 107, 74, 0.2);
          stroke: var(--green-mid);
          transform: translateY(-2px);
        }

        /* Silhouette outline */
        .body-silhouette {
          fill: none;
          stroke: ${borderColor};
          stroke-width: 1;
          pointer-events: none;
        }

        /* Legend */
        .heatmap-legend {
          background: ${glassBg};
          backdrop-filter: blur(20px);
          border: 1px solid ${borderColor};
          border-radius: 14px;
          padding: 1rem 1.25rem;
          width: 100%;
          max-width: 300px;
        }

        .legend-title {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: ${mutedColor};
          margin-bottom: 0.75rem;
        }

        .legend-gradient-bar {
          width: 100%;
          height: 20px;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 0.5rem;
          border: 1px solid ${borderColor};
        }

        .legend-gradient-fill {
          width: 100%;
          height: 100%;
          background: linear-gradient(to right,
            transparent 0%,
            rgba(255, 225, 53, 0.6) 10%,
            rgba(255, 149, 0, 0.75) 30%,
            rgba(220, 20, 60, 0.85) 70%,
            rgba(74, 14, 78, 0.95) 100%
          );
        }

        .legend-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.65rem;
          font-weight: 600;
          color: ${mutedColor};
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .legend-hint {
          font-size: 0.7rem;
          color: ${mutedColor};
          text-align: center;
          margin-top: 0.75rem;
          font-style: italic;
        }

        /* Pulse animation for high intensity */
        @keyframes painPulse {
          0%, 100% {
            filter: drop-shadow(0 0 2px currentColor);
            opacity: 0.85;
          }
          50% {
            filter: drop-shadow(0 0 8px currentColor);
            opacity: 1;
          }
        }

        .body-region.high-intensity {
          animation: painPulse 1.5s ease-in-out infinite;
        }

        /* Intensity tooltip */
        .intensity-tooltip {
          position: absolute;
          background: ${isDark ? 'rgba(10, 20, 15, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
          border: 1px solid ${borderColor};
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 0.75rem;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          color: ${textColor};
          pointer-events: none;
          z-index: 1000;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transition: opacity 0.2s ease;
        }

        /* Selected Regions Summary */
        .selected-regions-summary {
          background: ${glassBg};
          backdrop-filter: blur(20px);
          border: 1px solid ${borderColor};
          border-radius: 14px;
          padding: 1rem 1.25rem;
          width: 100%;
          max-width: 400px;
          min-height: 80px;
        }

        .summary-title {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: ${mutedColor};
          margin-bottom: 0.75rem;
        }

        .summary-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .summary-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          background: rgba(255,255,255,0.6);
          border: 1px solid ${borderColor};
          transition: all 0.2s ease;
        }

        [data-theme="dark"] .summary-chip {
          background: rgba(255,255,255,0.08);
        }

        .summary-chip:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .chip-intensity-bar {
          display: flex;
          gap: 1px;
          align-items: center;
        }

        .chip-intensity-segment {
          width: 4px;
          height: 12px;
          border-radius: 1px;
          background: rgba(100, 100, 100, 0.2);
          transition: all 0.2s ease;
        }

        .chip-intensity-segment.active {
          opacity: 1;
        }

        .chip-intensity-value {
          font-size: 0.7rem;
          font-weight: 700;
          min-width: 28px;
          text-align: right;
          color: ${mutedColor};
        }

        .chip-remove {
          background: none;
          border: none;
          cursor: pointer;
          color: ${mutedColor};
          font-size: 1rem;
          padding: 0 2px;
          transition: color 0.2s ease;
        }

        .chip-remove:hover {
          color: var(--red);
        }

        /* Mobile Responsive */
        @media (max-width: 640px) {
          .body-svg-wrapper {
            max-width: 280px;
          }

          .gender-btn, .view-btn {
            padding: 8px 12px;
            font-size: 0.8rem;
          }

          .heatmap-legend, .selected-regions-summary {
            max-width: 100%;
          }
        }
      </style>
    `;
  }

  renderBodySVG(glassBg, borderColor) {
    const isFemale = this.gender === 'female';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bodyGradientColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(26, 107, 74, 0.05)';

    return `
      <svg viewBox="0 0 400 700" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${glassBg};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${bodyGradientColor};stop-opacity:1" />
          </linearGradient>
        </defs>

        <!-- Silhouette Outline -->
        <path class="body-silhouette" d="${isFemale ? this.getFemaleSilhouette() : this.getMaleSilhouette()}" />

        <!-- Front View Regions -->
        <g class="front-view" style="display: ${this.currentView === 'front' ? 'block' : 'none'}">
          <!-- Head/Face - adjusted to align with silhouette neck curves -->
          <path id="head-path" class="body-region" data-region="head-face"
            d="M 168 58 Q 168 38 200 38 Q 232 38 232 58 L 232 86 Q 232 102 200 102 Q 168 102 168 86 Z" />

          <!-- Eyes - slightly larger for better visibility -->
          <ellipse id="eyes-path" class="body-region" data-region="eyes"
            cx="184" cy="71" rx="9" ry="5.5" />
          <ellipse id="eyes-path-right" class="body-region" data-region="eyes"
            cx="216" cy="71" rx="9" ry="5.5" />

          <!-- Throat/Mouth area - extended to connect chest and head -->
          <path id="throat-path" class="body-region" data-region="throat-mouth"
            d="M 183 86 L 217 86 L 213 103 L 187 103 Z" />

          <!-- Chest/Lungs - widened top to eliminate gap with throat -->
          <path id="chest-path" class="body-region" data-region="chest-lungs"
            d="M 158 108 Q 153 108 153 125 L 153 172 Q 153 187 168 187 L 232 187 Q 247 187 247 172 L 247 125 Q 247 108 242 108 Q 200 103 158 108 Z" />

          <!-- Stomach/Gut - adjusted to flow from chest -->
          <path id="stomach-path" class="body-region" data-region="stomach-gut"
            d="M 163 187 L 237 187 Q 247 187 247 202 L 247 232 Q 247 247 232 247 L 168 247 Q 153 247 153 232 L 153 202 Q 153 187 163 187 Z" />

          <!-- Left Arm - extended to cover shoulder area -->
          <path id="arm-left-path" class="body-region" data-region="arms-hands"
            d="M 153 113 Q 138 118 133 148 L 128 198 Q 126 218 123 233 L 120 248" />

          <!-- Right Arm - extended to cover shoulder area -->
          <path id="arm-right-path" class="body-region" data-region="arms-hands"
            d="M 247 113 Q 262 118 267 148 L 272 198 Q 274 218 277 233 L 280 248" />

          <!-- Left Hand -->
          <ellipse id="hand-left-path" class="body-region" data-region="arms-hands"
            cx="118" cy="256" rx="13" ry="16" />

          <!-- Right Hand -->
          <ellipse id="hand-right-path" class="body-region" data-region="arms-hands"
            cx="282" cy="256" rx="13" ry="16" />

          <!-- Left Leg - widened at top to connect with torso -->
          <path id="leg-left-path" class="body-region" data-region="legs-feet"
            d="M 173 245 L 173 348 Q 173 378 170 418 L 168 478 Q 166 508 163 528 L 160 558" />

          <!-- Right Leg - widened at top to connect with torso -->
          <path id="leg-right-path" class="body-region" data-region="legs-feet"
            d="M 227 245 L 227 348 Q 227 378 230 418 L 232 478 Q 234 508 237 528 L 240 558" />

          <!-- Left Foot -->
          <ellipse id="foot-left-path" class="body-region" data-region="legs-feet"
            cx="156" cy="573" rx="19" ry="13" />

          <!-- Right Foot -->
          <ellipse id="foot-right-path" class="body-region" data-region="legs-feet"
            cx="244" cy="573" rx="19" ry="13" />
        </g>

        <!-- Back View Regions -->
        <g class="back-view" style="display: ${this.currentView === 'back' ? 'block' : 'none'}">
          <!-- Back of Head - adjusted for better silhouette alignment -->
          <path id="head-back-path" class="body-region" data-region="head-face"
            d="M 168 58 Q 168 38 200 38 Q 232 38 232 58 L 232 92 Q 232 107 200 107 Q 168 107 168 92 Z" />

          <!-- Neck/Shoulders (Back) - widened to cover shoulder area -->
          <path id="neck-back-path" class="body-region" data-region="back-neck"
            d="M 150 92 L 250 92 Q 265 92 270 108 L 270 128 Q 270 138 252 138 L 148 138 Q 130 138 130 128 L 130 108 Q 135 92 150 92 Z" />

          <!-- Upper Back - adjusted to connect with neck/shoulders -->
          <path id="back-upper-path" class="body-region" data-region="back-upper"
            d="M 148 138 L 252 138 Q 262 138 262 153 L 262 203 Q 262 218 247 218 L 153 218 Q 138 218 138 203 L 138 153 Q 138 138 148 138 Z" />

          <!-- Lower Back - adjusted to flow from upper back -->
          <path id="back-lower-path" class="body-region" data-region="back-lower"
            d="M 153 218 L 247 218 Q 262 218 262 233 L 262 273 Q 262 288 247 288 L 153 288 Q 138 288 138 273 L 138 233 Q 138 218 153 218 Z" />

          <!-- Back of Arms - extended to cover more arm area -->
          <path id="arm-back-left-path" class="body-region" data-region="arms-hands"
            d="M 135 143 Q 120 148 115 178 L 110 228 Q 108 248 105 263 L 102 278" />

          <path id="arm-back-right-path" class="body-region" data-region="arms-hands"
            d="M 265 143 Q 280 148 285 178 L 290 228 Q 292 248 295 263 L 298 278" />

          <!-- Back of Legs - widened at top -->
          <path id="leg-back-left-path" class="body-region" data-region="legs-feet"
            d="M 163 283 L 163 383 Q 163 413 160 453 L 158 513 Q 156 543 153 563 L 150 593" />

          <path id="leg-back-right-path" class="body-region" data-region="legs-feet"
            d="M 237 283 L 237 383 Q 237 413 240 453 L 242 513 Q 244 543 247 563 L 250 593" />
        </g>
      </svg>
    `;
  }

  getMaleSilhouette() {
    return `M 200 35
      Q 235 35 235 60 L 238 85
      Q 255 90 265 105 L 275 115
      Q 290 120 295 140 L 300 200
      Q 302 220 295 240 L 285 260
      Q 280 275 278 290 L 280 350
      Q 282 380 285 420 L 288 480
      Q 290 510 292 535 L 295 560
      Q 298 575 305 585 L 305 595
      Q 295 600 285 598 L 275 590
      Q 270 580 268 565 L 265 535
      Q 262 500 260 460 L 258 400
      Q 256 360 254 340 L 250 300
      Q 248 280 245 265 L 240 250
      Q 235 240 225 235 L 215 232
      Q 205 230 195 230 L 185 232
      Q 175 235 165 240 L 160 250
      Q 155 265 152 280 L 148 300
      Q 146 320 144 340 L 142 400
      Q 140 460 138 500 L 135 535
      Q 132 565 130 580 L 125 590
      Q 115 598 105 600 L 95 595
      Q 95 585 102 575 L 108 560
      Q 110 535 112 510 L 115 480
      Q 118 420 120 380 L 122 340
      Q 122 305 120 290 L 115 260
      Q 108 240 110 220 L 115 200
      Q 120 160 130 140 Q 135 120 150 115
      L 160 105 Q 165 95 165 85
      L 165 60 Q 165 35 200 35 Z`;
  }

  getFemaleSilhouette() {
    return `M 200 35
      Q 230 35 230 58 L 233 82
      Q 248 88 258 102 L 268 112
      Q 282 118 288 138 L 292 180
      Q 294 200 288 220 L 280 245
      Q 275 265 272 285 L 275 340
      Q 278 370 282 410 L 286 470
      Q 288 500 292 530 L 295 555
      Q 298 570 305 582 L 305 592
      Q 295 597 285 595 L 275 588
      Q 270 578 268 562 L 265 532
      Q 262 495 258 450 L 255 400
      Q 252 360 250 340 L 248 320
      Q 245 300 242 285 L 240 270
      Q 250 260 258 245 Q 265 230 265 215
      Q 265 200 255 190 Q 245 180 230 178
      Q 215 176 200 178 Q 185 180 170 178
      Q 155 180 145 190 Q 135 200 135 215
      Q 135 230 142 245 Q 150 260 160 270
      L 158 285 Q 155 300 152 320 L 150 340
      Q 148 360 145 400 L 142 450
      Q 138 495 135 532 L 132 562
      Q 130 578 125 588 L 115 595
      Q 105 597 95 592 L 95 582
      Q 102 570 108 555 L 112 530
      Q 115 500 118 470 L 122 410
      Q 125 370 128 340 L 125 285
      Q 125 265 122 245 L 115 220
      Q 108 200 110 180 L 115 138
      Q 120 118 135 112 L 145 102
      Q 152 92 152 82 L 152 58
      Q 152 35 185 35 Q 192 35 200 35 Z`;
  }

  attachEventListeners() {
    // Gender toggle
    this.container.querySelectorAll('.gender-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const gender = e.currentTarget.dataset.gender;
        if (gender !== this.gender) {
          this.gender = gender;
          this.updateGenderDisplay();
        }
      });
    });

    // View toggle (front/back)
    this.container.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        if (view !== this.currentView) {
          this.currentView = view;
          this.updateViewDisplay();
        }
      });
    });

    // Body region interactions with hold-to-increase
    this.container.querySelectorAll('.body-region').forEach(region => {
      const regionId = region.dataset.region;

      // Mouse down - start hold timer
      region.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (e.button !== 0) return; // Only left click

        // Reset flags
        this.holdTriggered = false;
        this.isHolding = true;
        // Start hold timer for acceleration
        this.holdTimer = setTimeout(() => {
          this.startHoldAcceleration(regionId);
        }, this.holdThreshold);
      });

      // Mouse up - clear hold timer
      region.addEventListener('mouseup', (e) => {
        e.preventDefault();
        this.clearHoldTimers();
        this.isHolding = false;
        // Do not reset holdTriggered here; click handler will handle it
      });

      // Mouse leave - clear hold timer
      region.addEventListener('mouseleave', (e) => {
        this.clearHoldTimers();
        this.isHolding = false;
        // Keep holdTriggered state for click handling
      });

      // Click - handle intensity change (ignore if hold triggered)
      region.addEventListener('click', (e) => {
        e.preventDefault();
        const regionId = e.currentTarget.dataset.region;

        // If a hold was in progress, ignore the click to avoid double increment
        if (this.holdTriggered) {
          this.holdTriggered = false;
          return;
        }

        // Shift+click or right-click decreases intensity
        if (e.shiftKey || e.button === 2) {
          this.handleRegionClick(regionId, -1);
        } else {
          this.handleRegionClick(regionId, 1);
        }
      });

      // Context menu - prevent default for right-click
      region.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });

      // Touch support with hold
      region.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const regionId = e.currentTarget.dataset.region;

        // Start hold timer
        this.holdTimer = setTimeout(() => {
          this.startHoldAcceleration(regionId);
        }, this.holdThreshold);
      });

      region.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.clearHoldTimers();

        // Only trigger click if not a long press
        if (!this.holdTriggered) {
          const regionId = e.currentTarget.dataset.region;
          this.handleRegionClick(regionId, 1);
        }
        this.holdTriggered = false;
      });

      region.addEventListener('touchcancel', (e) => {
        this.clearHoldTimers();
        this.holdTriggered = false;
      });

      // Hover tooltip for intensity display
      region.addEventListener('mouseenter', (e) => {
        const regionId = e.currentTarget.dataset.region;
        this.showIntensityTooltip(regionId, e.currentTarget);
      });

      region.addEventListener('mouseleave', (e) => {
        this.hideIntensityTooltip();
      });
    });

    // Initialize current view
    this.currentView = 'front';
  }

  /**
   * Start accelerated intensity increase on hold
   */
  startHoldAcceleration(regionId) {
    this.holdTriggered = true;
    this.holdInterval = setInterval(() => {
      const currentData = this.selectedRegions.get(regionId);
      const currentIntensity = currentData?.intensity || 0;

      if (currentIntensity < this.maxIntensity) {
        this.handleRegionClick(regionId, 0.5); // Increase by 0.5 during hold
      } else {
        this.clearHoldTimers();
      }
    }, this.holdAcceleration);
  }

  /**
   * Clear all hold timers and intervals
   */
  clearHoldTimers() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.holdInterval) {
      clearInterval(this.holdInterval);
      this.holdInterval = null;
    }
  }

  /**
   * Show tooltip with current intensity value
   */
  showIntensityTooltip(regionId, element) {
    const regionData = this.selectedRegions.get(regionId);
    const intensity = regionData?.intensity || 0;

    if (intensity <= 0) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'intensity-tooltip';
    tooltip.id = 'intensity-tooltip';
    tooltip.textContent = `${this.regions[regionId]?.name || regionId}: ${intensity.toFixed(1)}/10`;

    document.body.appendChild(tooltip);

    // Position tooltip near cursor/element
    const rect = element.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
    tooltip.style.top = `${rect.top - 35}px`;
  }

  /**
   * Hide intensity tooltip
   */
  hideIntensityTooltip() {
    const tooltip = document.getElementById('intensity-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }

  updateGenderDisplay() {
    // Kill any in-flight hold interval so it cannot target a region that no
    // longer exists in the new SVG (prevents ghost clicks on view change).
    this.clearHoldTimers();

    const wrapper = this.container.querySelector('.body-svg-wrapper');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const borderColor = isDark ? 'rgba(255,255,255,0.15)' : '#ddddd0';
    const glassBg = isDark ? 'rgba(15, 35, 25, 0.75)' : 'rgba(255, 255, 255, 0.75)';

    wrapper.innerHTML = this.renderBodySVG(glassBg, borderColor);

    // Re-attach all region event listeners (full set from attachEventListeners)
    this.container.querySelectorAll('.body-region').forEach(region => {
      const regionId = region.dataset.region;

      region.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (e.button !== 0) return;
        this.holdTimer = setTimeout(() => {
          this.startHoldAcceleration(regionId);
        }, this.holdThreshold);
      });

      region.addEventListener('mouseup', (e) => {
        e.preventDefault();
        this.clearHoldTimers();
      });

      region.addEventListener('mouseleave', (e) => {
        this.clearHoldTimers();
      });

      region.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.shiftKey || e.button === 2) {
          this.handleRegionClick(regionId, -1);
        } else {
          this.handleRegionClick(regionId, 1);
        }
      });

      region.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });

      region.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.holdTimer = setTimeout(() => {
          this.startHoldAcceleration(regionId);
        }, this.holdThreshold);
      });

      region.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.clearHoldTimers();
        if (!this.holdTriggered) {
          this.handleRegionClick(regionId, 1);
        }
        this.holdTriggered = false;
      });

      region.addEventListener('touchcancel', (e) => {
        this.clearHoldTimers();
        this.holdTriggered = false;
      });

      region.addEventListener('mouseenter', (e) => {
        this.showIntensityTooltip(regionId, e.currentTarget);
      });

      region.addEventListener('mouseleave', (e) => {
        this.hideIntensityTooltip();
      });
    });

    // Restore selected regions visual state
    this.selectedRegions.forEach((data, regionId) => {
      const intensity = typeof data === 'object' ? data.intensity : data;
      this.applyIntensityVisual(regionId, intensity);
    });

    // Update active button state
    this.container.querySelectorAll('.gender-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.gender === this.gender);
    });
  }

  updateViewDisplay() {
    // Kill any in-flight hold interval so it cannot target a region that no
    // longer exists after switching front/back view (prevents ghost clicks).
    this.clearHoldTimers();

    const frontView = this.container.querySelector('.front-view');
    const backView = this.container.querySelector('.back-view');

    if (this.currentView === 'front') {
      frontView.style.display = 'block';
      backView.style.display = 'none';
    } else {
      frontView.style.display = 'none';
      backView.style.display = 'block';
    }

    // Update active button state
    this.container.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === this.currentView);
    });

    // Restore selected regions visual state
    this.selectedRegions.forEach((data, regionId) => {
      const intensity = typeof data === 'object' ? data.intensity : data;
      this.applyIntensityVisual(regionId, intensity);
    });
  }

  /**
   * Handle region click with continuous intensity model
   * @param {string} regionId - The region identifier
   * @param {number} delta - Intensity change: positive increases, negative decreases, 0 is hold-continue
   */
  handleRegionClick(regionId, delta = 1) {
    const currentData = this.selectedRegions.get(regionId);
    let currentIntensity = currentData?.intensity || 0;

    // Calculate new intensity
    let newIntensity = currentIntensity + delta;

    // Clamp to valid range
    newIntensity = Math.max(0, Math.min(this.maxIntensity, newIntensity));

    // Remove from map if intensity is 0, otherwise update
    if (newIntensity <= 0.01) {
      this.selectedRegions.delete(regionId);
      newIntensity = 0;
    } else {
      this.selectedRegions.set(regionId, {
        intensity: newIntensity,
        points: currentData?.points || [] // Preserve points for future localized rendering
      });
    }

    this.applyIntensityVisual(regionId, newIntensity);
    this.updateSummaryDisplay();
    this.options.onSelectionChange(this.getSelectedData());
  }

  applyIntensityVisual(regionId, intensity) {
    const regionData = this.regions[regionId];
    if (!regionData) return;

    const paths = regionData.paths || [regionData.path];
    const color = this.intensityToColor(intensity);

    paths.forEach(pathId => {
      const element = document.getElementById(pathId);
      if (!element) return;

      // Remove legacy intensity classes
      element.classList.remove('selected-1', 'selected-2', 'selected-3');

      // Apply dynamic color based on intensity
      if (intensity > 0) {
        element.style.fill = color;
        element.style.transition = 'fill 0.3s ease';

        // Add pulse animation for high intensity (>7)
        if (intensity >= 7) {
          element.classList.add('high-intensity');
          element.style.color = this.intensityToColor(intensity, 1);
        } else {
          element.classList.remove('high-intensity');
          element.style.color = '';
        }

        // Add subtle stroke for selected regions
        element.style.strokeWidth = intensity > 0 ? '2' : '1.5';
        if (intensity > 0) {
          element.style.stroke = this.intensityToColor(Math.min(intensity + 2, 10), 0.8);
        }
      } else {
        // Reset to default
        element.style.fill = '';
        element.style.strokeWidth = '';
        element.style.stroke = '';
        element.classList.remove('high-intensity');
        element.style.color = '';
      }
    });
  }

  updateSummaryDisplay() {
    const chipsContainer = this.container.querySelector('#summary-chips');
    const summaryContainer = this.container.querySelector('#selected-regions-summary');

    if (this.selectedRegions.size === 0) {
      summaryContainer.style.display = 'none';
      return;
    }

    summaryContainer.style.display = 'block';

    // Clear chips container safely
    chipsContainer.innerHTML = '';

    Array.from(this.selectedRegions.entries()).forEach(([regionId, data]) => {
      const regionData = this.regions[regionId];
      if (!regionData) return;

      const intensity = typeof data === 'object' ? data.intensity : data;
      const color = this.intensityToColor(intensity);

      // Calculate number of filled segments for mini bar (10 segments)
      const filledSegments = Math.round(intensity);

      // Build chip safely with DOM APIs to avoid XSS
      const chip = document.createElement('div');
      chip.className = 'summary-chip';
      chip.setAttribute('data-region', regionId);
      chip.style.borderColor = color;

      const nameSpan = document.createElement('span');
      nameSpan.style.color = color;
      nameSpan.textContent = regionData.name;
      chip.appendChild(nameSpan);

      const bar = document.createElement('div');
      bar.className = 'chip-intensity-bar';
      for (let i = 0; i < 10; i++) {
        const seg = document.createElement('span');
        seg.className = 'chip-intensity-segment' + (i < filledSegments ? ' active' : '');
        if (i < filledSegments) seg.style.background = color;
        bar.appendChild(seg);
      }
      chip.appendChild(bar);

      const valueSpan = document.createElement('span');
      valueSpan.className = 'chip-intensity-value';
      valueSpan.textContent = intensity.toFixed(1);
      chip.appendChild(valueSpan);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'chip-remove';
      removeBtn.setAttribute('data-region', regionId);
      removeBtn.setAttribute('aria-label', `Remove ${regionData.name}`);
      removeBtn.textContent = '×'; // multiplication sign
      chip.appendChild(removeBtn);

      chipsContainer.appendChild(chip);
    });

    // Attach remove listeners
    chipsContainer.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const regionId = e.currentTarget.dataset.region;
        this.selectedRegions.delete(regionId);
        this.applyIntensityVisual(regionId, 0);
        this.updateSummaryDisplay();
        this.options.onSelectionChange(this.getSelectedData());
      });
    });
  }

  loadInitialSelection() {
    if (this.options.initialSelection && this.options.initialSelection.length > 0) {
      this.options.initialSelection.forEach(selection => {
        if (selection.area && selection.intensity) {
          this.selectedRegions.set(selection.area, {
            intensity: selection.intensity,
            points: selection.points || []
          });
          this.applyIntensityVisual(selection.area, selection.intensity);
        }
      });
      this.updateSummaryDisplay();
    }
  }

  getSelectedData() {
    return Array.from(this.selectedRegions.entries()).map(([area, data]) => {
      const intensity = typeof data === 'object' ? data.intensity : data;
      return {
        area,
        intensity,
        name: this.regions[area]?.name || area
      };
    });
  }

  // Convert to legacy format for compatibility with existing form
  getLegacyFormat() {
    const selections = this.getSelectedData();
    if (selections.length === 0) return '';

    // Get highest intensity region as primary
    const primary = selections.reduce((max, s) => s.intensity > max.intensity ? s : max, selections[0]);

    // Map to existing body area format
    const areaMap = {
      'head-face': 'head / nervous',
      'eyes': 'eyes',
      'throat-mouth': 'throat / mouth',
      'chest-lungs': 'chest / lungs',
      'stomach-gut': 'stomach / gut',
      'arms-hands': 'arms / hands',
      'legs-feet': 'legs / feet',
      'back-upper': 'back',
      'back-lower': 'back',
      'back-neck': 'head / nervous'
    };

    return areaMap[primary.area] || 'other / unsure';
  }

  // Get enhanced format with intensity data
  getEnhancedFormat() {
    const selections = this.getSelectedData();
    if (selections.length === 0) return null;

    return {
      regions: selections,
      primaryArea: selections.reduce((max, s) => s.intensity > max.intensity ? s : max, selections[0]).area,
      totalRegions: selections.length,
      maxIntensity: Math.max(...selections.map(s => s.intensity)),
      averageIntensity: selections.reduce((sum, s) => sum + s.intensity, 0) / selections.length,
      legacyBodyArea: this.getLegacyFormat()
    };
  }

  /**
   * Get intensity for a specific region
   */
  getIntensity(regionId) {
    const data = this.selectedRegions.get(regionId);
    if (!data) return 0;
    return typeof data === 'object' ? data.intensity : data;
  }

  /**
   * Set intensity for a specific region directly
   */
  setIntensity(regionId, intensity) {
    const clamped = Math.max(0, Math.min(this.maxIntensity, intensity));
    this.selectedRegions.set(regionId, { intensity: clamped, points: [] });
    this.applyIntensityVisual(regionId, clamped);
    this.updateSummaryDisplay();
    this.options.onSelectionChange(this.getSelectedData());
  }

  /**
   * Get all regions with their current intensities
   */
  getAllIntensities() {
    const result = {};
    Object.keys(this.regions).forEach(regionId => {
      result[regionId] = this.getIntensity(regionId);
    });
    return result;
  }

  /**
   * Export data for backend submission
   */
  exportData() {
    return {
      timestamp: new Date().toISOString(),
      gender: this.gender,
      view: this.currentView,
      selections: this.getSelectedData(),
      summary: this.getEnhancedFormat()
    };
  }

  // Clear all selections
  clear() {
    this.selectedRegions.clear();
    this.container.querySelectorAll('.body-region').forEach(region => {
      region.classList.remove('selected-1', 'selected-2', 'selected-3', 'high-intensity');
      region.style.fill = '';
      region.style.stroke = '';
      region.style.strokeWidth = '';
      region.style.color = '';
    });
    this.updateSummaryDisplay();
    this.options.onSelectionChange([]);
  }

  /**
   * Cleanup and release resources (for consistency with 3D version)
   */
  cleanup() {
    this.clearHoldTimers();
    this.clear();
    // Remove any tooltips
    const tooltip = document.getElementById('intensity-tooltip');
    if (tooltip) tooltip.remove();
  }

  // Set selections programmatically
  setSelections(selections) {
    this.selectedRegions.clear();
    selections.forEach(s => {
      if (s.area && s.intensity) {
        this.selectedRegions.set(s.area, {
          intensity: s.intensity,
          points: s.points || []
        });
      }
    });

    // Clear all visual states first
    this.container.querySelectorAll('.body-region').forEach(region => {
      region.classList.remove('selected-1', 'selected-2', 'selected-3', 'high-intensity');
      region.style.fill = '';
      region.style.stroke = '';
      region.style.strokeWidth = '';
      region.style.color = '';
    });

    // Apply new states
    this.selectedRegions.forEach((data, regionId) => {
      const intensity = typeof data === 'object' ? data.intensity : data;
      this.applyIntensityVisual(regionId, intensity);
    });

    this.updateSummaryDisplay();
    this.options.onSelectionChange(this.getSelectedData());
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BodyHeatmap;
}

// Browser global (matches the legacy module pattern)
if (typeof window !== 'undefined') {
  window.BodyHeatmap = BodyHeatmap;
}

// Auto-initialize if data attribute present
document.addEventListener('DOMContentLoaded', () => {
  const containers = document.querySelectorAll('[data-body-heatmap]');
  containers.forEach(container => {
    const heatmap = new BodyHeatmap(container.id, {
      onSelectionChange: (data) => {
        // Store in global scope for form access
        window.mediscanBodySelections = data;

        // Update legacy selectedBody for compatibility
        if (typeof selectedBody !== 'undefined') {
          window.selectedBody = heatmap.getLegacyFormat();
        }
      }
    });

    // Expose on window for external access
    window.mediscanBodyHeatmap = heatmap;
  });
});
