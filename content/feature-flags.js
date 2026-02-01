/**
 * Feature Flags for WaterlooWorks Azure
 * Controls which features are enabled/disabled
 */

const FeatureFlags = {
  // Feature registry
  features: {
    themes: {
      id: 'themes',
      name: 'Theme System',
      description: 'Light/dark modes and accent themes',
      enabled: true,
      priority: 'P0'
    },
    layout: {
      id: 'layout',
      name: 'Layout Enhancements',
      description: 'Improved spacing, typography, and page layout',
      enabled: true,
      priority: 'P0'
    },
    postings: {
      id: 'postings',
      name: 'Job Posting Enhancements',
      description: 'Visual cues and workflow improvements for job listings',
      enabled: true,
      priority: 'P0'
    },
    batch: {
      id: 'batch',
      name: 'Batch Operations',
      description: 'Multi-select and batch actions for postings',
      enabled: true,
      priority: 'P0'
    },
    navigation: {
      id: 'navigation',
      name: 'Navigation Improvements',
      description: 'Quick access buttons and sticky navigation',
      enabled: true,
      priority: 'P1'
    },
    messages: {
      id: 'messages',
      name: 'Messaging UX',
      description: 'Improved message list and unread indicators',
      enabled: true,
      priority: 'P1'
    },
    shortcuts: {
      id: 'shortcuts',
      name: 'Keyboard Shortcuts',
      description: 'Keyboard navigation for common actions',
      enabled: true,
      priority: 'P1'
    }
  },

  // Feature status tracking
  status: {},

  /**
   * Initialize feature flags from storage
   */
  async init() {
    try {
      const settings = await window.AzureStorage.getSettings();
      
      // Check global enable
      if (!settings.featuresEnabled) {
        this.disableAll();
        return;
      }

      // Load individual feature states
      // For now, use defaults; later can load from storage
      for (const [key, feature] of Object.entries(this.features)) {
        this.status[key] = {
          enabled: feature.enabled,
          loaded: false,
          error: null
        };
      }

      console.log('[Azure] Feature flags initialized');
    } catch (error) {
      console.error('[Azure] Failed to initialize feature flags:', error);
      // Use defaults on error
      for (const key of Object.keys(this.features)) {
        this.status[key] = { enabled: true, loaded: false, error: null };
      }
    }
  },

  /**
   * Check if a feature is enabled
   * @param {string} featureId - Feature identifier
   * @returns {boolean}
   */
  isEnabled(featureId) {
    return this.status[featureId]?.enabled ?? false;
  },

  /**
   * Enable a feature
   * @param {string} featureId - Feature identifier
   */
  enable(featureId) {
    if (this.status[featureId]) {
      this.status[featureId].enabled = true;
    }
  },

  /**
   * Disable a feature
   * @param {string} featureId - Feature identifier
   */
  disable(featureId) {
    if (this.status[featureId]) {
      this.status[featureId].enabled = false;
    }
  },

  /**
   * Disable all features
   */
  disableAll() {
    for (const key of Object.keys(this.features)) {
      this.status[key] = { enabled: false, loaded: false, error: null };
    }
  },

  /**
   * Mark a feature as loaded
   * @param {string} featureId - Feature identifier
   */
  markLoaded(featureId) {
    if (this.status[featureId]) {
      this.status[featureId].loaded = true;
    }
  },

  /**
   * Mark a feature as failed
   * @param {string} featureId - Feature identifier
   * @param {Error} error - Error that occurred
   */
  markFailed(featureId, error) {
    if (this.status[featureId]) {
      this.status[featureId].enabled = false;
      this.status[featureId].error = error.message;
    }
    console.warn(`[Azure] Feature ${featureId} failed:`, error);
  },

  /**
   * Execute a feature if enabled
   * @param {string} featureId - Feature identifier
   * @param {function} callback - Function to execute
   */
  withFeature(featureId, callback) {
    if (!this.isEnabled(featureId)) {
      return null;
    }

    try {
      const result = callback();
      this.markLoaded(featureId);
      return result;
    } catch (error) {
      this.markFailed(featureId, error);
      return null;
    }
  },

  /**
   * Get status report for diagnostics
   * @returns {object}
   */
  getStatusReport() {
    return {
      features: this.status,
      timestamp: new Date().toISOString(),
      page: window.location.href
    };
  }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.AzureFeatureFlags = FeatureFlags;
}
