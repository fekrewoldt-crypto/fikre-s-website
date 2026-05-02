---
name: Continuous Pain Intensity Model Architecture
description: Architecture for the 0-10 continuous pain intensity system with hold-to-increase, HSL color interpolation, and medical-grade UX patterns
type: project
---

**Decision:** Upgraded body heatmap from 3-level discrete system to continuous 0-10 intensity scale

**Why:** The original 3-level system (mild/moderate/severe) felt like a UI control rather than a medical instrument. Patients need to express nuanced pain levels (e.g., "6.5/10") for accurate clinical documentation.

**How to apply:**
- State structure: `Map<regionId, { intensity: 0-10 (float), points: [] }>`
- Color mapping: HSL interpolation (yellow 50° → orange 30° → red 0° → purple 280°)
- Interaction: Click +1, Hold (200ms threshold) → +0.5 every 150ms, Shift+click -1
- Visual feedback: Pulse animation for intensity ≥7, hover tooltip shows exact value
- Opacity scales with intensity (0.3–0.95) for subtle-to-prominent visual hierarchy

**Key functions:**
- `intensityToColor(intensity, opacity)` - HSL interpolation
- `handleRegionClick(regionId, delta)` - Core intensity modification
- `startHoldAcceleration(regionId)` - Hold-to-increase logic
- `applyIntensityVisual(regionId, intensity)` - Dynamic style application

**Backward compatibility:** Maintain `getLegacyFormat()` for existing form submission pipelines
