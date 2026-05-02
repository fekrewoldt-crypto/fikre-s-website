// Demo Body Heatmap - Reference Image Based
// This module provides a body heatmap using reference images with precise region coordinates

class DemoBodyHeatmap {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }

    this.options = {
      onSelectionChange: options.onSelectionChange || (() => {}),
      initialSelection: options.initialSelection || []
    };

    // State management
    this.state = {
      gender: 'male',
      view: 'front',
      selectedRegions: new Map(),
      holdInterval: null,
      holdRegion: null,
      holdTimeout: null
    };

    // Region names mapping
    this.regionNames = {
      'head': 'Head',
      'neck': 'Neck',
      'chest': 'Chest',
      'abdomen': 'Abdomen',
      'pelvis': 'Pelvis',
      'left-shoulder': 'Left Shoulder',
      'right-shoulder': 'Right Shoulder',
      'left-upper-arm': 'Left Upper Arm',
      'right-upper-arm': 'Right Upper Arm',
      'left-elbow': 'Left Elbow',
      'right-elbow': 'Right Elbow',
      'left-forearm': 'Left Forearm',
      'right-forearm': 'Right Forearm',
      'left-wrist': 'Left Wrist',
      'right-wrist': 'Right Wrist',
      'left-hand': 'Left Hand',
      'right-hand': 'Right Hand',
      'left-upper-leg': 'Left Upper Leg',
      'right-upper-leg': 'Right Upper Leg',
      'left-knee': 'Left Knee',
      'right-knee': 'Right Knee',
      'left-lower-leg': 'Left Lower Leg',
      'right-lower-leg': 'Right Lower Leg',
      'left-ankle': 'Left Ankle',
      'right-ankle': 'Right Ankle',
      'left-foot': 'Left Foot',
      'right-foot': 'Right Foot',
      'upper-back': 'Upper Back',
      'lower-back': 'Lower Back',
      'buttocks': 'Buttocks',
      'left-hip': 'Left Hip',
      'right-hip': 'Right Hip',
      'groin': 'Groin'
    };

    // Image sources
    this.imageSources = {
      male: {
        front: 'male-front.png',
        back: 'male-back.png'
      },
      female: {
        front: 'female-front.png',
        back: 'female-back.png'
      }
    };

    // Region coordinates (normalized 0-1) for each view
    this.regionCoordinates = {
      male: {
        front: {
          'head': { x: 0.35, y: 0.02, width: 0.30, height: 0.12 },
          'neck': { x: 0.40, y: 0.14, width: 0.20, height: 0.06 },
          'chest': { x: 0.32, y: 0.20, width: 0.36, height: 0.14 },
          'abdomen': { x: 0.34, y: 0.34, width: 0.32, height: 0.12 },
          'pelvis': { x: 0.33, y: 0.46, width: 0.34, height: 0.10 },
          'groin': { x: 0.40, y: 0.56, width: 0.20, height: 0.06 },
          'left-shoulder': { x: 0.22, y: 0.20, width: 0.10, height: 0.08 },
          'right-shoulder': { x: 0.68, y: 0.20, width: 0.10, height: 0.08 },
          'left-upper-arm': { x: 0.18, y: 0.28, width: 0.08, height: 0.14 },
          'right-upper-arm': { x: 0.74, y: 0.28, width: 0.08, height: 0.14 },
          'left-elbow': { x: 0.16, y: 0.42, width: 0.08, height: 0.08 },
          'right-elbow': { x: 0.76, y: 0.42, width: 0.08, height: 0.08 },
          'left-forearm': { x: 0.14, y: 0.50, width: 0.08, height: 0.14 },
          'right-forearm': { x: 0.78, y: 0.50, width: 0.08, height: 0.14 },
          'left-wrist': { x: 0.12, y: 0.64, width: 0.08, height: 0.06 },
          'right-wrist': { x: 0.80, y: 0.64, width: 0.08, height: 0.06 },
          'left-hand': { x: 0.10, y: 0.70, width: 0.10, height: 0.08 },
          'right-hand': { x: 0.80, y: 0.70, width: 0.10, height: 0.08 },
          'left-upper-leg': { x: 0.35, y: 0.62, width: 0.12, height: 0.16 },
          'right-upper-leg': { x: 0.53, y: 0.62, width: 0.12, height: 0.16 },
          'left-knee': { x: 0.35, y: 0.78, width: 0.12, height: 0.08 },
          'right-knee': { x: 0.53, y: 0.78, width: 0.12, height: 0.08 },
          'left-lower-leg': { x: 0.35, y: 0.86, width: 0.12, height: 0.12 },
          'right-lower-leg': { x: 0.53, y: 0.86, width: 0.12, height: 0.12 },
          'left-ankle': { x: 0.35, y: 0.98, width: 0.12, height: 0.06 },
          'right-ankle': { x: 0.53, y: 0.98, width: 0.12, height: 0.06 },
          'left-foot': { x: 0.32, y: 1.02, width: 0.18, height: 0.04 },
          'right-foot': { x: 0.50, y: 1.02, width: 0.18, height: 0.04 }
        },
        back: {
          'head': { x: 0.35, y: 0.02, width: 0.30, height: 0.12 },
          'neck': { x: 0.40, y: 0.14, width: 0.20, height: 0.06 },
          'upper-back': { x: 0.32, y: 0.20, width: 0.36, height: 0.14 },
          'lower-back': { x: 0.34, y: 0.34, width: 0.32, height: 0.12 },
          'buttocks': { x: 0.30, y: 0.46, width: 0.40, height: 0.12 },
          'left-shoulder': { x: 0.22, y: 0.20, width: 0.10, height: 0.08 },
          'right-shoulder': { x: 0.68, y: 0.20, width: 0.10, height: 0.08 },
          'left-upper-arm': { x: 0.18, y: 0.28, width: 0.08, height: 0.14 },
          'right-upper-arm': { x: 0.74, y: 0.28, width: 0.08, height: 0.14 },
          'left-elbow': { x: 0.16, y: 0.42, width: 0.08, height: 0.08 },
          'right-elbow': { x: 0.76, y: 0.42, width: 0.08, height: 0.08 },
          'left-forearm': { x: 0.14, y: 0.50, width: 0.08, height: 0.14 },
          'right-forearm': { x: 0.78, y: 0.50, width: 0.08, height: 0.14 },
          'left-wrist': { x: 0.12, y: 0.64, width: 0.08, height: 0.06 },
          'right-wrist': { x: 0.80, y: 0.64, width: 0.08, height: 0.06 },
          'left-hand': { x: 0.10, y: 0.70, width: 0.10, height: 0.08 },
          'right-hand': { x: 0.80, y: 0.70, width: 0.10, height: 0.08 },
          'left-upper-leg': { x: 0.32, y: 0.58, width: 0.12, height: 0.16 },
          'right-upper-leg': { x: 0.56, y: 0.58, width: 0.12, height: 0.16 },
          'left-knee': { x: 0.32, y: 0.74, width: 0.12, height: 0.08 },
          'right-knee': { x: 0.56, y: 0.74, width: 0.12, height: 0.08 },
          'left-lower-leg': { x: 0.32, y: 0.82, width: 0.12, height: 0.12 },
          'right-lower-leg': { x: 0.56, y: 0.82, width: 0.12, height: 0.12 },
          'left-ankle': { x: 0.32, y: 0.94, width: 0.12, height: 0.06 },
          'right-ankle': { x: 0.56, y: 0.94, width: 0.12, height: 0.06 },
          'left-foot': { x: 0.28, y: 0.98, width: 0.18, height: 0.04 },
          'right-foot': { x: 0.54, y: 0.98, width: 0.18, height: 0.04 }
        }
      },
      female: {
        front: {
          'head': { x: 0.38, y: 0.02, width: 0.24, height: 0.10 },
          'neck': { x: 0.42, y: 0.12, width: 0.16, height: 0.04 },
          'chest': { x: 0.35, y: 0.16, width: 0.30, height: 0.14 },
          'abdomen': { x: 0.36, y: 0.30, width: 0.28, height: 0.12 },
          'pelvis': { x: 0.34, y: 0.42, width: 0.32, height: 0.10 },
          'groin': { x: 0.40, y: 0.52, width: 0.20, height: 0.04 },
          'left-shoulder': { x: 0.28, y: 0.16, width: 0.12, height: 0.06 },
          'right-shoulder': { x: 0.60, y: 0.16, width: 0.12, height: 0.06 },
          'left-upper-arm': { x: 0.18, y: 0.22, width: 0.12, height: 0.16 },
          'right-upper-arm': { x: 0.70, y: 0.22, width: 0.12, height: 0.16 },
          'left-elbow': { x: 0.16, y: 0.38, width: 0.08, height: 0.04 },
          'right-elbow': { x: 0.76, y: 0.38, width: 0.08, height: 0.04 },
          'left-forearm': { x: 0.12, y: 0.42, width: 0.10, height: 0.13 },
          'right-forearm': { x: 0.78, y: 0.42, width: 0.10, height: 0.13 },
          'left-wrist': { x: 0.10, y: 0.55, width: 0.08, height: 0.03 },
          'right-wrist': { x: 0.82, y: 0.55, width: 0.08, height: 0.03 },
          'left-hand': { x: 0.06, y: 0.58, width: 0.10, height: 0.07 },
          'right-hand': { x: 0.84, y: 0.58, width: 0.10, height: 0.07 },
          'left-upper-leg': { x: 0.35, y: 0.56, width: 0.12, height: 0.14 },
          'right-upper-leg': { x: 0.53, y: 0.56, width: 0.12, height: 0.14 },
          'left-knee': { x: 0.32, y: 0.70, width: 0.10, height: 0.04 },
          'right-knee': { x: 0.58, y: 0.70, width: 0.10, height: 0.04 },
          'left-lower-leg': { x: 0.30, y: 0.74, width: 0.10, height: 0.14 },
          'right-lower-leg': { x: 0.60, y: 0.74, width: 0.10, height: 0.14 },
          'left-ankle': { x: 0.28, y: 0.88, width: 0.08, height: 0.03 },
          'right-ankle': { x: 0.64, y: 0.88, width: 0.08, height: 0.03 },
          'left-foot': { x: 0.25, y: 0.91, width: 0.12, height: 0.07 },
          'right-foot': { x: 0.63, y: 0.91, width: 0.12, height: 0.07 }
        },
        back: {
          'head': { x: 0.38, y: 0.02, width: 0.24, height: 0.10 },
          'neck': { x: 0.42, y: 0.12, width: 0.16, height: 0.04 },
          'upper-back': { x: 0.35, y: 0.16, width: 0.30, height: 0.14 },
          'lower-back': { x: 0.36, y: 0.30, width: 0.28, height: 0.12 },
          'buttocks': { x: 0.28, y: 0.42, width: 0.44, height: 0.14 },
          'left-shoulder': { x: 0.28, y: 0.16, width: 0.12, height: 0.06 },
          'right-shoulder': { x: 0.60, y: 0.16, width: 0.12, height: 0.06 },
          'left-upper-arm': { x: 0.18, y: 0.22, width: 0.12, height: 0.16 },
          'right-upper-arm': { x: 0.70, y: 0.22, width: 0.12, height: 0.16 },
          'left-elbow': { x: 0.16, y: 0.38, width: 0.08, height: 0.04 },
          'right-elbow': { x: 0.76, y: 0.38, width: 0.08, height: 0.04 },
          'left-forearm': { x: 0.12, y: 0.42, width: 0.10, height: 0.13 },
          'right-forearm': { x: 0.78, y: 0.42, width: 0.10, height: 0.13 },
          'left-wrist': { x: 0.10, y: 0.55, width: 0.08, height: 0.03 },
          'right-wrist': { x: 0.82, y: 0.55, width: 0.08, height: 0.03 },
          'left-hand': { x: 0.06, y: 0.58, width: 0.10, height: 0.07 },
          'right-hand': { x: 0.84, y: 0.58, width: 0.10, height: 0.07 },
          'left-upper-leg': { x: 0.30, y: 0.56, width: 0.12, height: 0.14 },
          'right-upper-leg': { x: 0.58, y: 0.56, width: 0.12, height: 0.14 },
          'left-knee': { x: 0.28, y: 0.70, width: 0.10, height: 0.04 },
          'right-knee': { x: 0.62, y: 0.70, width: 0.10, height: 0.04 },
          'left-lower-leg': { x: 0.26, y: 0.74, width: 0.10, height: 0.14 },
          'right-lower-leg': { x: 0.64, y: 0.74, width: 0.10, height: 0.14 },
          'left-ankle': { x: 0.24, y: 0.88, width: 0.08, height: 0.03 },
          'right-ankle': { x: 0.68, y: 0.88, width: 0.08, height: 0.03 },
          'left-foot': { x: 0.20, y: 0.91, width: 0.12, height: 0.07 },
          'right-foot': { x: 0.68, y: 0.91, width: 0.12, height: 0.07 }
        }
      }
    };

    // Initialize
    this.init();
  }

  // Medical pain gradient colors (0-10 intensity)
  getPainColor(intensity) {
    const colors = [
      { intensity: 0, color: [59, 130, 246] },
      { intensity: 2.5, color: [6, 182, 212] },
      { intensity: 5, color: [34, 197, 94] },
      { intensity: 7.5, color: [234, 179, 8] },
      { intensity: 10, color: [239, 68, 68] }
    ];

    let lower = colors[0];
    let upper = colors[colors.length - 1];

    for (let i = 0; i < colors.length - 1; i++) {
      if (intensity >= colors[i].intensity && intensity <= colors[i + 1].intensity) {
        lower = colors[i];
        upper = colors[i + 1];
        break;
      }
    }

    const range = upper.intensity - lower.intensity;
    const progress = (intensity - lower.intensity) / range;

    const r = Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * progress);
    const g = Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * progress);
    const b = Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * progress);

    return `rgba(${r}, ${g}, ${b}, 0.75)`;
  }

  // Render the body heatmap
  renderBody() {
    const imageSrc = this.imageSources[this.state.gender][this.state.view];
    const coords = this.regionCoordinates[this.state.gender][this.state.view];

    this.container.innerHTML = `
      <div class="demo-heatmap-wrapper">
        <div class="demo-heatmap-controls">
          <button class="demo-btn ${this.state.gender === 'male' ? 'active' : ''}" data-gender="male">Male</button>
          <button class="demo-btn ${this.state.gender === 'female' ? 'active' : ''}" data-gender="female">Female</button>
          <button class="demo-btn ${this.state.view === 'front' ? 'active' : ''}" data-view="front">Front</button>
          <button class="demo-btn ${this.state.view === 'back' ? 'active' : ''}" data-view="back">Back</button>
          <button class="demo-btn" data-action="clear">Clear All</button>
        </div>
        <div class="demo-body-view">
          <div class="demo-body-image-container">
            <img class="demo-body-image" src="${imageSrc}" alt="${this.state.gender} ${this.state.view}" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
            <div class="demo-error" style="display:none;">
              <p>Failed to load image: ${imageSrc}</p>
              <p>Please make sure the reference images are in the project folder.</p>
            </div>
            <div class="demo-region-overlay">
              <svg viewBox="0 0 100 200" preserveAspectRatio="none">
                ${Object.entries(coords).map(([regionId, coord]) => {
                  const isSelected = this.state.selectedRegions.has(regionId);
                  const intensity = isSelected ? this.state.selectedRegions.get(regionId) : 0;
                  const fill = isSelected ? this.getPainColor(intensity) : 'transparent';
                  const pulseClass = intensity >= 7 ? 'pulse' : '';
                  const selectedClass = isSelected ? 'selected' : '';

                  return `<rect
                    class="demo-body-region ${selectedClass} ${pulseClass}"
                    data-region="${regionId}"
                    x="${coord.x * 100}"
                    y="${coord.y * 200}"
                    width="${coord.width * 100}"
                    height="${coord.height * 200}"
                    fill="${fill}"
                  />`;
                }).join('')}
              </svg>
            </div>
          </div>
        </div>
        <div class="demo-selected-regions">
          <h4>Selected Regions</h4>
          <div class="demo-regions-list" id="demo-regions-list">
            <span style="color: #999;">Click on body regions to select them</span>
          </div>
        </div>
      </div>
    `;

    // Add event listeners to controls
    this.container.querySelectorAll('.demo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleControlClick(e));
    });

    // Add event listeners to regions
    const regions = this.container.querySelectorAll('.demo-body-region');
    regions.forEach(region => {
      const regionId = region.getAttribute('data-region');
      region.addEventListener('click', (e) => this.handleRegionClick(e, regionId));
      region.addEventListener('mousedown', (e) => this.handleRegionMouseDown(e, regionId));
      region.addEventListener('mouseup', () => this.handleRegionMouseUp());
      region.addEventListener('mouseleave', () => this.handleRegionMouseUp());
      region.addEventListener('mouseenter', (e) => this.showTooltip(e, regionId));
      region.addEventListener('mousemove', (e) => this.moveTooltip(e));
      region.addEventListener('mouseleave', () => this.hideTooltip());
    });

    this.updateSelectedRegionsDisplay();
  }

  // Handle control button clicks
  handleControlClick(e) {
    const btn = e.target;
    const gender = btn.dataset.gender;
    const view = btn.dataset.view;
    const action = btn.dataset.action;

    if (gender) {
      this.state.gender = gender;
      this.renderBody();
    } else if (view) {
      this.state.view = view;
      this.renderBody();
    } else if (action === 'clear') {
      this.state.selectedRegions.clear();
      this.renderBody();
      this.notifySelectionChange();
    }
  }

  // Handle region click
  handleRegionClick(e, regionId) {
    e.preventDefault();

    if (this.state.selectedRegions.has(regionId)) {
      if (e.shiftKey) {
        let intensity = this.state.selectedRegions.get(regionId);
        intensity = Math.max(0, intensity - 1);
        if (intensity === 0) {
          this.state.selectedRegions.delete(regionId);
        } else {
          this.state.selectedRegions.set(regionId, intensity);
        }
      } else {
        this.state.selectedRegions.delete(regionId);
      }
    } else {
      // Start at intensity 1
      this.state.selectedRegions.set(regionId, 1);
    }

    this.renderBody();
    this.notifySelectionChange();
  }

  // Handle mouse down for hold-to-increase
  handleRegionMouseDown(e, regionId) {
    if (e.button !== 0) return;

    this.state.holdRegion = regionId;

    // Start increasing immediately with smaller increments for smoother visual feedback
    this.state.holdTimeout = setTimeout(() => {
      this.state.holdInterval = setInterval(() => {
        if (this.state.selectedRegions.has(this.state.holdRegion)) {
          let intensity = this.state.selectedRegions.get(this.state.holdRegion);
          intensity = Math.min(10, intensity + 0.2);
          this.state.selectedRegions.set(this.state.holdRegion, intensity);
          this.renderBody();
          this.notifySelectionChange();
        }
      }, 50);
    }, 100);
  }

  // Handle mouse up
  handleRegionMouseUp() {
    if (this.state.holdTimeout) {
      clearTimeout(this.state.holdTimeout);
      this.state.holdTimeout = null;
    }
    if (this.state.holdInterval) {
      clearInterval(this.state.holdInterval);
      this.state.holdInterval = null;
    }
    this.state.holdRegion = null;
  }

  // Show tooltip
  showTooltip(e, regionId) {
    const regionName = this.regionNames[regionId] || regionId;
    let tooltipText = regionName;

    if (this.state.selectedRegions.has(regionId)) {
      const intensity = this.state.selectedRegions.get(regionId);
      tooltipText += ` (Intensity: ${intensity.toFixed(1)})`;
    }

    let tooltip = document.getElementById('demo-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'demo-tooltip';
      tooltip.className = 'demo-tooltip';
      document.body.appendChild(tooltip);
    }

    tooltip.textContent = tooltipText;
    tooltip.style.display = 'block';
    this.moveTooltip(e);
  }

  // Move tooltip
  moveTooltip(e) {
    const tooltip = document.getElementById('demo-tooltip');
    if (tooltip) {
      tooltip.style.left = (e.clientX + 15) + 'px';
      tooltip.style.top = (e.clientY + 15) + 'px';
    }
  }

  // Hide tooltip
  hideTooltip() {
    const tooltip = document.getElementById('demo-tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  }

  // Update selected regions display
  updateSelectedRegionsDisplay() {
    const container = this.container.querySelector('#demo-regions-list');
    if (!container) return;

    if (this.state.selectedRegions.size === 0) {
      container.innerHTML = '<span style="color: #999;">Click on body regions to select them</span>';
      return;
    }

    container.innerHTML = '';

    for (const [regionId, intensity] of this.state.selectedRegions) {
      const regionName = this.regionNames[regionId] || regionId;
      const tag = document.createElement('div');
      tag.className = 'demo-region-tag';
      tag.style.background = this.getPainColor(intensity);
      tag.innerHTML = `
        ${regionName} (${intensity.toFixed(1)})
        <span class="demo-remove" data-region="${regionId}">✕</span>
      `;
      container.appendChild(tag);
    }

    // Add remove button listeners
    container.querySelectorAll('.demo-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const regionId = e.target.getAttribute('data-region');
        this.state.selectedRegions.delete(regionId);
        this.renderBody();
        this.notifySelectionChange();
      });
    });
  }

  // Notify selection change
  notifySelectionChange() {
    const data = this.getSelections();
    this.options.onSelectionChange(data);
  }

  // Get selections in enhanced format
  getSelections() {
    const regions = [];
    let maxIntensity = 0;

    for (const [regionId, intensity] of this.state.selectedRegions) {
      regions.push({
        area: regionId,
        name: this.regionNames[regionId] || regionId,
        intensity: Math.round(intensity * 10) / 10
      });
      if (intensity > maxIntensity) maxIntensity = intensity;
    }

    return {
      regions: regions,
      maxIntensity: Math.round(maxIntensity * 10) / 10,
      legacy: {
        selectedBody: regions.length > 0 ? regions[0].name : '',
        painLevel: maxIntensity
      }
    };
  }

  // Set selections from saved state
  setSelections(selections) {
    this.state.selectedRegions.clear();
    if (Array.isArray(selections)) {
      selections.forEach(s => {
        if (s.area && s.intensity) {
          this.state.selectedRegions.set(s.area, s.intensity);
        }
      });
    }
    this.renderBody();
    this.notifySelectionChange();
  }

  // Get enhanced format for API compatibility
  getEnhancedFormat() {
    return this.getSelections();
  }

  // Initialize the heatmap
  init() {
    // Apply initial selections if provided
    if (this.options.initialSelection && this.options.initialSelection.length > 0) {
      this.setSelections(this.options.initialSelection);
    }

    // Render the body
    this.renderBody();
  }

  // Destroy the heatmap
  destroy() {
    this.handleRegionMouseUp();
    this.hideTooltip();
    const tooltip = document.getElementById('demo-tooltip');
    if (tooltip) tooltip.remove();
    if (this.container) this.container.innerHTML = '';
  }
}

// Export to window for global access
window.DemoBodyHeatmap = DemoBodyHeatmap;

// Auto-initialize when DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', function() {
    // Check if the container exists and if initBodyHeatmap is defined
    const container = document.getElementById('body-heatmap-container');
    if (container && typeof window.initBodyHeatmap === 'function') {
      console.log('DemoBodyHeatmap module loaded, waiting for initBodyHeatmap...');
    } else if (container) {
      console.log('DemoBodyHeatmap module loaded, but initBodyHeatmap not found');
    }
  });
}
