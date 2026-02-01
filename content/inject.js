/**
 * Main Injection Script for WaterlooActuallyWorks
 * Entry point for content script functionality
 */

const Azure = {
  version: '5.0.0',
  initialized: false,
  settings: null,

  /**
   * Check if current page is a login/home page
   */
  isLoginPage() {
    const url = window.location.href;
    const path = window.location.pathname;
    return path === '/' || 
           path === '/home.htm' || 
           path.includes('/login') ||
           url.includes('home.htm') ||
           document.querySelector('#loginForm, form[action*="login"]') !== null;
  },

  /**
   * Main initialization
   */
  async init() {
    if (this.initialized) return;
    
    console.log(`[WAW] WaterlooActuallyWorks v${this.version} initializing...`);

    try {
      // Load settings
      this.settings = await window.AzureStorage.getSettings();
      
      // Check if extension is globally enabled
      if (!this.settings.featuresEnabled) {
        console.log('[WAW] Extension disabled by user');
        return;
      }

      // Initialize feature flags
      await window.AzureFeatureFlags.init();

      // Initialize observers
      window.AzureObservers.init();

      // Mark login page to protect its styling
      if (this.isLoginPage()) {
        document.body.classList.add('waw-login-page');
        console.log('[WAW] Login page detected, minimal styling applied');
      }

      // Apply initial state
      this.applyTheme();
      
      // Set up route change handler
      window.AzureObservers.onRouteChange((newUrl, oldUrl) => {
        this.onRouteChange(newUrl, oldUrl);
      });

      // Set up DOM ready handler
      window.AzureObservers.onReady(() => {
        this.onDOMReady();
      });

      // Also init when fully loaded
      window.addEventListener('load', () => {
        // Re-check login page after full load
        if (this.isLoginPage()) {
          document.body.classList.add('waw-login-page');
        }
      });

      // Listen for settings changes
      window.AzureStorage.onSettingsChanged((changes, area) => {
        this.onSettingsChanged(changes);
      });

      this.initialized = true;
      console.log('[WAW] Initialization complete');

    } catch (error) {
      console.error('[WAW] Initialization failed:', error);
    }
  },

  /**
   * Apply theme based on settings
   */
  applyTheme() {
    // Don't apply heavy theming on login page
    if (this.isLoginPage()) {
      console.log('[WAW] Skipping theme on login page');
      return;
    }

    window.AzureFeatureFlags.withFeature('themes', () => {
      const themeId = this.settings.themeId || 'azure-light';
      const darkMode = this.shouldUseDarkMode();
      
      // Add theme class to body
      document.documentElement.classList.add('azure-themed', 'waw-themed');
      document.documentElement.setAttribute('data-azure-theme', themeId);
      
      if (darkMode) {
        document.documentElement.classList.add('azure-dark', 'waw-dark');
      } else {
        document.documentElement.classList.remove('azure-dark', 'waw-dark');
      }

      // Inject theme stylesheet
      const themeUrl = chrome.runtime.getURL(`ui/themes/${themeId}.css`);
      window.AzureDOMHooks.injectStylesheet(themeUrl, 'azure-theme-css');

      // Inject layout stylesheet
      const layoutUrl = chrome.runtime.getURL('ui/layout/layout.css');
      window.AzureDOMHooks.injectStylesheet(layoutUrl, 'azure-layout-css');

      console.log(`[WAW] Theme applied: ${themeId}, dark mode: ${darkMode}`);
    });
  },

  /**
   * Determine if dark mode should be used
   * @returns {boolean}
   */
  shouldUseDarkMode() {
    if (!this.settings.autoDarkMode) {
      return this.settings.darkMode;
    }

    // Auto dark mode based on time
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = this.settings.darkModeStart.split(':').map(Number);
    const [endHour, endMin] = this.settings.darkModeEnd.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes < endMinutes) {
      // Normal range (e.g., 22:00 to 07:00 doesn't apply here)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range (e.g., 22:00 to 07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  },

  /**
   * Handle DOM ready event
   */
  onDOMReady() {
    console.log('[Azure] DOM ready, applying enhancements');
    
    const pageType = window.AzureSelectors.getCurrentPageType();
    console.log(`[Azure] Page type: ${pageType}`);

    // Add body class for styling
    window.AzureDOMHooks.addBodyClass('azure-enhanced');
    window.AzureDOMHooks.addBodyClass(`azure-page-${pageType}`);

    // Apply page-specific enhancements
    this.applyPageEnhancements(pageType);
  },

  /**
   * Handle route changes (SPA navigation)
   * @param {string} newUrl - New URL
   * @param {string} oldUrl - Previous URL
   */
  onRouteChange(newUrl, oldUrl) {
    console.log('[Azure] Route changed, reapplying enhancements');
    
    // Clean up old page classes
    document.body?.classList.forEach(cls => {
      if (cls.startsWith('azure-page-')) {
        document.body.classList.remove(cls);
      }
    });

    // Reapply theme and enhancements
    this.applyTheme();
    
    const pageType = window.AzureSelectors.getCurrentPageType();
    window.AzureDOMHooks.addBodyClass(`azure-page-${pageType}`);
    
    // Small delay to let DOM update
    setTimeout(() => {
      this.applyPageEnhancements(pageType);
    }, 100);
  },

  /**
   * Handle settings changes
   * @param {object} changes - Changed settings
   */
  onSettingsChanged(changes) {
    console.log('[Azure] Settings changed:', Object.keys(changes));
    
    // Update local settings
    for (const [key, { newValue }] of Object.entries(changes)) {
      this.settings[key] = newValue;
    }

    // Reapply theme if theme settings changed
    if (changes.themeId || changes.darkMode || changes.autoDarkMode) {
      this.applyTheme();
    }

    // Handle feature toggle changes
    if (changes.featuresEnabled) {
      if (changes.featuresEnabled.newValue) {
        this.applyPageEnhancements(window.AzureSelectors.getCurrentPageType());
      } else {
        window.AzureDOMHooks.cleanup();
      }
    }

    // Job rearranger settings changed: re-initialize to pick up new settings
    if (changes.jobRearrangerEnabled || changes.jobRearrangerPriorityKeys || changes.jobRearrangerStandardOrder) {
      if (window.AzureJobInfoRearranger && window.AzureJobInfoRearranger.init) {
        window.AzureJobInfoRearranger.init();
      }
    }
  },

  /**
   * Apply page-specific enhancements
   * @param {string} pageType - Type of page
   */
  applyPageEnhancements(pageType) {
    // Job info rearranger now runs independently via MutationObserver (see job-info-rearranger.js)
    // No need to call it here - it self-initializes
    
    const url = window.location.href;
    if (url.includes('posting.htm') || url.includes('postingId=')) {
      this.enhancePostingDetail();
      return;
    }

    switch (pageType) {
      case 'home':
        this.enhanceHomePage();
        break;
      case 'dashboard':
        this.enhanceDashboard();
        break;
      case 'postings':
        this.enhancePostings();
        break;
      case 'applications':
        this.enhanceApplications();
        break;
      case 'interviews':
        this.enhanceInterviews();
        break;
      case 'messages':
        this.enhanceMessages();
        break;
      default:
        // Generic enhancements for unknown pages
        break;
    }
  },

  /**
   * Enhance posting detail page
   */
  enhancePostingDetail() {
    console.log('[WAW] Enhancing posting detail page');
    
    // Job info rearranger and navigator now run independently via MutationObserver
    // They will automatically detect and enhance the modal when it opens
  },

  /**
   * Enhance home/login page
   */
  enhanceHomePage() {
    window.AzureFeatureFlags.withFeature('layout', () => {
      console.log('[Azure] Enhancing home page');
      // Home page enhancements will go here
    });
  },

  /**
   * Enhance dashboard page
   */
  enhanceDashboard() {
    window.AzureFeatureFlags.withFeature('layout', () => {
      console.log('[Azure] Enhancing dashboard');
      // Dashboard enhancements will go here
    });
  },

  /**
   * Enhance job postings page
   */
  enhancePostings() {
    window.AzureFeatureFlags.withFeature('postings', () => {
      console.log('[Azure] Enhancing postings');
      
      // Inject postings-specific CSS
      const postingsUrl = chrome.runtime.getURL('ui/layout/postings.css');
      window.AzureDOMHooks.injectStylesheet(postingsUrl, 'azure-postings-css');
      
      // Apply posting enhancements
      this.applyPostingEnhancements();
    });

    window.AzureFeatureFlags.withFeature('batch', () => {
      // Batch operations will go here
      this.applyBatchOperations();
    });

    // Navigator handles keyboard navigation automatically via navigator.js
  },

  /**
   * Apply posting list enhancements
   */
  applyPostingEnhancements() {
    const { Selectors, querySelectorAll } = window.AzureSelectors;
    
    // Highlight new postings
    if (this.settings.highlightNew) {
      const newBadges = querySelectorAll(Selectors.postings.newBadge);
      newBadges.forEach(badge => {
        badge.closest('tr')?.classList.add('azure-new-posting');
      });
    }
  },

  /**
   * Apply batch operation controls
   */
  applyBatchOperations() {
    // Batch operations implementation will go here
    console.log('[Azure] Batch operations ready');
  },

  /**
   * Enhance applications page
   */
  enhanceApplications() {
    window.AzureFeatureFlags.withFeature('layout', () => {
      console.log('[Azure] Enhancing applications');
      // Applications enhancements will go here
    });
  },

  /**
   * Enhance interviews page
   */
  enhanceInterviews() {
    window.AzureFeatureFlags.withFeature('layout', () => {
      console.log('[Azure] Enhancing interviews');
      // Interviews enhancements will go here
    });
  },

  /**
   * Enhance messages page
   */
  enhanceMessages() {
    window.AzureFeatureFlags.withFeature('messages', () => {
      console.log('[Azure] Enhancing messages');
      
      // Inject messages-specific CSS
      const messagesUrl = chrome.runtime.getURL('ui/layout/messages.css');
      window.AzureDOMHooks.injectStylesheet(messagesUrl, 'azure-messages-css');
      
      // Highlight unread messages
      if (this.settings.highlightUnread) {
        const { Selectors, querySelectorAll } = window.AzureSelectors;
        const unreadRows = querySelectorAll(Selectors.messages.unread);
        unreadRows.forEach(row => {
          row.classList.add('azure-unread-message');
        });
      }
    });
  },

};

// Initialize when script loads
Azure.init();

// Export for debugging
if (typeof window !== 'undefined') {
  window.Azure = Azure;
  window.WAW = Azure; // Alias for new branding
}
