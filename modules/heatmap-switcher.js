/**
 * MediScan Heatmap Switcher
 * Orchestrator for the 2D body heatmap with reference images.
 *
 * Features:
 * - Unified API for 2D and Legacy (demo) modes
 * - Seamless state synchronization between modes
 * - Consistent cleanup and resource management
 *
 * Supported modes:
 * - '2d': Reference-image based body heatmap (demo-body-heatmap-simple.js)
 * - 'demo': Legacy demo body grid (rendered standalone by the toggle handler)
 *
 * Note: the prior 'muscles' mode (body-heatmap-muscles.js) was removed.
 * Use the 2D toggle for the full reference-image experience.
 */

// Loaded via global script tag in IIndex.html, so HeatmapState is on window
// (set by modules/heatmap-state.js, which is loaded before this file).
// For ES-module callers, the named export below also works.

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
      state: options.state || window.mediscanHeatmapState || new (window.HeatmapState || HeatmapState)(),
      ...options
    };

    // State management
    this.state = this.options.state;

    // Current implementation instances
    this.heatmap2D = null;
    this.currentMode = '2d';

    // Loading state
    this.isLoading = false;
    this.initPromise = null;

    // Lifecycle
    this.isDestroyed = false;

    // Bind methods
    this.onSelectionChange2D = this.onSelectionChange2D.bind(this);

    // Subscribe to state changes. Store the unsubscribe so destroy() can
    // detach us from the shared HeatmapState — otherwise the callback would
    // keep firing after the container is nulled (race condition).
    this.unsubscribeState = this.state.subscribe((newState) => {
      if (this.isDestroyed) return;
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
   * Set mode (2D only — the muscles option has been removed)
   * @param {string} mode - '2d' or 'demo' (demo is rendered standalone by the toggle handler)
   */
  async setMode(mode) {
    // Validate mode. 'muscles' is silently coerced to '2d' so any stale
    // references in localStorage or state can't break the UI.
    if (!['2d', 'demo'].includes(mode)) {
      console.warn(`HeatmapSwitcher: Invalid mode "${mode}", defaulting to 2D`);
      mode = '2d';
    }

    // Skip if already in this mode and the 2D instance exists
    if (mode === this.currentMode && this.heatmap2D) {
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
      await this.load2D();

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
   * Load 2D heatmap (DemoBodyHeatmap with reference images).
   * The legacy BodyHeatmap class had 10 generic regions; DemoBodyHeatmap
   * has 33+ precise regions mapped to male/female front/back PNGs, which
   * is the working implementation we want as the default.
   */
  async load2D() {
    return new Promise((resolve, reject) => {
      try {
        // DemoBodyHeatmap is loaded via script tag in IIndex.html
        if (typeof DemoBodyHeatmap === 'undefined') {
          reject(new Error('DemoBodyHeatmap class not found. Ensure demo-body-heatmap-simple.js is loaded.'));
          return;
        }

        // Get current state for initialization
        const initialSelection = this.state.regions.length > 0
          ? this.state.regions.map(r => ({ ...r }))
          : [];

        this.heatmap2D = new DemoBodyHeatmap(this.containerId, {
          onSelectionChange: this.onSelectionChange2D,
          initialSelection
        });

        // DemoBodyHeatmap needs an explicit init() call to render
        if (typeof this.heatmap2D.init === 'function') {
          this.heatmap2D.init();
        }

        // Sync gender and view from state
        if (this.state.gender && this.heatmap2D.state) {
          this.heatmap2D.state.gender = this.state.gender === 'm' ? 'male' : 'female';
        }
        if (this.state.view && this.heatmap2D.state) {
          this.heatmap2D.state.view = this.state.view === '360' ? 'front' : this.state.view;
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
   * Get enhanced format (unified API)
   * @returns {object|null} Enhanced format data
   */
  getEnhancedFormat() {
    if (this.heatmap2D) {
      return this.heatmap2D.getEnhancedFormat();
    }
    return this.state.getEnhancedFormat();
  }

  /**
   * Get legacy format (unified API)
   * @returns {string} Legacy format string
   */
  getLegacyFormat() {
    if (this.heatmap2D && typeof this.heatmap2D.getLegacyFormat === 'function') {
      return this.heatmap2D.getLegacyFormat();
    }
    if (this.heatmap2D) {
      const selections = typeof this.heatmap2D.getSelections === 'function'
        ? this.heatmap2D.getSelections()
        : [];
      return selections.map(s => s.name || s.area).filter(Boolean).join(', ');
    }
    return this.state.getLegacyFormat();
  }

  /**
   * Set selections programmatically
   * @param {Array} selections - Array of { area, intensity, name }
   */
  setSelections(selections) {
    this.state.setRegions(selections);

    if (this.heatmap2D && typeof this.heatmap2D.setSelections === 'function') {
      this.heatmap2D.setSelections(selections);
    }
  }

  /**
   * Clear all selections
   */
  clear() {
    this.state.clear();

    if (this.heatmap2D && typeof this.heatmap2D.clear === 'function') {
      this.heatmap2D.clear();
    } else if (this.heatmap2D && typeof this.heatmap2D.setSelections === 'function') {
      this.heatmap2D.setSelections([]);
    }
  }

  /**
   * Get current mode
   * @returns {string} '2d' | 'demo'
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Cleanup and dispose resources
   */
  async cleanup() {
    // DemoBodyHeatmap exposes destroy() (not cleanup). Try both.
    if (this.heatmap2D) {
      try {
        if (typeof this.heatmap2D.destroy === 'function') {
          this.heatmap2D.destroy();
        } else if (typeof this.heatmap2D.cleanup === 'function') {
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
    this.isDestroyed = true;
    if (this.unsubscribeState) {
      this.unsubscribeState();
      this.unsubscribeState = null;
    }
    await this.cleanup();
    this.container = null;
    this.options.onSelectionChange = null;
  }
}

// Export for browser global (script tag) and CommonJS
if (typeof window !== 'undefined') {
  window.HeatmapSwitcher = HeatmapSwitcher;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HeatmapSwitcher };
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
