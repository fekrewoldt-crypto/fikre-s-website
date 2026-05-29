/**
 * MediScan Heatmap State Manager
 * Unified state management for 2D body heatmap and muscles modes
 *
 * Features:
 * - Centralized state storage for heatmap selections
 * - Subscriber pattern for state change notifications
 * - Mode tracking (2d | muscles), gender (m | f), view (front | back)
 * - JSON serialization for localStorage persistence
 * - Deep clone operations to prevent reference issues
 */

class HeatmapState {
  constructor() {
    // Core state
    this.regions = []; // Array of { area, name, intensity, points }
    this.mode = '2d'; // '2d' | 'muscles'
    this.gender = 'm'; // 'm' | 'f'
    this.view = 'front'; // 'front' | 'back'

    // Subscriber pattern for reactive updates
    this.subscribers = new Set();

    // Metadata
    this.lastUpdated = Date.now();
    this.maxIntensity = 10;
  }

  /**
   * Set regions array with validation
   * @param {Array} regions - Array of { area, name, intensity, points }
   */
  setRegions(regions) {
    const previousRegions = JSON.stringify(this.regions);

    // Deep clone to prevent external mutations
    this.regions = regions ? JSON.parse(JSON.stringify(regions)) : [];
    this.lastUpdated = Date.now();

    // Validate region structure
    this.regions = this.regions.map(r => ({
      area: r.area || '',
      name: r.name || '',
      intensity: Math.max(0, Math.min(this.maxIntensity, r.intensity || 0)),
      points: r.points || []
    }));

    // Notify subscribers if changed
    if (JSON.stringify(this.regions) !== previousRegions) {
      this.notify();
    }

    return this;
  }

  /**
   * Add or update a single region
   * @param {string} area - Region area identifier
   * @param {string} name - Human-readable region name
   * @param {number} intensity - Intensity 0-10
   * @param {Array} points - Optional points array for localized rendering
   */
  setRegion(area, name, intensity, points = []) {
    const existingIndex = this.regions.findIndex(r => r.area === area);
    const regionData = { area, name, intensity: Math.max(0, Math.min(this.maxIntensity, intensity)), points };

    if (existingIndex >= 0) {
      this.regions[existingIndex] = regionData;
    } else {
      this.regions.push(regionData);
    }

    this.lastUpdated = Date.now();
    this.notify();
    return this;
  }

  /**
   * Remove a region by area
   * @param {string} area - Region area identifier
   */
  removeRegion(area) {
    const index = this.regions.findIndex(r => r.area === area);
    if (index >= 0) {
      this.regions.splice(index, 1);
      this.lastUpdated = Date.now();
      this.notify();
    }
    return this;
  }

  /**
   * Clear all regions
   */
  clear() {
    if (this.regions.length > 0) {
      this.regions = [];
      this.lastUpdated = Date.now();
      this.notify();
    }
    return this;
  }

  /**
   * Get region by area
   * @param {string} area - Region area identifier
   * @returns {object|null} Region data or null if not found
   */
  getRegion(area) {
    return this.regions.find(r => r.area === area) || null;
  }

  /**
   * Get intensity for a specific region
   * @param {string} area - Region area identifier
   * @returns {number} Intensity 0-10, or 0 if not found
   */
  getIntensity(area) {
    const region = this.getRegion(area);
    return region ? region.intensity : 0;
  }

  /**
   * Set mode
   * @param {string} mode - '2d' | 'muscles'
   */
  setMode(mode) {
    if (mode !== this.mode && ['2d', 'muscles'].includes(mode)) {
      this.mode = mode;
      this.lastUpdated = Date.now();
      this.notify();
    }
    return this;
  }

  /**
   * Set gender
   * @param {string} gender - 'm' | 'f'
   */
  setGender(gender) {
    if (gender !== this.gender && (gender === 'm' || gender === 'f')) {
      this.gender = gender;
      this.lastUpdated = Date.now();
      this.notify();
    }
    return this;
  }

  /**
   * Set view
   * @param {string} view - 'front' | 'back'
   */
  setView(view) {
    if (view !== this.view && (view === 'front' || view === 'back')) {
      this.view = view;
      this.lastUpdated = Date.now();
      this.notify();
    }
    return this;
  }

