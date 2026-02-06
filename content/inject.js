/**
 * Main Injection Script for WaterlooActuallyWorks
 * Entry point for content script functionality
 */

const Azure = {
  version: '5.0.0',
  initialized: false,
  settings: null,
  applicationsSummaryObserver: null,
  applicationsSummaryDebounceTimer: null,

  /**
   * Check if current page is a login/home/logout page that should not be styled
   */
  isLoginPage() {
    const url = window.location.href;
    const path = window.location.pathname;
    const pageText = document.body?.innerText || '';
    
    return path === '/' || 
           path === '/home.htm' || 
           path.includes('/login') ||
           path.includes('/logout') ||
           path.includes('/sso/') ||
           url.includes('home.htm') ||
           document.querySelector('#loginForm, form[action*="login"]') !== null ||
           pageText.includes('You are now signed out') ||
           pageText.includes('Log in again');
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

      // Mark login page and inject dark theme so it matches reference (no enhancement CSS)
      if (this.isLoginPage()) {
        document.body.classList.add('waw-login-page');
        window.AzureDOMHooks.injectStylesheet(chrome.runtime.getURL('ui/themes/login-page.css'), 'waw-login-page-css');
        console.log('[WAW] Login page detected, dark theme applied');
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

    // Skip styling on login/logout pages
    if (Azure.isLoginPage() || pageType === 'home' || pageType === 'login' || pageType === 'logout') {
      console.log('[Azure] Login/logout page - skipping enhancements');
      document.body?.classList.add('waw-login-page');
      return;
    }

    // Inject enhancement CSS only on non-login pages (not in manifest so login stays untouched)
    window.AzureDOMHooks.injectStylesheet(chrome.runtime.getURL('ui/themes/base.css'), 'waw-base-css');
    window.AzureDOMHooks.injectStylesheet(chrome.runtime.getURL('ui/layout/keyboard-nav.css'), 'waw-keyboard-nav-css');

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
    if (pageType !== 'applications') {
      this.cleanupApplicationsSummary();
    }

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
      this.initFullApplicationsSummary();
    });
  },

  isFullApplicationsPage() {
    const path = (window.location.pathname || '').toLowerCase();
    return path.includes('/myaccount/co-op/full/applications.htm');
  },

  cleanupApplicationsSummary() {
    if (this.applicationsSummaryObserver) {
      this.applicationsSummaryObserver.disconnect();
      this.applicationsSummaryObserver = null;
    }
    if (this.applicationsSummaryDebounceTimer) {
      clearTimeout(this.applicationsSummaryDebounceTimer);
      this.applicationsSummaryDebounceTimer = null;
    }
    document.getElementById('waw-applications-summary')?.remove();
  },

  initFullApplicationsSummary() {
    if (!this.isFullApplicationsPage()) {
      this.cleanupApplicationsSummary();
      return;
    }

    this.renderFullApplicationsSummary();

    if (this.applicationsSummaryObserver) {
      this.applicationsSummaryObserver.disconnect();
    }

    const scheduleRefresh = () => {
      if (this.applicationsSummaryDebounceTimer) {
        clearTimeout(this.applicationsSummaryDebounceTimer);
      }
      this.applicationsSummaryDebounceTimer = setTimeout(() => {
        this.renderFullApplicationsSummary();
      }, 120);
    };

    this.applicationsSummaryObserver = new MutationObserver(() => {
      scheduleRefresh();
    });

    this.applicationsSummaryObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false
    });
  },

  findFullApplicationsTable() {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.find((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => (
        (th.innerText || th.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
      ));
      if (headers.length === 0) return false;
      const hasAppStatus = headers.some((text) => text.includes('app status'));
      const hasJobStatus = headers.some((text) => text.includes('job status'));
      return hasAppStatus && hasJobStatus;
    }) || null;
  },

  getApplicationsStatusColumnIndices(table) {
    const headers = Array.from(table.querySelectorAll('thead th'));
    let appStatusIndex = -1;
    let jobStatusIndex = -1;

    headers.forEach((th, index) => {
      const text = (th.innerText || th.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text.includes('app status')) appStatusIndex = index;
      if (text.includes('job status')) jobStatusIndex = index;
    });

    return { appStatusIndex, jobStatusIndex };
  },

  classifyApplicationStatus(appStatusRaw, jobStatusRaw) {
    const appStatus = String(appStatusRaw || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const jobStatus = String(jobStatusRaw || '').replace(/\s+/g, ' ').trim().toLowerCase();

    if (jobStatus === 'cancel' || jobStatus.startsWith('cancel')) return 'cancelled';
    if (appStatus === 'selected for interview') return 'interviewOffers';
    if (appStatus === 'not selected') return 'hardRejections';
    if (appStatus === 'applied' && jobStatus === 'expired - apps available') return 'indeterminate';
    if (appStatus === 'applied' && jobStatus !== 'expired - apps available') return 'softRejections';
    return 'other';
  },

  computeFullApplicationsSummary(table) {
    const summary = {
      interviewOffers: 0,
      softRejections: 0,
      hardRejections: 0,
      cancelled: 0,
      indeterminate: 0,
      totalRows: 0
    };

    const { appStatusIndex, jobStatusIndex } = this.getApplicationsStatusColumnIndices(table);
    if (appStatusIndex < 0 || jobStatusIndex < 0) {
      return summary;
    }

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      if (cells.length === 0) return;

      const appStatus = cells[appStatusIndex]?.innerText || cells[appStatusIndex]?.textContent || '';
      const jobStatus = cells[jobStatusIndex]?.innerText || cells[jobStatusIndex]?.textContent || '';
      const bucket = this.classifyApplicationStatus(appStatus, jobStatus);

      summary.totalRows += 1;
      if (bucket === 'other') return;
      summary[bucket] += 1;
    });

    return summary;
  },

  renderFullApplicationsSummary() {
    if (!this.isFullApplicationsPage()) {
      this.cleanupApplicationsSummary();
      return;
    }

    const table = this.findFullApplicationsTable();
    if (!table) {
      document.getElementById('waw-applications-summary')?.remove();
      return;
    }

    const summary = this.computeFullApplicationsSummary(table);

    const cardId = 'waw-applications-summary';
    let card = document.getElementById(cardId);
    if (!card) {
      card = document.createElement('section');
      card.id = cardId;
      card.className = 'azure-injected';
      table.parentElement?.insertBefore(card, table);
    }

    if (!document.getElementById('waw-applications-summary-style')) {
      window.AzureDOMHooks.injectStyles(`
        #waw-applications-summary {
          margin: 12px 0 16px;
          border: 1px solid #d7e3ef;
          background: linear-gradient(180deg, #f9fcff 0%, #f3f8fd 100%);
          border-radius: 10px;
          padding: 12px 14px;
        }
        #waw-applications-summary .waw-summary-title {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #0f4c81;
          margin-bottom: 8px;
        }
        #waw-applications-summary .waw-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 8px;
        }
        #waw-applications-summary .waw-summary-item {
          background: #ffffff;
          border: 1px solid #d7e3ef;
          border-radius: 8px;
          padding: 8px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        #waw-applications-summary .waw-summary-label {
          font-size: 12px;
          color: #43556d;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #waw-applications-summary .waw-summary-value {
          font-size: 18px;
          line-height: 1;
          font-weight: 700;
          color: #123d63;
        }
      `, 'waw-applications-summary-style');
    }

    card.innerHTML = `
      <div class="waw-summary-title">My Applications Summary</div>
      <div class="waw-summary-grid">
        <div class="waw-summary-item"><span class="waw-summary-label">Interview Offers</span><span class="waw-summary-value">${summary.interviewOffers}</span></div>
        <div class="waw-summary-item"><span class="waw-summary-label">Soft Rejections</span><span class="waw-summary-value">${summary.softRejections}</span></div>
        <div class="waw-summary-item"><span class="waw-summary-label">Hard Rejections</span><span class="waw-summary-value">${summary.hardRejections}</span></div>
        <div class="waw-summary-item"><span class="waw-summary-label">Cancelled</span><span class="waw-summary-value">${summary.cancelled}</span></div>
        <div class="waw-summary-item"><span class="waw-summary-label">Indeterminate</span><span class="waw-summary-value">${summary.indeterminate}</span></div>
      </div>
    `;
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
