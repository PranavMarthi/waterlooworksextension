/**
 * WaterlooActuallyWorks Navigator
 * Handles job navigation, shortlisting, and UI enhancements in modals and job lists
 */

(function() {
  'use strict';

  if (!window.location.href.includes('waterlooworks.uwaterloo.ca')) {
    return;
  }

  console.log('[WAW] Navigator loading...');

  // ============================================
  // Global State
  // ============================================
  
  let jobLinks = [];
  let currentJobIndex = -1;
  let shortlistedJobs = new Set();
  let settings = null;
  let modalObserver = null;
  let isClosingModal = false;
  let folderObserver = null;
  let linkSanitizeObserver = null;

  const DEFAULT_SETTINGS = {
    newJobDaysThreshold: 7,
    shortlistFolderName: 'shortlist'
  };

  const FOLDER_MENU_SELECTORS = [
    '[role="menu"]',
    '[role="listbox"]',
    '.dropdown-menu',
    '.menu',
    '.v-menu__content',
    '.mat-menu-panel',
    '.mat-select-panel',
    '.MuiMenu-paper',
    '.menuable__content__active'
  ];

  const FOLDER_ICON_NAMES = ['create_new_folder', 'folder', 'folder_open', 'folder_special'];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function isCreateFolderItem(text) {
    const lower = normalizeText(text).toLowerCase();
    return lower === 'create new folder' ||
           lower === 'new folder' ||
           lower === 'create folder' ||
           lower === 'add folder' ||
           lower === 'create a folder';
  }

  function uniqueList(list) {
    const seen = new Set();
    const result = [];
    list.forEach((item) => {
      const value = normalizeText(item);
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(value);
    });
    return result;
  }

  function safeClick(element) {
    if (!element) return false;
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    const isAnchor = tag === 'a';
    const href = isAnchor ? element.getAttribute('href') || '' : '';
    const isJavascriptHref = isAnchor && href.trim().toLowerCase().startsWith('javascript:');
    let restoreHref = null;

    if (isJavascriptHref) {
      restoreHref = href;
      element.setAttribute('href', '#');
      element.addEventListener('click', (event) => event.preventDefault(), { capture: true, once: true });
    }

    element.click();

    if (restoreHref !== null) {
      element.setAttribute('href', restoreHref);
    }

    return true;
  }

  function sanitizeJavascriptLink(link) {
    if (!link || link.tagName?.toLowerCase() !== 'a') return;
    const href = link.getAttribute('href') || '';
    if (href.trim().toLowerCase().startsWith('javascript:')) {
      if (!link.dataset.wawOriginalHref) {
        link.dataset.wawOriginalHref = href;
      }
      link.setAttribute('href', '#');
      if (!link.dataset.wawJsSanitized) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
        }, true);
        link.dataset.wawJsSanitized = 'true';
      }
    }
  }

  function sanitizeAllJavascriptLinks() {
    document.querySelectorAll('a[href^="javascript:" i]').forEach((link) => {
      sanitizeJavascriptLink(link);
    });
  }

  async function getStoredFolders() {
    try {
      if (window.AzureStorage?.getSettings) {
        const settings = await window.AzureStorage.getSettings(['shortlistFolders']);
        return Array.isArray(settings.shortlistFolders) ? settings.shortlistFolders : [];
      }
    } catch (e) {
      // fall through to chrome.storage
    }

    try {
      const result = await chrome.storage.sync.get({ shortlistFolders: [] });
      return Array.isArray(result.shortlistFolders) ? result.shortlistFolders : [];
    } catch (e) {
      return [];
    }
  }

  function folderListContains(list, name) {
    const target = normalizeText(name).toLowerCase();
    if (!target) return false;
    return (list || []).some((item) => normalizeText(item).toLowerCase() === target);
  }

  async function saveFolderList(list) {
    const folders = uniqueList(list);
    if (window.AzureStorage?.saveSettings) {
      await window.AzureStorage.saveSettings({ shortlistFolders: folders });
      return;
    }
    await chrome.storage.sync.set({ shortlistFolders: folders });
  }

  function getVisibleFolderMenus() {
    const menus = [];
    FOLDER_MENU_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (isElementVisible(el)) menus.push(el);
      });
    });
    return menus;
  }

  function extractFolderNamesFromMenu(menu) {
    const items = menu.querySelectorAll('li, button, a, [role="menuitem"], [role="option"], div');
    const names = [];
    items.forEach((item) => {
      const text = normalizeText(item.textContent);
      if (!text) return;
      if (isCreateFolderItem(text)) return;
      if (text.length > 40) return;
      names.push(text);
    });
    return names;
  }

  function extractFolderNamesFromCheckboxes(container) {
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    const names = [];
    checkboxes.forEach((checkbox) => {
      const label = checkbox.id ? container.querySelector(`label[for="${checkbox.id}"]`) : null;
      const parent = checkbox.closest('li, .folder, .tree-node, .item, .list-item, .checkbox, .form-check') || checkbox.parentElement;
      let text = normalizeText(label?.textContent || parent?.textContent || '');
      if (!text || text.length > 40) return;
      if (isCreateFolderItem(text)) return;
      names.push(text);
    });
    return names;
  }

  function findFolderContainers() {
    const containers = new Set();
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,.panel-title,.card-title,.section-title,.title'));
    headings.forEach((heading) => {
      const text = normalizeText(heading.textContent);
      if (!text || !/folder/i.test(text)) return;
      const section = heading.closest('section, .panel, .card, .sidebar, .modal, .drawer, .content, .container, .box') || heading.parentElement;
      if (section) containers.add(section);
    });

    document.querySelectorAll('[class*="folder"], [id*="folder"]').forEach((el) => {
      containers.add(el);
    });

    return Array.from(containers);
  }

  function findFolderMenuItems(menu) {
    return Array.from(menu.querySelectorAll('li, button, a, [role="menuitem"], [role="option"]'))
      .filter((item) => normalizeText(item.textContent));
  }

  function findFolderMenuItemByName(name) {
    const target = normalizeText(name).toLowerCase();
    if (!target) return null;
    const menus = getVisibleFolderMenus();
    for (const menu of menus) {
      const items = findFolderMenuItems(menu);
      for (const item of items) {
        const text = normalizeText(item.textContent).toLowerCase();
        if (text === target) return item;
      }
    }
    // Fallback: search visible elements by exact text and find a clickable ancestor
    const candidates = Array.from(document.querySelectorAll('label, button, a, li, div, span'));
    for (const candidate of candidates) {
      if (!isElementVisible(candidate)) continue;
      const text = normalizeText(candidate.textContent).toLowerCase();
      if (text !== target) continue;
      const checkbox = candidate.querySelector('input[type="checkbox"]') ||
        candidate.closest('li')?.querySelector('input[type="checkbox"]');
      if (checkbox) return checkbox;
      if (candidate.tagName.toLowerCase() === 'label') return candidate;
      const clickable = candidate.closest('button, a, [role="menuitem"], [role="option"], [role="button"], label, li');
      if (clickable) return clickable;
      return candidate;
    }
    return null;
  }

  function findCreateFolderMenuItem() {
    const menus = getVisibleFolderMenus();
    for (const menu of menus) {
      const items = findFolderMenuItems(menu);
      for (const item of items) {
        if (isCreateFolderItem(item.textContent)) return item;
      }
    }
    const candidates = Array.from(document.querySelectorAll('label, button, a, li, div, span'));
    for (const candidate of candidates) {
      if (!isElementVisible(candidate)) continue;
      if (isCreateFolderItem(candidate.textContent)) {
        const clickable = candidate.closest('button, a, [role="menuitem"], [role="option"], [role="button"], label, li');
        return clickable || candidate;
      }
    }
    return null;
  }

  function findFolderMenuTrigger(root = document) {
    const navBars = root.querySelectorAll('nav.floating--action-bar, .floating--action-bar, nav');
    for (const nav of navBars) {
      const buttons = nav.querySelectorAll('button, a');
      for (const button of buttons) {
        const icon = button.querySelector('i.material-icons');
        const iconText = normalizeText(icon?.textContent);
        if (iconText && FOLDER_ICON_NAMES.includes(iconText)) {
          return button;
        }
      }
    }

    const buttons = root.querySelectorAll('button, a');
    for (const button of buttons) {
      const icon = button.querySelector('i.material-icons');
      const iconText = normalizeText(icon?.textContent);
      if (iconText && FOLDER_ICON_NAMES.includes(iconText)) {
        return button;
      }
      const aria = normalizeText(button.getAttribute?.('aria-label'));
      if (aria && aria.toLowerCase().includes('folder')) {
        return button;
      }
    }

    return null;
  }

  async function openFolderMenuForJob(jobId = null) {
    let trigger = null;

    if (isModalOpen()) {
      const modal = document.querySelector('div[data-v-70e7ded6-s]');
      trigger = findFolderMenuTrigger(modal || document);
    }

    if (!trigger && jobId) {
      const row = document.querySelector(`tr[data-waw-job-id="${jobId}"]`);
      if (row) {
        const rowButtons = row.querySelectorAll('button, a');
        for (const rowButton of rowButtons) {
          const icon = rowButton.querySelector('i.material-icons');
          const iconText = normalizeText(icon?.textContent);
          const aria = normalizeText(rowButton.getAttribute?.('aria-label'));
          if ((iconText && FOLDER_ICON_NAMES.includes(iconText)) || (aria && aria.toLowerCase().includes('folder'))) {
            trigger = rowButton;
            break;
          }
        }
      }
    }

    if (!trigger) {
      trigger = findFolderMenuTrigger(document);
    }

    if (trigger) {
      safeClick(trigger);
      await sleep(150);
      return true;
    }
    return false;
  }

  async function waitForInput(selectorList, timeout = 1500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const selector of selectorList) {
        const input = document.querySelector(selector);
        if (input && isElementVisible(input)) return input;
      }
      await sleep(100);
    }
    return null;
  }

  async function waitForModalOpen(timeout = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (isModalOpen()) return true;
      await sleep(100);
    }
    return false;
  }

  function findConfirmButton() {
    const labels = ['create', 'save', 'ok', 'add'];
    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
    for (const button of buttons) {
      const text = normalizeText(button.textContent || button.value);
      if (!text) continue;
      if (labels.includes(text.toLowerCase())) return button;
    }
    return null;
  }

  const FolderManager = {
    async getFolders({ forceOpen = false } = {}) {
      let folders = [];
      let openedModal = false;
      const menus = getVisibleFolderMenus();
      menus.forEach((menu) => {
        folders = folders.concat(extractFolderNamesFromMenu(menu));
      });

      if (folders.length === 0 && forceOpen) {
        if (!isModalOpen()) {
          getAllJobLinks();
          if (jobLinks[0]) {
            safeClick(jobLinks[0]);
            openedModal = await waitForModalOpen(2000);
          }
        }
        const opened = await openFolderMenuForJob();
        if (opened) {
          await sleep(200);
          getVisibleFolderMenus().forEach((menu) => {
            folders = folders.concat(extractFolderNamesFromMenu(menu));
          });
        }
      }

      if (folders.length === 0) {
        const containers = findFolderContainers();
        containers.forEach((container) => {
          folders = folders.concat(extractFolderNamesFromCheckboxes(container));
        });

        if (folders.length === 0) {
          const labels = Array.from(document.querySelectorAll('label'))
            .filter((label) => isElementVisible(label))
            .filter((label) => {
              const text = normalizeText(label.textContent);
              if (!text || text.length > 40 || isCreateFolderItem(text)) return false;
              const direct = label.querySelector('input[type="checkbox"]');
              const byFor = label.htmlFor ? document.getElementById(label.htmlFor) : null;
              return !!direct || (byFor && byFor.type === 'checkbox');
            });
          if (labels.length > 0) {
            folders = labels.map((label) => normalizeText(label.textContent));
          }
        }
      }

      folders = uniqueList(folders);
      if (folders.length > 0) {
        await saveFolderList(folders);
      }

      if (openedModal) {
        const closeBtn = document.querySelector('div[data-v-70e7ded6-s] button[aria-label="Close"], .modal__close, button.close');
        if (closeBtn) {
          safeClick(closeBtn);
        }
      }
      return folders;
    },

    async selectFolder(name, jobId = null) {
      const target = normalizeText(name);
      if (!target) return { success: false, message: 'Missing folder name' };

      await openFolderMenuForJob(jobId);
      await sleep(150);

      let item = findFolderMenuItemByName(target);
      if (!item) {
        await sleep(150);
        await openFolderMenuForJob(jobId);
        await sleep(150);
        item = findFolderMenuItemByName(target);
      }
      if (!item) {
        return { success: false, message: 'Folder not found' };
      }
      safeClick(item);
      return { success: true };
    },

    async createFolder(name) {
      const target = normalizeText(name);
      if (!target) return { success: false, message: 'Missing folder name' };

      await openFolderMenuForJob();
      await sleep(150);

      const createItem = findCreateFolderMenuItem();
      if (!createItem) {
        return { success: false, message: 'Create folder option not found' };
      }
      safeClick(createItem);

      const input = await waitForInput(
        ['input[type="text"]', 'input[name*="folder"]', 'input[placeholder*="folder"]'],
        2000
      );
      if (!input) {
        return { success: false, message: 'Folder input not found' };
      }
      input.focus();
      input.value = target;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      const confirmButton = findConfirmButton();
      if (confirmButton) {
        confirmButton.click();
      }

      const existing = await this.getFolders({ forceOpen: true });
      const updated = uniqueList(existing.concat([target]));
      await saveFolderList(updated);
      return { success: true, folders: updated };
    }
  };

  // ============================================
  // Settings & Storage
  // ============================================

  async function loadSettings() {
    try {
      if (window.AzureStorage) {
        const loaded = await window.AzureStorage.getSettings([
          'newJobDaysThreshold',
          'shortlistFolderName'
        ]);
        settings = {
          newJobDaysThreshold: loaded.newJobDaysThreshold || DEFAULT_SETTINGS.newJobDaysThreshold,
          shortlistFolderName: loaded.shortlistFolderName || DEFAULT_SETTINGS.shortlistFolderName
        };
      } else {
        settings = DEFAULT_SETTINGS;
      }
    } catch (e) {
      settings = DEFAULT_SETTINGS;
    }

    // Load shortlisted jobs from localStorage
    try {
      const saved = localStorage.getItem('waw-shortlisted-jobs');
      if (saved) {
        shortlistedJobs = new Set(JSON.parse(saved).map(String));
        console.log(`[WAW] Loaded ${shortlistedJobs.size} shortlisted jobs`);
      }
    } catch (e) {
      console.error('[WAW] Failed to load shortlist:', e);
    }
  }

  function saveShortlist() {
    try {
      localStorage.setItem('waw-shortlisted-jobs', JSON.stringify(Array.from(shortlistedJobs)));
    } catch (e) {
      console.error('[WAW] Failed to save shortlist:', e);
    }
  }

  // ============================================
  // Job Table Functions
  // ============================================

  function getAllJobLinks() {
    const selectors = [
      'tbody tr a.overflow--ellipsis',
      'tbody[data-v-612a1958] a',
      '.table__row--body a[href="javascript:void(0)"]',
      'table tbody a[onclick]',
      'tr.table__row--body a',
      'tbody a'
    ];

    let links = [];
    for (const selector of selectors) {
      const found = document.querySelectorAll(selector);
      if (found.length > 0) {
        links = found;
        break;
      }
    }

    jobLinks = Array.from(links);
    jobLinks.forEach((link) => sanitizeJavascriptLink(link));
    console.log(`[WAW] Found ${jobLinks.length} job links`);
    return jobLinks;
  }

  function getJobIdFromRow(row) {
    // Method 1: Checkbox value
    const checkbox = row.querySelector('input[type="checkbox"][name="dataViewerSelection"]');
    if (checkbox && checkbox.value) {
      return String(checkbox.value);
    }

    // Method 2: Job ID in first column spans
    const firstTh = row.querySelector('th');
    if (firstTh) {
      const spans = firstTh.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent.trim();
        if (/^\d{6}$/.test(text)) {
          return text;
        }
      }
    }

    // Method 3: Regex match for 6-digit number
    const match = row.textContent.match(/\b\d{6}\b/);
    if (match) return match[0];

    return null;
  }

  function setCurrentIndexFromRow(row) {
    if (!row) return;
    const index = Number(row.dataset.wawIndex);
    if (Number.isFinite(index)) {
      currentJobIndex = index;
    }
  }

  function enhanceJobTable() {
    getAllJobLinks();
    
    // Clear existing enhancements
    document.querySelectorAll('.waw-row-indicator').forEach(el => el.remove());
    
    jobLinks.forEach((link, index) => {
      const row = link.closest('tr');
      if (!row) return;

      const jobId = getJobIdFromRow(row);
      if (!jobId) return;

      // Add shortlist indicator
      addShortlistIndicator(row, jobId);
      
      // Check if job is new and highlight
      checkAndHighlightNewJob(row);
      
      // Store index on row for navigation
      row.dataset.wawIndex = index;
      row.dataset.wawJobId = jobId;

      if (!row.dataset.wawClickBound) {
        row.addEventListener('click', (event) => {
          const targetRow = event.target?.closest?.('tr') || row;
          setCurrentIndexFromRow(targetRow);
        });
        row.dataset.wawClickBound = 'true';
      }

      if (!link.dataset.wawClickBound) {
        link.addEventListener('click', () => {
          setCurrentIndexFromRow(row);
        });
        link.dataset.wawClickBound = 'true';
      }
    });
  }

  function addShortlistIndicator(row, jobId) {
    const titleCell = row.querySelector('td:nth-child(2)') || row.querySelector('td a')?.closest('td');
    if (!titleCell) return;

    // Check if indicator already exists
    if (row.querySelector('.waw-shortlist-indicator')) return;

    const isShortlisted = shortlistedJobs.has(String(jobId));

    const indicator = document.createElement('span');
    indicator.className = 'waw-row-indicator waw-shortlist-indicator';
    indicator.dataset.jobId = jobId;
    indicator.innerHTML = isShortlisted ? '★' : '☆';
    indicator.title = isShortlisted ? 'Remove from shortlist' : 'Add to shortlist';
    indicator.style.cssText = `
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 20px;
      cursor: pointer;
      color: ${isShortlisted ? '#f39c12' : '#999'};
      z-index: 10;
      transition: all 0.2s ease;
    `;

    indicator.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await toggleShortlistJob(jobId, indicator);
    });

    indicator.addEventListener('mouseenter', () => {
      indicator.style.transform = 'translateY(-50%) scale(1.2)';
      indicator.style.color = '#f39c12';
    });

    indicator.addEventListener('mouseleave', () => {
      indicator.style.transform = 'translateY(-50%)';
      indicator.style.color = shortlistedJobs.has(String(jobId)) ? '#f39c12' : '#999';
    });

    // Make cell relative positioned
    titleCell.style.position = 'relative';
    titleCell.style.paddingRight = '40px';
    titleCell.appendChild(indicator);
  }

  function ensureShortlistIndicator(jobId) {
    const row = document.querySelector(`tr[data-waw-job-id="${jobId}"]`);
    if (row && !row.querySelector('.waw-shortlist-indicator')) {
      addShortlistIndicator(row, jobId);
      return;
    }

    if (!row) {
      const rows = Array.from(document.querySelectorAll('tr')).filter((tr) => tr.dataset?.wawIndex !== undefined);
      for (const tr of rows) {
        if (String(getJobIdFromRow(tr)) === String(jobId)) {
          if (!tr.querySelector('.waw-shortlist-indicator')) {
            addShortlistIndicator(tr, jobId);
          }
          break;
        }
      }
    }
  }

  function checkAndHighlightNewJob(row) {
    // Look for NEW badge or deadline text
    const hasNewBadge = row.querySelector('.badge-new') || 
                        Array.from(row.querySelectorAll('span')).some(span => span.textContent.trim() === 'NEW');
    const deadlineText = row.textContent.match(/Deadline in (\d+) day/);
    
    if (hasNewBadge || (deadlineText && parseInt(deadlineText[1]) > (settings?.newJobDaysThreshold || 7) - 7)) {
      row.classList.add('waw-new-job');
    }
  }

  // ============================================
  // Shortlist Functions
  // ============================================

  async function toggleShortlistJob(jobId, indicatorElement = null) {
    const jobIdStr = String(jobId);
    const wasShortlisted = shortlistedJobs.has(jobIdStr);

    if (wasShortlisted) {
      shortlistedJobs.delete(jobIdStr);
      showNotification('Removed from shortlist', 'remove');
      saveShortlist();
      ensureShortlistIndicator(jobIdStr);
      document.querySelectorAll(`.waw-shortlist-indicator[data-job-id="${jobId}"]`).forEach(el => {
        el.innerHTML = '☆';
        el.title = 'Add to shortlist';
        el.style.color = '#999';
      });
      updateModalShortlistIndicator();
      return;
    } else {
      const added = await addToWaterlooWorksFolder(jobId);
      if (!added) {
        return;
      }
      shortlistedJobs.add(jobIdStr);
      showNotification('Added to shortlist!', 'add');
    }

    saveShortlist();
    ensureShortlistIndicator(jobIdStr);
    
    // Update all indicators for this job
    document.querySelectorAll(`.waw-shortlist-indicator[data-job-id="${jobId}"]`).forEach(el => {
      const isNowShortlisted = shortlistedJobs.has(jobIdStr);
      el.innerHTML = isNowShortlisted ? '★' : '☆';
      el.title = isNowShortlisted ? 'Remove from shortlist' : 'Add to shortlist';
      el.style.color = isNowShortlisted ? '#f39c12' : '#999';
    });

    // Update modal indicator if open
    updateModalShortlistIndicator();
  }

  async function addToWaterlooWorksFolder(jobId) {
    const folderName = normalizeText(settings?.shortlistFolderName || '');
    if (!folderName) {
      showNotification('Select or create a shortlist folder in the extension popup', 'info');
      await FolderManager.getFolders({ forceOpen: true });
      return false;
    }

    let folders = await getStoredFolders();
    if (!folders || folders.length === 0) {
      folders = await FolderManager.getFolders({ forceOpen: true });
    }

    if (!folders || folders.length === 0) {
      showNotification('No folders found. Create one in the extension popup.', 'info');
      return false;
    }

    if (!folderListContains(folders, folderName)) {
      showNotification('Select a shortlist folder in the extension popup', 'info');
      return false;
    }

    const result = await FolderManager.selectFolder(folderName, jobId);
    if (result?.success) {
      console.log(`[WAW] Added job ${jobId} to folder ${folderName}`);
      return true;
    } else {
      console.log(`[WAW] Could not select folder ${folderName}: ${result?.message || 'unknown error'}`);
      showNotification('Could not select folder. Open a posting and try again.', 'error');
      return false;
    }
  }

  // ============================================
  // Modal Navigation
  // ============================================

  function isModalOpen() {
    return document.querySelector('div[data-v-70e7ded6-s]') !== null;
  }

  function getCurrentModalJobId() {
    const modal = document.querySelector('div[data-v-70e7ded6-s]');
    if (!modal) return null;

    // Try to find job ID in modal header
    const header = modal.querySelector('.dashboard-header--mini');
    if (header) {
      const idSpan = header.querySelector('.tag-label span, span.tag-label');
      if (idSpan) {
        const match = idSpan.textContent.match(/\d{6}/);
        if (match) return match[0];
      }
    }

    // Fallback to current index
    if (currentJobIndex >= 0 && jobLinks[currentJobIndex]) {
      const row = jobLinks[currentJobIndex].closest('tr');
      if (row) return getJobIdFromRow(row);
    }

    return null;
  }

  function addModalNavigationUI() {
    const modal = document.querySelector('div[data-v-70e7ded6-s]');
    if (!modal) return;

    const modalHeader = modal.querySelector('.dashboard-header--mini');
    if (!modalHeader) return;

    // Remove existing nav UI
    const existing = document.getElementById('waw-modal-nav');
    if (existing) existing.remove();

    const jobId = getCurrentModalJobId();
    const isShortlisted = jobId ? shortlistedJobs.has(String(jobId)) : false;

    const navUI = document.createElement('div');
    navUI.id = 'waw-modal-nav';
    navUI.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      margin-right: 12px;
    `;

    navUI.innerHTML = `
      <button class="waw-nav-btn" id="waw-nav-prev" title="Previous job (← or A)">←</button>
      <button class="waw-nav-btn waw-shortlist-btn ${isShortlisted ? 'is-shortlisted' : ''}" 
              id="waw-nav-shortlist" title="Shortlist (W/S)" data-job-id="${jobId || ''}">${isShortlisted ? '★' : '☆'}</button>
      <button class="waw-nav-btn" id="waw-nav-next" title="Next job (→ or D)">→</button>
    `;

    // Add styles (only once)
    if (!document.getElementById('waw-nav-styles')) {
      const style = document.createElement('style');
      style.id = 'waw-nav-styles';
      style.textContent = `
        #waw-modal-nav .waw-nav-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px 12px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 16px;
          font-weight: 600;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          transition: all 0.2s ease;
          min-width: 36px;
          height: 32px;
        }
        #waw-modal-nav .waw-nav-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        #waw-modal-nav .waw-nav-btn:active {
          transform: translateY(0);
        }
        #waw-modal-nav .waw-shortlist-btn {
          background: linear-gradient(135deg, #f39c12, #e67e22);
          font-size: 18px;
        }
        #waw-modal-nav .waw-shortlist-btn.is-shortlisted {
          background: linear-gradient(135deg, #27ae60, #2ecc71);
        }
      `;
      document.head.appendChild(style);
    }

    // Insert into modal header
    modalHeader.appendChild(navUI);

    // Event listeners
    document.getElementById('waw-nav-prev').addEventListener('click', () => navigateJob(-1));
    document.getElementById('waw-nav-next').addEventListener('click', () => navigateJob(1));
    document.getElementById('waw-nav-shortlist').addEventListener('click', () => {
      const jid = getCurrentModalJobId();
      if (jid) toggleShortlistJob(jid);
    });

    // Update shortlist button state
    updateModalShortlistIndicator();
  }

  function updateModalShortlistIndicator() {
    const btn = document.getElementById('waw-nav-shortlist');
    if (!btn) return;

    const jobId = getCurrentModalJobId();
    if (!jobId) return;

    const isShortlisted = shortlistedJobs.has(String(jobId));
    btn.textContent = isShortlisted ? '★' : '☆';
    btn.classList.toggle('is-shortlisted', isShortlisted);
  }

  function navigateJob(delta) {
    console.log('[WAW] === navigateJob START ===');
    console.log('[WAW] delta:', delta);
    console.log('[WAW] currentJobIndex (before):', currentJobIndex);
    
    // Refresh job links if needed
    if (jobLinks.length === 0) {
      getAllJobLinks();
    }
    console.log('[WAW] jobLinks.length:', jobLinks.length);

    // If still no job links, can't navigate
    if (jobLinks.length === 0) {
      showNotification('No jobs found on this page', 'info');
      return;
    }

    // Always detect current job from modal for accuracy
    // (User may have clicked a different job directly, so we can't rely on cached index)
    const modalJobId = getCurrentModalJobId();
    console.log('[WAW] modalJobId:', modalJobId);
    
    if (modalJobId) {
      let foundIndex = -1;
      for (let i = 0; i < jobLinks.length; i++) {
        const row = jobLinks[i].closest('tr');
        if (row && String(getJobIdFromRow(row)) === String(modalJobId)) {
          foundIndex = i;
          console.log('[WAW] Found matching job at index:', i);
          break;
        }
      }
      
      if (foundIndex >= 0) {
        currentJobIndex = foundIndex;
      } else if (currentJobIndex < 0) {
        // Fallback: couldn't find job and no previous index
        currentJobIndex = delta > 0 ? 0 : jobLinks.length - 1;
        console.log(`[WAW] Could not find job in list, starting at index ${currentJobIndex}`);
      }
      // If foundIndex is -1 but currentJobIndex >= 0, keep the existing index
    } else if (currentJobIndex < 0) {
      // No modal job ID and no previous index
      currentJobIndex = delta > 0 ? 0 : jobLinks.length - 1;
      console.log(`[WAW] No modal job ID, starting at index ${currentJobIndex}`);
    }
    
    console.log('[WAW] currentJobIndex (after detection):', currentJobIndex);

    // Calculate new index
    let newIndex = currentJobIndex + delta;
    console.log('[WAW] newIndex:', newIndex);
    console.log('[WAW] Check: newIndex >= jobLinks.length?', newIndex, '>=', jobLinks.length, '=', newIndex >= jobLinks.length);
    console.log('[WAW] Check: newIndex < 0?', newIndex, '< 0 =', newIndex < 0);

    // Handle wrapping / pagination
    if (newIndex < 0) {
      console.log('[WAW] ENTERING: Previous page block');
      // Try to go to previous page
      const prevPageBtn = document.querySelector('a[aria-label="Go to previous page"]');
      console.log('[WAW] prevPageBtn:', prevPageBtn);
      if (prevPageBtn) {
        // Close modal first, then wait for it to close before pagination
        closeModal();
        setTimeout(() => {
          waitForTableUpdateThenNavigate('last');
          safeClick(prevPageBtn);
        }, 200);
        return;
      }
      newIndex = 0;
      showNotification('First job (no previous page)', 'info');
    } else if (newIndex >= jobLinks.length) {
      console.log('[WAW] ENTERING: Next page block');
      // Try to go to next page
      const nextPageBtn = document.querySelector('a[aria-label="Go to next page"]');
      console.log('[WAW] nextPageBtn:', nextPageBtn);
      if (nextPageBtn) {
        // Close modal first, then wait for it to close before pagination
        closeModal();
        setTimeout(() => {
          waitForTableUpdateThenNavigate('first');
          safeClick(nextPageBtn);
        }, 200);
        return;
      }
      newIndex = jobLinks.length - 1;
      showNotification('Last job (no next page)', 'info');
    } else {
      console.log('[WAW] NORMAL: Staying on same page, going to index', newIndex);
    }

    currentJobIndex = newIndex;

    // Click the job link to open it
    if (jobLinks[currentJobIndex]) {
      const link = jobLinks[currentJobIndex];
      
      // Close current modal first
      closeModal();
      
      // Wait a bit then click the new job
      setTimeout(() => {
        safeClick(link);
        
        // Trigger job info rearranger after modal content loads
        setTimeout(() => {
          if (window.AzureJobInfoRearranger) {
            // Reset the enhanced flag so rearranger can process the new content
            const modal = document.querySelector('div[data-v-70e7ded6-s]');
            if (modal) {
              modal.dataset.azureEnhanced = 'false';
            }
            window.AzureJobInfoRearranger.enhance();
          }
        }, 300);
      }, 100);
    }
  }

  function syncCurrentIndexFromModal() {
    if (jobLinks.length === 0) {
      getAllJobLinks();
    }
    const modalJobId = getCurrentModalJobId();
    if (!modalJobId) return;
    for (let i = 0; i < jobLinks.length; i++) {
      const row = jobLinks[i].closest('tr');
      if (row && String(getJobIdFromRow(row)) === String(modalJobId)) {
        currentJobIndex = i;
        return;
      }
    }
  }

  function closeModal() {
    // Prevent infinite recursion
    if (isClosingModal) return;
    isClosingModal = true;
    
    // Find and click close button
    const closeBtn = document.querySelector('div[data-v-70e7ded6-s] button[aria-label="Close"], .modal__close, button.close');
    if (closeBtn) {
      closeBtn.click();
    }
    // Removed Escape key dispatch to prevent recursion with keyboard handler
    
    // Reset flag after a short delay
    setTimeout(() => { isClosingModal = false; }, 100);
  }

  // ============================================
  // Pagination Navigation (SPA-aware)
  // ============================================

  function waitForTableUpdateThenNavigate(position) {
    // Store current job IDs to detect when table content changes
    const currentJobIds = new Set(jobLinks.map(link => {
      const row = link.closest('tr');
      return row ? String(getJobIdFromRow(row)) : null;
    }).filter(Boolean));

    console.log(`[WAW] Watching for table update, will navigate to ${position} job. Current jobs: ${currentJobIds.size}`);

    let attempts = 0;
    const maxAttempts = 30; // 3 seconds at 100ms intervals

    const checkForUpdate = () => {
      attempts++;
      
      // Refresh job links
      getAllJobLinks();
      
      const newJobIds = new Set(jobLinks.map(link => {
        const row = link.closest('tr');
        return row ? String(getJobIdFromRow(row)) : null;
      }).filter(Boolean));

      // Check if job IDs have changed (new page loaded)
      const hasChanged = newJobIds.size > 0 && 
                         ![...newJobIds].every(id => currentJobIds.has(id));

      if (hasChanged) {
        console.log('[WAW] Table content changed, navigating to ' + position);
        
        // Wait for table to stabilize, then navigate
        setTimeout(() => {
          enhanceJobTable();
          
          if (position === 'first') {
            currentJobIndex = 0;
          } else {
            currentJobIndex = jobLinks.length - 1;
          }

          if (jobLinks[currentJobIndex]) {
            console.log(`[WAW] Clicking job at index ${currentJobIndex}`);
            safeClick(jobLinks[currentJobIndex]);
            
            // Trigger job info rearranger after modal loads
            setTimeout(() => {
              if (window.AzureJobInfoRearranger) {
                const modal = document.querySelector('div[data-v-70e7ded6-s]');
                if (modal) modal.dataset.azureEnhanced = 'false';
                window.AzureJobInfoRearranger.enhance();
              }
            }, 300);
          } else {
            console.log('[WAW] No job link found at index ' + currentJobIndex);
          }
        }, 300);
      } else if (attempts < maxAttempts) {
        // Keep polling
        setTimeout(checkForUpdate, 100);
      } else {
        console.log('[WAW] Pagination watch timed out after 3 seconds');
      }
    };

    // Start polling after a short delay
    setTimeout(checkForUpdate, 100);
  }

  // ============================================
  // Keyboard Navigation
  // ============================================

  function setupKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      // Don't intercept in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      // Modal navigation
      if (isModalOpen()) {
        switch (e.key) {
          case 'ArrowLeft':
          case 'a':
          case 'A':
            e.preventDefault();
            navigateJob(-1);
            break;
          case 'ArrowRight':
          case 'd':
          case 'D':
            e.preventDefault();
            navigateJob(1);
            break;
          case 'ArrowUp':
          case 'w':
          case 'W':
          case 's':
          case 'S':
            e.preventDefault();
            const jid = getCurrentModalJobId();
            if (jid) toggleShortlistJob(jid);
            break;
          case 'Escape':
            // Only handle real user events, not synthetic ones (prevents recursion)
            if (!e.isTrusted) return;
            e.preventDefault();
            closeModal();
            break;
        }
        return;
      }

      // Job list navigation
      if (jobLinks.length === 0) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          selectAndOpenJob(1);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          selectAndOpenJob(-1);
          break;
      }
    });
  }

  function selectAndOpenJob(delta) {
    if (jobLinks.length === 0) {
      getAllJobLinks();
      if (jobLinks.length === 0) return;
    }

    // Clear previous selection
    document.querySelectorAll('.waw-selected').forEach(el => el.classList.remove('waw-selected'));

    // Calculate new index
    if (currentJobIndex < 0) {
      currentJobIndex = delta > 0 ? 0 : jobLinks.length - 1;
    } else {
      currentJobIndex += delta;
    }

    // Clamp
    if (currentJobIndex < 0) currentJobIndex = 0;
    if (currentJobIndex >= jobLinks.length) currentJobIndex = jobLinks.length - 1;

    // Select and open
    const row = jobLinks[currentJobIndex].closest('tr');
    if (row) {
      row.classList.add('waw-selected');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      safeClick(jobLinks[currentJobIndex]);
    }
  }

  // ============================================
  // Notifications
  // ============================================

  function showNotification(message, type = 'info') {
    const existing = document.getElementById('waw-notification');
    if (existing) existing.remove();

    const colors = {
      add: 'linear-gradient(135deg, #27ae60, #2ecc71)',
      remove: 'linear-gradient(135deg, #e74c3c, #c0392b)',
      info: 'linear-gradient(135deg, #3498db, #2980b9)',
      error: 'linear-gradient(135deg, #e74c3c, #c0392b)'
    };

    const icons = {
      add: '★',
      remove: '☆',
      info: 'ℹ️',
      error: '❌'
    };

    const notification = document.createElement('div');
    notification.id = 'waw-notification';
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: ${colors[type] || colors.info};
      color: white;
      padding: 16px 28px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 1000002;
      box-shadow: 0 6px 30px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: wawFadeIn 0.3s ease;
    `;
    notification.innerHTML = `<span style="font-size: 20px;">${icons[type] || icons.info}</span> ${message}`;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 1500);
  }

  // ============================================
  // Observer Setup
  // ============================================

  function setupModalObserver() {
    if (modalObserver) return;

    modalObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const modal = node.matches && node.matches('div[data-v-70e7ded6-s]') ? node :
                         node.querySelector && node.querySelector('div[data-v-70e7ded6-s]');
            
            if (modal) {
              console.log('[WAW] Modal opened');
              setTimeout(() => {
                addModalNavigationUI();
                syncCurrentIndexFromModal();
              }, 300);
            }
          }
        }

        for (const node of mutation.removedNodes) {
          if (node.nodeType === 1 && node.matches && node.matches('div[data-v-70e7ded6-s]')) {
            console.log('[WAW] Modal closed');
            const navUI = document.getElementById('waw-modal-nav');
            if (navUI) navUI.remove();
          }
        }
      }
    });

    modalObserver.observe(document.body, { childList: true, subtree: true });
  }

  function setupTableObserver() {
    const tableContainer = document.querySelector('tbody[data-v-612a1958]') || 
                          document.querySelector('table tbody');
    
    if (!tableContainer) {
      setTimeout(setupTableObserver, 500);
      return;
    }

    const observer = new MutationObserver(() => {
      // Debounce
      clearTimeout(observer._timeout);
      observer._timeout = setTimeout(() => {
        console.log('[WAW] Table updated, refreshing...');
        enhanceJobTable();
      }, 200);
    });

    observer.observe(tableContainer, { childList: true, subtree: true });
  }

  function setupFolderObserver() {
    if (folderObserver) return;
    folderObserver = new MutationObserver(() => {
      const menus = getVisibleFolderMenus();
      if (menus.length === 0) return;
      let folders = [];
      menus.forEach((menu) => {
        folders = folders.concat(extractFolderNamesFromMenu(menu));
      });
      folders = uniqueList(folders);
      if (folders.length > 0) {
        saveFolderList(folders);
      }
    });
    folderObserver.observe(document.body, { childList: true, subtree: true });
  }

  function setupLinkSanitizer() {
    if (linkSanitizeObserver) return;
    const debounced = window.AzureCompatibility?.debounce
      ? window.AzureCompatibility.debounce(sanitizeAllJavascriptLinks, 200)
      : sanitizeAllJavascriptLinks;

    linkSanitizeObserver = new MutationObserver(() => {
      debounced();
    });

    linkSanitizeObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    sanitizeAllJavascriptLinks();
  }

  // ============================================
  // Styles
  // ============================================

  function injectStyles() {
    if (document.getElementById('waw-styles')) return;

    const style = document.createElement('style');
    style.id = 'waw-styles';
    style.textContent = `
      @keyframes wawFadeIn {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }

      .waw-selected {
        background-color: rgba(102, 126, 234, 0.15) !important;
        outline: 2px solid #667eea;
      }

      .waw-new-job {
        background-color: rgba(46, 204, 113, 0.1) !important;
      }

      .waw-new-job td:first-child::before {
        content: 'NEW';
        display: inline-block;
        background: #27ae60;
        color: white;
        font-size: 10px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 3px;
        margin-right: 8px;
      }

      .waw-shortlisted-row {
        background-color: rgba(243, 156, 18, 0.1) !important;
      }

      /* Make table cells relative for indicators */
      tbody tr td {
        position: relative;
      }
    `;

    document.head.appendChild(style);
  }

  // ============================================
  // Initialize
  // ============================================

  async function initialize() {
    console.log('[WAW] Initializing Navigator...');

    await loadSettings();
    injectStyles();
    setupModalObserver();
    setupKeyboardNav();
    setupFolderObserver();
    setupLinkSanitizer();

    document.addEventListener('click', (event) => {
      const anchor = event.target?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (href.trim().toLowerCase().startsWith('javascript:')) {
        event.preventDefault();
      }
    }, true);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.shortlistFolderName) {
        settings = settings || {};
        settings.shortlistFolderName = changes.shortlistFolderName.newValue;
      }
      if (changes.shortlistFolderReselect) {
        chrome.storage.sync.get({ shortlistFolderName: DEFAULT_SETTINGS.shortlistFolderName })
          .then((result) => {
            settings = settings || {};
            settings.shortlistFolderName = result.shortlistFolderName || DEFAULT_SETTINGS.shortlistFolderName;
          })
          .catch(() => {});
      }
    });

    // Setup table features after delay
    setTimeout(() => {
      enhanceJobTable();
      setupTableObserver();
    }, 1500);

    console.log('[WAW] Navigator ready!');
  }

  // Start
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initialize();
  } else {
    document.addEventListener('DOMContentLoaded', initialize);
  }

  // Export
  window.WAWNavigator = {
    navigateJob,
    toggleShortlistJob,
    getCurrentModalJobId,
    isModalOpen,
    shortlistedJobs,
    notify: showNotification
  };
  window.WAWFolderManager = FolderManager;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request?.action) return;

    if (request.action === 'getShortlistFolders') {
      FolderManager.getFolders({ forceOpen: !!request.forceOpen })
        .then((folders) => {
          sendResponse({
            folders,
            selectedFolder: settings?.shortlistFolderName || DEFAULT_SETTINGS.shortlistFolderName,
            message: folders.length > 0 ? 'Folders found' : 'No folders found'
          });
        })
        .catch((error) => {
          sendResponse({ error: error?.message || 'Failed to fetch folders' });
        });
      return true;
    }

    if (request.action === 'selectShortlistFolder') {
      const name = normalizeText(request.name);
      if (name) {
        settings = settings || {};
        settings.shortlistFolderName = name;
        window.AzureStorage?.saveSettings({ shortlistFolderName: name });
      }
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'createShortlistFolder') {
      const name = normalizeText(request.name);
      FolderManager.createFolder(name)
        .then(async (result) => {
          if (result?.success && name) {
            settings = settings || {};
            settings.shortlistFolderName = name;
            await window.AzureStorage?.saveSettings({ shortlistFolderName: name });
          }
          sendResponse({
            success: !!result?.success,
            folders: result?.folders,
            selectedFolder: name,
            message: result?.message
          });
        })
        .catch((error) => {
          sendResponse({ success: false, message: error?.message || 'Folder create failed' });
        });
      return true;
    }
  });

})();
