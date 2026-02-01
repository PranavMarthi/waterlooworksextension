/**
 * DOM Observers for WaterlooWorks Azure
 * Handles SPA-like navigation and dynamic DOM updates
 */

const Observers = {
  // Observer instances
  routeObserver: null,
  contentObserver: null,
  
  // Callbacks registry
  callbacks: {
    routeChange: [],
    contentChange: [],
    ready: []
  },

  // State tracking
  currentUrl: '',
  isInitialized: false,

  /**
   * Initialize all observers
   */
  init() {
    if (this.isInitialized) return;
    
    this.currentUrl = window.location.href;
    
    // Set up route change detection
    this.initRouteObserver();
    
    // Set up content change detection
    this.initContentObserver();
    
    // Set up DOM ready detection
    this.initReadyObserver();
    
    this.isInitialized = true;
    console.log('[Azure] Observers initialized');
  },

  /**
   * Initialize route change observer
   * Detects URL changes for SPA navigation
   */
  initRouteObserver() {
    // Use both popstate and a polling mechanism for SPA detection
    window.addEventListener('popstate', () => this.checkRouteChange());
    
    // Also observe history changes
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.checkRouteChange();
    };
    
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.checkRouteChange();
    };

    // Fallback: periodic URL check for edge cases
    setInterval(() => this.checkRouteChange(), 1000);
  },

  /**
   * Check if route has changed and trigger callbacks
   */
  checkRouteChange() {
    const newUrl = window.location.href;
    
    if (newUrl !== this.currentUrl) {
      const oldUrl = this.currentUrl;
      this.currentUrl = newUrl;
      
      console.log('[Azure] Route changed:', oldUrl, '->', newUrl);
      
      // Trigger callbacks
      this.callbacks.routeChange.forEach(callback => {
        try {
          callback(newUrl, oldUrl);
        } catch (error) {
          console.error('[Azure] Route change callback failed:', error);
        }
      });
    }
  },

  /**
   * Initialize content observer for dynamic DOM updates
   */
  initContentObserver() {
    if (!window.AzureCompatibility?.features.mutationObserver) {
      console.warn('[Azure] MutationObserver not supported');
      return;
    }

    const targetNode = document.body || document.documentElement;
    
    const config = {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    };

    // Debounce the callback to prevent performance issues
    const debouncedCallback = window.AzureCompatibility.debounce((mutations) => {
      // Filter for significant changes
      const significantChanges = mutations.filter(mutation => {
        // Ignore our own changes
        if (mutation.target.classList?.contains('azure-injected')) {
          return false;
        }
        // Ignore text-only changes
        if (mutation.addedNodes.length === 0 && mutation.removedNodes.length === 0) {
          return false;
        }
        return true;
      });

      if (significantChanges.length > 0) {
        this.callbacks.contentChange.forEach(callback => {
          try {
            callback(significantChanges);
          } catch (error) {
            console.error('[Azure] Content change callback failed:', error);
          }
        });
      }
    }, 100);

    this.contentObserver = new MutationObserver(debouncedCallback);
    
    // Start observing once DOM is ready
    if (document.body) {
      this.contentObserver.observe(targetNode, config);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        this.contentObserver.observe(document.body, config);
      });
    }
  },

  /**
   * Initialize DOM ready observer
   */
  initReadyObserver() {
    const checkReady = () => {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        this.triggerReady();
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.triggerReady());
    } else {
      // DOM already ready
      this.triggerReady();
    }

    // Also trigger on full load
    window.addEventListener('load', () => this.triggerReady());
  },

  /**
   * Trigger ready callbacks
   */
  triggerReady() {
    this.callbacks.ready.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('[Azure] Ready callback failed:', error);
      }
    });
    // Clear ready callbacks after execution (they only run once)
    this.callbacks.ready = [];
  },

  /**
   * Register a callback for route changes
   * @param {function} callback - Callback function(newUrl, oldUrl)
   */
  onRouteChange(callback) {
    this.callbacks.routeChange.push(callback);
  },

  /**
   * Register a callback for content changes
   * @param {function} callback - Callback function(mutations)
   */
  onContentChange(callback) {
    this.callbacks.contentChange.push(callback);
  },

  /**
   * Register a callback for DOM ready
   * @param {function} callback - Callback function
   */
  onReady(callback) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      // Already ready, execute immediately
      try {
        callback();
      } catch (error) {
        console.error('[Azure] Ready callback failed:', error);
      }
    } else {
      this.callbacks.ready.push(callback);
    }
  },

  /**
   * Disconnect all observers
   */
  disconnect() {
    if (this.contentObserver) {
      this.contentObserver.disconnect();
    }
    this.isInitialized = false;
  }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.AzureObservers = Observers;
}
