---
name: 3D Body Heatmap Implementation Architecture
description: Three.js procedural body model, shader materials, raycasting interaction, medical-grade UX
type: project
---

**Procedural Body Model Generation:**
- Head: SphereGeometry (0.35 radius, 32 segments)
- Eyes: Small spheres with scale transform (0.06 radius, flattened)
- Throat: CylinderGeometry with taper (0.12-0.14 radius)
- Chest: BoxGeometry (0.7 x 0.5 x 0.35)
- Abdomen: BoxGeometry (0.65 x 0.45 x 0.3)
- Arms: CylinderGeometry pairs (upper/lower) + sphere hands
- Legs: CylinderGeometry pairs (thigh/calf) + box feet
- Back regions: Separate meshes positioned behind torso
- All meshes use userData for regionId mapping

**Shader-Based Heatmap Material:**
- Custom ShaderMaterial with vertex/fragment shaders
- Uniforms: uBaseColor, uPainColor, uPainIntensity, uOpacity, uTime, uPulseIntensity
- Fresnel effect for rim lighting (edge highlight)
- Normal-based shading for depth perception
- Pulse animation via sin(uTime) modulation when intensity > 7
- Transparent blending with depthWrite: false

**Raycasting Interaction:**
- THREE.Raycaster with normalized device coordinates
- Mouse: (clientX / width) * 2 - 1, -(clientY / height) * 2 + 1
- Intersects all bodyMeshes recursively
- Hit mesh.userData.regionId maps to pain region
- Supports click, shift+click (decrease), right-click (rotate)
- Touch events with hold-to-increase behavior

**OrbitControls Configuration:**
- enableDamping: true, dampingFactor: 0.05
- minDistance: 3, maxDistance: 10
- maxPolarAngle: PI / 1.5 (prevent going below ground)
- enablePan: false (keep body centered)
- autoRotate for 360° view mode

**View Modes:**
- Front: Camera at (0, 0.5, 5)
- Back: Camera at (0, 0.5, -5)
- 360: Auto-rotation enabled at speed 2.0

**Region Mapping (matches 2D SVG version):**
- head-face, eyes, throat-mouth, chest-lungs, stomach-gut
- arms-hands (6 meshes: left/right upper, lower, hands)
- legs-feet (6 meshes: left/right thigh, calf, feet)
- back-upper, back-lower, back-neck

**Why:** Procedural geometry eliminates external model dependencies and licensing issues while maintaining clean medical aesthetics. Shader-based heatmaps provide GPU-accelerated smooth color interpolation and pulse animations at 60fps. Raycasting ensures precise click detection matching the structured region approach of the 2D version.

**How to apply:** When extending the 3D version, maintain parity with 2D region IDs, intensity-to-color mapping, and interaction patterns. Any new body parts must follow the same shader material pattern and userData structure for consistent behavior.
