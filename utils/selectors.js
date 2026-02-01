/**
 * Centralized DOM Selectors for WaterlooWorks Azure
 * All selectors are maintained here for easy updates when WaterlooWorks DOM changes
 */

const Selectors = {
  // ============================================
  // Global / Layout
  // ============================================
  global: {
    body: 'body',
    mainContent: '#mainContentDiv',
    header: 'header, .header__container, #orbisHeaderDiv',
    navigation: '#myAccountNav, .nav, .navbar',
    sidebar: '.sidebar, .span3, .span2',
    footer: 'footer, #orbisFooterDiv'
  },

  // ============================================
  // Dashboard
  // ============================================
  dashboard: {
    container: '#mainContentDiv',
    overviewTab: '#displayOverview',
    panels: '.panel, .box',
    announcements: '.customContentContainer',
    quickLinks: '.orbis-posting-actions'
  },

  // ============================================
  // Job Postings
  // ============================================
  postings: {
    // List view
    table: '.table, #postingsTable, table[id*="postings"]',
    tableHeader: 'thead',
    tableBody: 'tbody',
    tableRow: 'tbody tr',
    
    // Individual posting
    postingRow: 'tbody tr[data-id], tbody tr.posting-row',
    postingTitle: 'td a[href*="posting"], .job-title, td:nth-child(2) a',
    postingOrg: '.organization, td:nth-child(3)',
    postingLocation: '.location, td:nth-child(4)',
    postingDeadline: '.deadline, td[data-deadline]',
    postingStatus: '.status, .app-status',
    
    // Actions
    shortlistBtn: 'a[href*="shortlist"], .shortlist-btn, button[data-action="shortlist"]',
    applyBtn: 'a[href*="apply"], .apply-btn, button[data-action="apply"]',
    viewBtn: 'a[href*="posting"], .view-btn',
    
    // Filters and pagination
    filters: '.filters, .filter-container, #filterForm',
    pagination: '.pagination, .pager, ul.pager',
    pageNext: '.pagination .next, .pager .next, a[rel="next"]',
    pagePrev: '.pagination .prev, .pager .prev, a[rel="prev"]',
    
    // New/unread indicators
    newBadge: '.new-badge, .badge-new',
    
    // Checkboxes for batch
    checkbox: 'input[type="checkbox"]',
    selectAll: 'input[type="checkbox"][name="selectAll"], thead input[type="checkbox"]'
  },

  // ============================================
  // Applications
  // ============================================
  applications: {
    container: '#mainContentDiv',
    table: '.table, table[id*="application"]',
    row: 'tbody tr',
    status: '.status, .application-status',
    actions: '.actions, .btn-group'
  },

  // ============================================
  // Interviews
  // ============================================
  interviews: {
    container: '#mainContentDiv',
    table: '.table, table[id*="interview"]',
    row: 'tbody tr',
    timeSlot: '.time-slot, .interview-time',
    location: '.location, .interview-location',
    bookBtn: 'a[href*="book"], .book-btn'
  },

  // ============================================
  // Messages
  // ============================================
  messages: {
    container: '#mainContentDiv, .messageView',
    list: '.message-list, table[id*="message"]',
    row: 'tbody tr, .message-row',
    unread: '.unread, tr.unread, tr:not(.read)',
    subject: '.subject, td:nth-child(2)',
    sender: '.sender, .from, td:nth-child(1)',
    date: '.date, .sent-date, td:nth-child(3)',
    viewBtn: 'a[href*="message"], .view-message'
  },

  // ============================================
  // Login / Home
  // ============================================
  login: {
    container: 'body',
    loginForm: '#loginForm, form[action*="login"]',
    loginBtn: 'input[type="submit"], button[type="submit"]'
  },

  // ============================================
  // Modals
  // ============================================
  modals: {
    container: '.modal, .dialog, [role="dialog"]',
    backdrop: '.modal-backdrop, .overlay',
    closeBtn: '.close, .modal-close, [data-dismiss="modal"]',
    content: '.modal-content, .modal-body'
  }
};

/**
 * Query a selector with fallbacks
 * @param {string} selectorString - Comma-separated selector string
 * @param {Element} context - Context element (default: document)
 * @returns {Element|null}
 */
function querySelector(selectorString, context = document) {
  const selectors = selectorString.split(',').map(s => s.trim());
  
  for (const selector of selectors) {
    try {
      const element = context.querySelector(selector);
      if (element) return element;
    } catch (e) {
      // Invalid selector, try next
      console.warn(`[Azure] Invalid selector: ${selector}`);
    }
  }
  
  return null;
}

/**
 * Query all matching elements with fallbacks
 * @param {string} selectorString - Comma-separated selector string
 * @param {Element} context - Context element (default: document)
 * @returns {Element[]}
 */
function querySelectorAll(selectorString, context = document) {
  const selectors = selectorString.split(',').map(s => s.trim());
  const results = new Set();
  
  for (const selector of selectors) {
    try {
      const elements = context.querySelectorAll(selector);
      elements.forEach(el => results.add(el));
    } catch (e) {
      // Invalid selector, try next
      console.warn(`[Azure] Invalid selector: ${selector}`);
    }
  }
  
  return Array.from(results);
}

/**
 * Check if an element matches any of the selectors
 * @param {Element} element - Element to check
 * @param {string} selectorString - Comma-separated selector string
 * @returns {boolean}
 */
function matchesSelector(element, selectorString) {
  const selectors = selectorString.split(',').map(s => s.trim());
  
  for (const selector of selectors) {
    try {
      if (element.matches(selector)) return true;
    } catch (e) {
      // Invalid selector, try next
    }
  }
  
  return false;
}

/**
 * Get the current page type based on URL and DOM
 * @returns {string} Page type identifier
 */
function getCurrentPageType() {
  const url = window.location.href;
  const path = window.location.pathname;
  
  if (path.includes('/home.htm') || path === '/') {
    return 'home';
  }
  if (path.includes('/dashboard')) {
    return 'dashboard';
  }
  if (path.includes('/coop-postings') || path.includes('/jobs-postings')) {
    return 'postings';
  }
  if (path.includes('/applications') || path.includes('/coopApplications')) {
    return 'applications';
  }
  if (path.includes('/interview') || path.includes('/appts')) {
    return 'interviews';
  }
  if (path.includes('/message') || path.includes('/inbox')) {
    return 'messages';
  }
  if (path.includes('/myAccount')) {
    return 'account';
  }
  if (path.includes('/employer')) {
    return 'employer';
  }
  
  return 'unknown';
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.AzureSelectors = {
    Selectors,
    querySelector,
    querySelectorAll,
    matchesSelector,
    getCurrentPageType
  };
}
