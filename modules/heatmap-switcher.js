/**
 * MediScan Heatmap Switcher
 * Orchestrator for 2D SVG body heatmap with musclelibrary model
 *
 * Features:
 * - Unified API for 2D and muscles modes
 * - Seamless state synchronization between modes
 * - Consistent cleanup and resource management
 *
 * Supported modes:
 * - '2d': SVG-based body heatmap with general body regions (body-heatmap.js)
 * - 'muscles': SVG-based body heatmap with 70+ muscle regions (body-heatmap-muscles.js)
 */

import { HeatmapState } from './heatmap-state.js';

class HeatmapSwitcher {
  /**
   * @param {string} containerId - DOM element ID to mount the heatmap
   * @param {object} options - Configuration options
   * @param {function} options.onSelectionChange - Callback when selection changes
   * @param {HeatmapState} options.state - Optional shared state instance
   */
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);

    if (!this.container) {
      throw new Error(`HeatmapSwitcher: Container element "${containerId}" not found`);
    }

    this.options = {
      onSelectionChange: options.onSelectionChange || (() => {}),
      state: options.state || window.mediscanHeatmapState || new HeatmapState(),
      ...options
    };

    // State management
    this.state = this.options.state;

    // Current implementation instances
    this.heatmap2D = null;
    this.heatmapMuscles = null;
    this.currentMode = '2d';

    // Loading state
    this.isLoading = false;
    this.initPromise = null;

    // Bind methods
    this.onSelectionChange2D = this.onSelectionChange2D.bind(this);
    this.onSelectionChangeMuscles = this.onSelectionChangeMuscles.bind(this);

    // Subscribe to state changes
    this.state.subscribe((newState) => {
      if (newState.mode !== this.currentMode) {
        this.setMode(newState.mode);
      }
    });
  }

  /**
   * Initialize the switcher with the current mode
   * @returns {Promise<HeatmapSwitcher>} this for chaining
   */
  async init() {
    if (this.initPromise) return this.initPromise;

    this.isLoading = true;
    this.initPromise = (async () => {
      try {
        // Ensure container is ready
        this.container.innerHTML = '';
        this.container.style.position = 'relative';

        // Load the 2D mode
        await this.setMode('2d');

        this.isLoading = false;
        return this;
      } catch (error) {
        this.isLoading = false;
        console.error('HeatmapSwitcher: Init failed:', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Set mode (2D or muscles)
   * @param {string} mode - '2d' or 'muscles'
   */
  async setMode(mode) {
    // Validate mode
    if (!['2d', 'muscles'].includes(mode)) {
      console.warn(`HeatmapSwitcher: Invalid mode "${mode}", defaulting to 2D`);
      mode = '2d';
    }

    // Skip if already in this mode
    if (mode === this.currentMode && this.heatmap2D && this.heatmapMuscles) {
      return this;
    }

    this.isLoading = true;
    this.state.setMode(mode);

    try {
      // Cleanup current implementation
      await this.cleanup();

      // Clear container
      this.container.innerHTML = '';

      // Load the requested mode
      if (mode === 'muscles') {
        await this.loadMuscles();
      } else {
        await this.load2D();
      }

      this.currentMode = mode;
      this.isLoading = false;

      return this;
    } catch (error) {
      this.isLoading = false;
      console.error(`HeatmapSwitcher: Failed to load ${mode} mode:`, error);
      throw error;
    }
  }

  /**
   * Load 2D SVG heatmap
   */
  async load2D() {
    return new Promise((resolve, reject) => {
      try {
        // BodyHeatmap is loaded via script tag in IIndex.html
        if (typeof BodyHeatmap === 'undefined') {
          reject(new Error('BodyHeatmap class not found. Ensure body-heatmap.js is loaded.'));
          return;
        }

        // Get current state for initialization
        const initialSelection = this.state.regions.length > 0
          ? this.state.regions.map(r => ({ ...r }))
          : [];

        this.heatmap2D = new BodyHeatmap(this.containerId, {
          onSelectionChange: this.onSelectionChange2D,
          initialSelection
        });

        // Sync gender and view from state
        if (this.state.gender) {
          this.heatmap2D.gender = this.state.gender === 'm' ? 'male' : 'female';
        }
        if (this.state.view) {
          this.heatmap2D.currentView = this.state.view === '360' ? 'front' : this.state.view;
        }

        resolve(this);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Load muscles heatmap with 70+ anatomical regions
   */
  async loadMuscles() {
    return new Promise((resolve, reject) => {
      try {
        // BodyHeatmapMuscles is loaded via script tag in IIndex.html
        if (typeof BodyHeatmapMuscles === 'undefined') {
          reject(new Error('BodyHeatmapMuscles class not found. Ensure body-heatmap-muscles.js is loaded.'));
          return;
        }

        // Get current state for initialization
        const initialSelection = this.state.regions.length > 0
          ? this.state.regions.map(r => ({ ...r }))
          : [];

        this.heatmapMuscles = new BodyHeatmapMuscles(this.containerId, {
          onSelectionChange: this.onSelectionChangeMuscles,
          initialSelection
        });

        // Sync gender and view from state
        if (this.state.gender) {
          this.heatmapMuscles.gender = this.state.gender === 'm' ? 'male' : 'female';
        }
        if (this.state.view) {
          this.heatmapMuscles.currentView = this.state.view === '360' ? 'front' : this.state.view;
        }

        resolve(this);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle selection changes from 2D heatmap
   * @param {Array} data - Selection data array
   */
  onSelectionChange2D(data) {
    this.state.setRegions(data);
    this.options.onSelectionChange(data, '2d');
  }

  /**
   * Handle selection changes from muscles heatmap
   * @param {Array} data - Selection data array
   */
  onSelectionChangeMuscles(data) {
    this.state.setRegions(data);
    this.options.onSelectionChange(data, 'muscles');
  }

  /**
   * Get enhanced format (unified API)
   * @returns {object|null} Enhanced format data
   */
  getEnhancedFormat() {
    if (this.heatmap2D) {
      return this.heatmap2D.getEnhancedFormat();
    }
    if (this.heatmapMuscles) {
      return this.heatmapMuscles.getEnhancedFormat();
    }
    return this.state.getEnhancedFormat();
  }

  /**
   * Get legacy format (unified API)
   * @returns {string} Legacy format string
   */
  getLegacyFormat() {
    if (this.heatmap2D) {
      return this.heatmap2D.getLegacyFormat();
    }
    if (this.heatmapMuscles) {
      return this.heatmapMuscles.getLegacyFormat();
    }
    return this.state.getLegacyFormat();
  }

  /**
   * Set selections programmatically
   * @param {Array} selections - Array of { area, intensity, name }
   */
  setSelections(selections) {
    this.state.setRegions(selections);

    if (this.heatmap2D) {
      this.heatmap2D.setSelections(selections);
    }
    if (this.heatmapMuscles) {
      this.heatmapMuscles.setSelections(selections);
    }
  }

  /**
   * Clear all selections
   */
  clear() {
    this.state.clear();

    if (this.heatmap2D) {
      this.heatmap2D.clear();
    }
    if (this.heatmapMuscles) {
      this.heatmapMuscles.clear();
    }
  }

  /**
   * Get current mode
   * @returns {string} '2d' | 'muscles'
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Cleanup and dispose resources
   */
  async cleanup() {
    // Cleanup 2D instance
    if (this.heatmap2D) {
      try {
        if (typeof this.heatmap2D.cleanup === 'function') {
          this.heatmap2D.cleanup();
        }
      } catch (error) {
        console.error('HeatmapSwitcher: 2D cleanup error:', error);
      }
      this.heatmap2D = null;
    }

    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * Destroy the switcher and release all resources
   */
  async destroy() {
    await this.cleanup();
    this.container = null;
    this.options.onSelectionChange = null;
  }
}

// Export for ES modules
export { HeatmapSwitcher };

// Export class for manual initialization in IIndex.html
if (typeof window !== 'undefined') {
  window.HeatmapSwitcher = HeatmapSwitcher;
}

// Auto-initialize if data attribute present
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const containers = document.querySelectorAll('[data-body-heatmap-switcher]');
    containers.forEach(async (container) => {
      try {
        const switcher = new HeatmapSwitcher(container.id);
        await switcher.init();
        window.mediscanBodyHeatmapSwitcher = switcher;
      } catch (error) {
        console.error('HeatmapSwitcher auto-init failed:', error);
        if (typeof window.showToast === 'function') {
          showToast('Body heatmap failed to initialize', 'error');
        }
      }
    });
  });
}
