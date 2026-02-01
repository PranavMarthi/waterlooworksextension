/**
 * Compatibility utilities for WaterlooWorks Azure
 * Handles browser detection, feature detection, and graceful degradation
 */

const Compatibility = {
  /**
   * Detected browser info
   */
  browser: {
    name: 'unknown',
    version: 'unknown',
    isChrome: false,
    isEdge: false,
    isFirefox: false,
    isBrave: false
  },

  /**
   * Feature support flags
   */
  features: {
    cssVariables: false,
    mutationObserver: false,
    intersectionObserver: false,
    storageSync: false
  },

  /**
   * Initialize compatibility detection
   */
  init() {
    this.detectBrowser();
    this.detectFeatures();
    console.log('[Azure] Compatibility initialized:', this.browser, this.features);
  },

  /**
   * Detect browser type and version
   */
  detectBrowser() {
    const ua = navigator.userAgent;
    
    if (ua.includes('Edg/')) {
      this.browser.name = 'Edge';
      this.browser.isEdge = true;
      const match = ua.match(/Edg\/(\d+)/);
      if (match) this.browser.version = match[1];
    } else if (ua.includes('Brave')) {
      this.browser.name = 'Brave';
      this.browser.isBrave = true;
      this.browser.isChrome = true; // Brave is Chromium-based
    } else if (ua.includes('Chrome/')) {
      this.browser.name = 'Chrome';
      this.browser.isChrome = true;
      const match = ua.match(/Chrome\/(\d+)/);
      if (match) this.browser.version = match[1];
    } else if (ua.includes('Firefox/')) {
      this.browser.name = 'Firefox';
      this.browser.isFirefox = true;
      const match = ua.match(/Firefox\/(\d+)/);
      if (match) this.browser.version = match[1];
    }
  },

  /**
   * Detect feature support
   */
  detectFeatures() {
    // CSS Variables
    this.features.cssVariables = window.CSS && CSS.supports && CSS.supports('--test', '0');
    
    // MutationObserver
    this.features.mutationObserver = 'MutationObserver' in window;
    
    // IntersectionObserver
    this.features.intersectionObserver = 'IntersectionObserver' in window;
    
    // Storage sync (may not be available in all contexts)
    this.features.storageSync = !!(chrome && chrome.storage && chrome.storage.sync);
  },

  /**
   * Safe feature wrapper - executes callback only if feature is supported
   * @param {string} feature - Feature name
   * @param {function} callback - Function to execute
   * @param {function} fallback - Optional fallback function
   */
  withFeature(feature, callback, fallback = null) {
    if (this.features[feature]) {
      try {
        return callback();
      } catch (error) {
        console.warn(`[Azure] Feature ${feature} failed:`, error);
        if (fallback) return fallback();
      }
    } else {
      console.warn(`[Azure] Feature ${feature} not supported`);
      if (fallback) return fallback();
    }
    return null;
  },

  /**
   * Debounce function for performance
   * @param {function} func - Function to debounce
   * @param {number} wait - Wait time in ms
   * @returns {function}
   */
  debounce(func, wait = 100) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function for performance
   * @param {function} func - Function to throttle
   * @param {number} limit - Limit in ms
   * @returns {function}
   */
  throttle(func, limit = 100) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * Safe DOM operation wrapper
   * @param {function} operation - DOM operation to perform
   * @param {string} featureName - Name for logging
   * @returns {*} Result of operation or null
   */
  safeDomOperation(operation, featureName = 'DOM operation') {
    try {
      return operation();
    } catch (error) {
      console.warn(`[Azure] ${featureName} failed:`, error);
      return null;
    }
  }
};

// Initialize on load
Compatibility.init();

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.AzureCompatibility = Compatibility;
}