  /**
   * Subscribe to state changes
   * @param {function} callback - Function to call on state change
   * @returns {function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Notify all subscribers of state change
   */
  notify() {
    const state = this.toJSON();
    this.subscribers.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('HeatmapState subscriber error:', error);
      }
    });
  }

  /**
   * Get state as plain object for serialization
   * @returns {object} Serializable state object
   */
  toJSON() {
    return {
      regions: JSON.parse(JSON.stringify(this.regions)),
      mode: this.mode,
      gender: this.gender,
      view: this.view,
      lastUpdated: this.lastUpdated,
      maxIntensity: this.maxIntensity
    };
  }

  /**
   * Load state from JSON object
   * @param {object} data - State object from toJSON() or localStorage
   * @returns {HeatmapState} this for chaining
   */
  fromJSON(data) {
    if (!data) return this;

    try {
      if (data.regions) {
        this.regions = JSON.parse(JSON.stringify(data.regions));
      }
      if (data.mode && ['2d', 'muscles'].includes(data.mode)) {
        this.mode = data.mode;
      }
      if (data.gender && (data.gender === 'm' || data.gender === 'f')) {
        this.gender = data.gender;
      }
      if (data.view && (data.view === 'front' || data.view === 'back')) {
        this.view = data.view;
      }
      if (data.maxIntensity) {
        this.maxIntensity = data.maxIntensity;
      }
      this.lastUpdated = data.lastUpdated || Date.now();
      this.notify();
    } catch (error) {
      console.error('HeatmapState fromJSON error:', error);
    }

    return this;
  }

  /**
   * Save state to localStorage
   * @param {string} key - localStorage key (default: 'mediscan_heatmap_state')
   */
  saveToStorage(key = 'mediscan_heatmap_state') {
    // Attempt server sync first; fallback to localStorage on failure or offline
    const payload = this.getEnhancedFormat();
    if (!payload) {
      // nothing to save
      return this;
    }
    try {
      // Use fetch; assume JWT token is stored in a global variable `authToken`
      const token = window.authToken || null;
      if (token) {
        fetch('/api/heatmap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        })
          .then(res => {
            if (!res.ok) throw new Error('Server rejected heatmap sync');
            return res.json();
          })
          .catch(err => {
            console.warn('Heatmap sync failed, falling back to localStorage:', err);
            localStorage.setItem(key, JSON.stringify(this.toJSON()));
          });
      } else {
        // No token – cannot sync, store locally
        localStorage.setItem(key, JSON.stringify(this.toJSON()));
      }
    } catch (error) {
      console.error('HeatmapState saveToStorage error:', error);
    }
    return this;
  }

  /**
   * Load state from localStorage
   * @param {string} key - localStorage key (default: 'mediscan_heatmap_state')
   * @param {number} ttl - Time-to-live in ms (default: 24 hours)
   * @returns {HeatmapState} this for chaining
   */
  loadFromStorage(key = 'mediscan_heatmap_state', ttl = 24 * 60 * 60 * 1000) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return this;

      const data = JSON.parse(stored);

      // Check TTL if timestamp exists
      if (data.timestamp && Date.now() - data.timestamp > ttl) {
        console.log('HeatmapState: stored data expired, clearing');
        localStorage.removeItem(key);
        return this;
      }

      return this.fromJSON(data.state || data);
    } catch (error) {
      console.error('HeatmapState loadFromStorage error:', error);
      // Clear corrupted data
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    }
    return this;
  }

  /**
   * Get enhanced format for API submission (matches existing heatmap API)
   * @returns {object|null} Enhanced format or null if no selections
   */
  getEnhancedFormat() {
    if (this.regions.length === 0) return null;

    const maxIntensity = Math.max(...this.regions.map(r => r.intensity));
    const primaryRegion = this.regions.find(r => r.intensity === maxIntensity);

    return {
      regions: JSON.parse(JSON.stringify(this.regions)),
      primaryArea: primaryRegion?.area || '',
      totalRegions: this.regions.length,
      maxIntensity,
      averageIntensity: this.regions.reduce((sum, r) => sum + r.intensity, 0) / this.regions.length,
      mode: this.mode,
      gender: this.gender,
      view: this.view
    };
  }

  /**
   * Get legacy format for backward compatibility
   * @returns {string} Legacy body area string
   */
  getLegacyFormat() {
    if (this.regions.length === 0) return '';

    const maxIntensity = Math.max(...this.regions.map(r => r.intensity));
    const primary = this.regions.find(r => r.intensity === maxIntensity);

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

    return areaMap[primary?.area] || 'other / unsure';
  }

  /**
   * Get statistics about current selections
   * @returns {object} Statistics object
   */
  getStats() {
    if (this.regions.length === 0) {
      return {
        totalRegions: 0,
        maxIntensity: 0,
        averageIntensity: 0,
        totalIntensity: 0,
        hasSelections: false
      };
    }

    const intensities = this.regions.map(r => r.intensity);
    return {
      totalRegions: this.regions.length,
      maxIntensity: Math.max(...intensities),
      averageIntensity: intensities.reduce((a, b) => a + b, 0) / intensities.length,
      totalIntensity: intensities.reduce((a, b) => a + b, 0),
      hasSelections: true
    };
  }
}

// Export for ES modules
export { HeatmapState };

// Create singleton instance for global access
if (typeof window !== 'undefined') {
  window.HeatmapState = HeatmapState;
  window.mediscanHeatmapState = new HeatmapState();
}

// Export for CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HeatmapState };
}
