---
name: Interactive Body Heatmap Feature
description: Interactive body visualization with gender toggle, intensity levels, and heatmap overlay for pain location selection
type: project
---

MediScan includes an interactive body heatmap component for pain location selection, replacing/augmenting the legacy button grid.

**Why:** Science fair demo requires a visually impressive, intuitive way for users to indicate pain locations with intensity levels. The previous button grid was functional but lacked the "wow" factor and granularity.

**How to apply:** 
- The component is in `modules/body-heatmap.js` and auto-initializes on any element with `data-body-heatmap="true"`
- Access via `window.mediscanBodyHeatmap` for programmatic control
- Selections stored in `window.mediscanBodySelections`
- Enhanced format includes: regions array with area/intensity/name, primaryArea, totalRegions, maxIntensity
- Legacy format (single bodyArea string) maintained for API compatibility
- Front/back view toggle, male/female gender toggle, 3 intensity levels (mild→moderate→severe)
- Theme-aware (respects data-theme attribute)
- Demo/prototype available at `prototype-body-heatmap.html`

**Files:**
- `modules/body-heatmap.js` - Main component
- `prototype-body-heatmap.html` - Standalone demo
- `IIndex.html` - Integrated into main app (lines ~892-906)
