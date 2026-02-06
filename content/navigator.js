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
  let isDefaultFolderPromptVisible = false;

  const DEFAULT_SETTINGS = {
    newJobDaysThreshold: 7,
    shortlistFolderName: ''
  };

  const BOARD_CONTEXT = (() => {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('/co-op/direct/')) return 'direct';
    if (path.includes('/co-op/full/')) return 'full';
    return 'shared';
  })();

  const SHORTLIST_STORAGE_KEYS = {
    folderName: BOARD_CONTEXT === 'direct'
      ? 'shortlistFolderNameDirect'
      : BOARD_CONTEXT === 'full'
        ? 'shortlistFolderNameFull'
        : 'shortlistFolderName',
    folders: BOARD_CONTEXT === 'direct'
      ? 'shortlistFoldersDirect'
      : BOARD_CONTEXT === 'full'
        ? 'shortlistFoldersFull'
        : 'shortlistFolders',
    selectionRequired: BOARD_CONTEXT === 'direct'
      ? 'shortlistFolderSelectionRequiredDirect'
      : BOARD_CONTEXT === 'full'
        ? 'shortlistFolderSelectionRequiredFull'
        : 'shortlistFolderSelectionRequired',
    reselect: BOARD_CONTEXT === 'direct'
      ? 'shortlistFolderReselectDirect'
      : BOARD_CONTEXT === 'full'
        ? 'shortlistFolderReselectFull'
        : 'shortlistFolderReselect'
  };

  const IS_APPLICATIONS_PAGE = /\/applications\.htm/i.test(window.location.pathname || '');
  const IS_JOBS_PAGE = /\/jobs\.htm/i.test(window.location.pathname || '');

  const FOLDER_MENU_SELECTORS = [
    '[role="menu"]',
    '[role="listbox"]',
    '.dropdown-menu',
    '.menu',
    '.v-menu__content',
    '.mat-menu-panel',
    '.mat-select-panel',
    '.MuiMenu-paper',
    '.menuable__content__active',
    '.sidebar--action.is--visible',
    '.sidebar--action.is--visible.right',
    '.sidebar--action.sidebar--updated.is--visible.right'
  ];

  const FOLDER_SIDEBAR_SELECTORS = [
    '.sidebar--action.sidebar--updated.is--visible.right',
    '.sidebar--action.is--visible.right',
    '.sidebar--action.is--visible'
  ];

  const FOLDER_STEALTH_ATTR = 'data-waw-folder-stealth';
  const FOLDER_STEALTH_STYLE_ID = 'waw-folder-stealth-style';

  const FOLDER_ICON_NAMES = ['create_new_folder', 'folder', 'folder_open', 'folder_special'];

  const SYSTEM_FOLDER_NAMES = new Set([
    'save',
    'saved',
    'my applications',
    'my program',
    'remove from search',
    'removed from search',
    'select all',
    'select row'
  ]);

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
    const lower = cleanFolderName(text).toLowerCase();
    return lower === 'create new folder' ||
           lower === 'new folder' ||
           lower === 'create folder' ||
           lower === 'add folder' ||
           lower === 'create a folder';
  }

  function cleanFolderName(text) {
    let value = normalizeText(text);
    if (!value) return '';
    value = value
      .replace(/toggle_?on\s*toggle_?off/gi, ' ')
      .replace(/toggle_?on|toggle_?off/gi, ' ')
      .replace(/^[/\\>\-]+\s*/, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return value;
  }

  function getTextWithoutIcons(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('i, svg, [class*="icon"], [aria-hidden="true"]').forEach((iconEl) => iconEl.remove());
    return cleanFolderName(clone.textContent || '');
  }

  function isExcludedFolderName(text) {
    const lower = cleanFolderName(text).toLowerCase();
    return !lower || isCreateFolderItem(lower) || SYSTEM_FOLDER_NAMES.has(lower);
  }

  function isLikelyFolderSidebar(sidebar) {
    if (!sidebar || !isElementVisible(sidebar)) return false;
    const text = normalizeText(sidebar.textContent).toLowerCase();
    if (!text.includes('my jobs folder')) return false;
    return !!sidebar.querySelector('input[type="checkbox"]');
  }

  function getVisibleFolderSidebars() {
    const sidebars = new Set();
    FOLDER_SIDEBAR_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (isLikelyFolderSidebar(el)) {
          sidebars.add(el);
        }
      });
    });
    return Array.from(sidebars);
  }

  function getAllVisibleFolderUiContainers() {
    const all = new Set();
    getVisibleFolderMenus().forEach((el) => all.add(el));
    getVisibleFolderPopups().forEach((el) => all.add(el));
    getVisibleFolderSidebars().forEach((el) => all.add(el));
    return Array.from(all);
  }

  function ensureFolderStealthStyle() {
    if (document.getElementById(FOLDER_STEALTH_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FOLDER_STEALTH_STYLE_ID;
    style.textContent = `
      html[${FOLDER_STEALTH_ATTR}="true"] .sidebar--action.is--visible,
      html[${FOLDER_STEALTH_ATTR}="true"] .sidebar--action.is--visible.right,
      html[${FOLDER_STEALTH_ATTR}="true"] .sidebar--action.sidebar--updated.is--visible.right,
      html[${FOLDER_STEALTH_ATTR}="true"] .menuable__content__active,
      html[${FOLDER_STEALTH_ATTR}="true"] .v-menu__content,
      html[${FOLDER_STEALTH_ATTR}="true"] .dropdown-menu,
      html[${FOLDER_STEALTH_ATTR}="true"] .menu {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translate3d(-9999px, -9999px, 0) !important;
        transition: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setFolderStealthMode(enabled) {
    ensureFolderStealthStyle();
    if (enabled) {
      document.documentElement.setAttribute(FOLDER_STEALTH_ATTR, 'true');
    } else {
      document.documentElement.removeAttribute(FOLDER_STEALTH_ATTR);
    }
  }

  function findSidebarActionButton(sidebar, mode = 'close') {
    if (!sidebar) return null;
    const buttons = Array.from(sidebar.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
    if (mode === 'save') {
      return buttons.find((btn) => {
        if (!isElementVisible(btn)) return false;
        const text = normalizeText(btn.textContent || btn.value || '').toLowerCase();
        return text === 'save';
      }) || null;
    }

    return buttons.find((btn) => {
      if (!isElementVisible(btn)) return false;
      const text = normalizeText(btn.textContent || btn.value || '').toLowerCase();
      if (text === 'close' || text === 'cancel' || text === 'done') return true;
      if (String(btn.className || '').toLowerCase().includes('modal__btn--close')) return true;
      const iconText = normalizeText(btn.querySelector?.('i.material-icons')?.textContent || '').toLowerCase();
      return iconText === 'close';
    }) || null;
  }

  function isFolderItemToggleable(item) {
    if (!item) return false;
    if (item.querySelector('input[type="checkbox"], [role="switch"], [aria-checked]')) {
      return true;
    }
    const raw = normalizeText(item.textContent).toLowerCase();
    if (/toggle_?on|toggle_?off/.test(raw)) return true;
    const className = String(item.className || '').toLowerCase();
    return className.includes('checkbox') || className.includes('toggle') || className.includes('switch');
  }

  function getFolderItemName(item) {
    if (!item) return '';
    const text = getTextWithoutIcons(item) || cleanFolderName(item.textContent || '');
    return cleanFolderName(text);
  }

  function getFolderItemState(item) {
    if (!item) return null;

    if (item.matches?.('input[type="checkbox"]')) {
      return !!item.checked;
    }

    const nestedCheckbox = item.querySelector?.('input[type="checkbox"]');
    if (nestedCheckbox) return !!nestedCheckbox.checked;

    const relatedCheckbox = item.id
      ? document.querySelector(`input[type="checkbox"][id="${item.id}"]`)
      : item.closest('label')?.querySelector('input[type="checkbox"]');
    if (relatedCheckbox) return !!relatedCheckbox.checked;

    const ariaChecked = item.getAttribute?.('aria-checked') ?? item.closest('[aria-checked]')?.getAttribute?.('aria-checked');
    if (ariaChecked === 'true') return true;
    if (ariaChecked === 'false') return false;

    const className = String(item.className || '').toLowerCase();
    if (/(^|\b)(selected|active|checked|is-checked|v-list-item--active|mat-selected|mui-selected)(\b|$)/.test(className)) {
      return true;
    }

    const raw = normalizeText(item.textContent).toLowerCase();
    if (raw.includes('toggle_on')) return true;
    if (raw.includes('toggle_off')) return false;
    return null;
  }

  async function closeFolderMenus({ preferSave = false } = {}) {
    const hasFolderUI = () => getAllVisibleFolderUiContainers().length > 0;
    if (!hasFolderUI()) return;

    for (let attempt = 0; attempt < 4 && hasFolderUI(); attempt++) {
      const sidebars = getVisibleFolderSidebars();
      for (const sidebar of sidebars) {
        if (preferSave) {
          const saveButton = findSidebarActionButton(sidebar, 'save');
          if (saveButton) {
            safeClick(saveButton);
            await sleep(140);
          }
        }
        const closeButton = findSidebarActionButton(sidebar, 'close');
        if (closeButton) {
          safeClick(closeButton);
          await sleep(140);
        }
      }

      if (!hasFolderUI()) break;

      const trigger = findFolderMenuTrigger(document.querySelector('div[data-v-70e7ded6-s]') || document);
      if (trigger) {
        safeClick(trigger);
        await sleep(120);
        if (!hasFolderUI()) break;
      }

      const popups = getVisibleFolderPopups();
      for (const popup of popups) {
        const closeButton = Array.from(
          popup.querySelectorAll('button[aria-label="Close"], button[aria-label*="close" i], .modal__close, .modal__btn--close, button.close, [data-dismiss="modal"], button, a, [role="button"]')
        ).find((btn) => {
          if (!isElementVisible(btn)) return false;
          const label = normalizeText(btn.textContent || btn.getAttribute('aria-label') || btn.value).toLowerCase();
          if (label === 'close' || label === 'cancel' || label === 'done' || label === 'save') return true;
          if (String(btn.className || '').toLowerCase().includes('modal__btn--close')) return true;
          const iconText = normalizeText(btn.querySelector?.('i.material-icons')?.textContent || '').toLowerCase();
          return iconText === 'close' || iconText === 'done' || iconText === 'check';
        });
        if (closeButton) {
          safeClick(closeButton);
          await sleep(120);
          if (!hasFolderUI()) break;
        }
      }

      if (!hasFolderUI()) break;

      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }));
      document.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }));
      await sleep(100);

      const backdrop = document.querySelector('.v-overlay__scrim, .modal-backdrop, .overlay, .v-overlay');
      if (backdrop && isElementVisible(backdrop)) {
        safeClick(backdrop);
        await sleep(100);
      }

      const target = document.activeElement || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
      await sleep(120);
    }

    if (hasFolderUI()) {
      const forced = getAllVisibleFolderUiContainers();
      forced.forEach((el) => {
        el.dataset.wawForceHiddenFolderUi = 'true';
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      });
    }

    if (!hasFolderUI()) {
      restoreStealthFolderUI();
      setFolderStealthMode(false);
    }
  }

  async function setFolderSelectionRequired(required) {
    try {
      await chrome.storage.sync.set({ [SHORTLIST_STORAGE_KEYS.selectionRequired]: !!required });
    } catch (_) {
      // no-op
    }
  }

  async function ensureModalOpenForJob(jobId = null, timeout = 2200) {
    if (isModalOpen()) {
      if (!jobId) return true;
      const modalJobId = getCurrentModalJobId();
      if (!modalJobId || String(modalJobId) === String(jobId)) return true;
      closeModal();
      await sleep(140);
    }

    getAllJobLinks();
    if (jobLinks.length === 0) return false;

    let targetLink = null;
    if (jobId) {
      targetLink = jobLinks.find((link) => {
        const row = link.closest('tr');
        return row && String(getJobIdFromRow(row)) === String(jobId);
      }) || null;
    }
    if (!targetLink) {
      targetLink = jobLinks[0];
    }

    if (!targetLink) return false;
    safeClick(targetLink);
    return waitForModalOpen(timeout);
  }

  function collectVisibleFolderNames() {
    let extracted = [];
    const menus = getVisibleFolderMenus();
    menus.forEach((menu) => {
      extracted = extracted.concat(extractFolderNamesFromMenu(menu));
    });
    return uniqueList(extracted);
  }

  function uniqueList(list) {
    const seen = new Set();
    const result = [];
    list.forEach((item) => {
      const value = normalizeText(item);
      if (!value) return;
      const key = cleanFolderName(value).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(cleanFolderName(value));
    });
    return result;
  }

  function safeClick(element) {
    if (!element) return false;
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    if (tag === 'a') {
      const href = (element.getAttribute('href') || '').trim().toLowerCase();
      if (href.startsWith('javascript:')) {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      }
    }
    element.click();
    return true;
  }

  function sanitizeJavascriptLink(link) {
    return link;
  }

  function sanitizeAllJavascriptLinks() {
    document.querySelectorAll('a[href^="javascript:" i]').forEach((link) => {
      sanitizeJavascriptLink(link);
    });
  }

  async function getStoredFolders() {
    try {
      if (window.AzureStorage?.getSettings) {
        const loaded = await window.AzureStorage.getSettings([SHORTLIST_STORAGE_KEYS.folders]);
        return uniqueList(Array.isArray(loaded[SHORTLIST_STORAGE_KEYS.folders]) ? loaded[SHORTLIST_STORAGE_KEYS.folders] : [])
          .filter((name) => !isExcludedFolderName(name));
      }
    } catch (e) {
      // fall through to chrome.storage
    }

    try {
      const result = await chrome.storage.sync.get({ [SHORTLIST_STORAGE_KEYS.folders]: [] });
      return uniqueList(Array.isArray(result[SHORTLIST_STORAGE_KEYS.folders]) ? result[SHORTLIST_STORAGE_KEYS.folders] : [])
        .filter((name) => !isExcludedFolderName(name));
    } catch (e) {
      return [];
    }
  }

  function folderListContains(list, name) {
    const target = cleanFolderName(name).toLowerCase();
    if (!target) return false;
    return (list || []).some((item) => cleanFolderName(item).toLowerCase() === target);
  }

  async function saveFolderList(list) {
    const folders = uniqueList(list).filter((name) => !isExcludedFolderName(name));
    if (window.AzureStorage?.saveSettings) {
      await window.AzureStorage.saveSettings({ [SHORTLIST_STORAGE_KEYS.folders]: folders });
      return;
    }
    await chrome.storage.sync.set({ [SHORTLIST_STORAGE_KEYS.folders]: folders });
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

  function isLikelyFolderPopup(container) {
    if (!container || container.matches?.('div[data-v-70e7ded6-s]')) return false;
    if (!isElementVisible(container)) return false;

    const text = normalizeText(container.textContent).toLowerCase();
    if (!text) return false;

    if (/my jobs folder|create new folder|create a new folder|select all|select row|remove from search|toggle_?on|toggle_?off/.test(text)) {
      return true;
    }

    const hasToggles = !!container.querySelector('input[type="checkbox"], [role="switch"], [aria-checked]');
    const hasFolderAction = !!container.querySelector('button[aria-label*="folder" i], a[aria-label*="folder" i], i.material-icons');
    const hasSaveLike = Array.from(container.querySelectorAll('button, input[type="button"], input[type="submit"], a'))
      .some((btn) => {
        const label = normalizeText(btn.textContent || btn.value).toLowerCase();
        return label === 'save' || label === 'close' || label === 'cancel' || label === 'done';
      });

    return hasToggles && (hasSaveLike || hasFolderAction);
  }

  function restoreForceHiddenFolderUI() {
    document.querySelectorAll('[data-waw-force-hidden-folder-ui="true"]').forEach((el) => {
      el.style.removeProperty('display');
      el.style.removeProperty('visibility');
      el.style.removeProperty('opacity');
      el.style.removeProperty('pointer-events');
      el.style.removeProperty('transform');
      el.style.removeProperty('transition');
      delete el.dataset.wawForceHiddenFolderUi;
    });
  }

  function hideFolderUiForAutomation() {
    setFolderStealthMode(true);
    const targets = getAllVisibleFolderUiContainers();
    targets.forEach((el) => {
      if (el.dataset.wawStealthFolderUi === 'true') return;
      el.dataset.wawStealthFolderUi = 'true';
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('transform', 'translate3d(-9999px, -9999px, 0)', 'important');
      el.style.setProperty('transition', 'none', 'important');
    });
  }

  function restoreStealthFolderUI() {
    document.querySelectorAll('[data-waw-stealth-folder-ui="true"]').forEach((el) => {
      el.style.removeProperty('opacity');
      el.style.removeProperty('pointer-events');
      el.style.removeProperty('transform');
      el.style.removeProperty('transition');
      delete el.dataset.wawStealthFolderUi;
    });
    if (getAllVisibleFolderUiContainers().length === 0) {
      setFolderStealthMode(false);
    }
  }

  function getVisibleFolderPopups() {
    const popups = new Set();
    const popupSelectors = [
      '[role="dialog"]',
      '.modal',
      '.modal__content',
      '.v-dialog',
      '.v-overlay__content',
      '.v-menu__content',
      '.menuable__content__active',
      '.dropdown-menu',
      '.menu',
      '.sidebar--action.is--visible',
      '.sidebar--action.is--visible.right',
      '.sidebar--action.sidebar--updated.is--visible.right'
    ];

    popupSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (isLikelyFolderPopup(el)) {
          popups.add(el);
        }
      });
    });

    return Array.from(popups);
  }

  function extractFolderNamesFromMenu(menu) {
    const items = Array.from(menu.querySelectorAll('li, [role="menuitem"], [role="option"], button, a, label'));
    const hasToggleRows = items.some((item) => isFolderItemToggleable(item));
    const names = [];
    items.forEach((item) => {
      const raw = normalizeText(item.textContent);
      const text = getFolderItemName(item);
      if (!text || text.length > 60) return;
      if (hasToggleRows && !isFolderItemToggleable(item)) return;
      if (isExcludedFolderName(text)) return;
      if (!raw && !text) return;
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
      let text = cleanFolderName(getTextWithoutIcons(label || parent) || label?.textContent || parent?.textContent || '');
      if (!text || text.length > 60) return;
      if (isExcludedFolderName(text)) return;
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
      .filter((item) => {
        const name = getFolderItemName(item);
        return !!name && !isExcludedFolderName(name);
      });
  }

  function findFolderMenuItemByName(name) {
    const target = normalizeText(name).toLowerCase();
    if (!target) return null;
    const menus = getVisibleFolderMenus();
    for (const menu of menus) {
      const items = findFolderMenuItems(menu);
      for (const item of items) {
        const text = getFolderItemName(item).toLowerCase();
        if (text === target) return item;
      }
    }
    // Fallback: search visible elements by exact text and find a clickable ancestor
    const candidates = Array.from(document.querySelectorAll('label, button, a, li, div, span'));
    for (const candidate of candidates) {
      if (!isElementVisible(candidate)) continue;
      const text = getFolderItemName(candidate).toLowerCase();
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
      const items = Array.from(menu.querySelectorAll('li, button, a, [role="menuitem"], [role="option"], label, div, span'));
      for (const item of items) {
        const name = getFolderItemName(item);
        if (isCreateFolderItem(name)) return item;
      }
    }
    const candidates = Array.from(document.querySelectorAll('label, button, a, li, div, span'));
    for (const candidate of candidates) {
      if (!isElementVisible(candidate)) continue;
      if (isCreateFolderItem(getFolderItemName(candidate))) {
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

  async function openFolderMenuForJob(jobId = null, { silent = false } = {}) {
    restoreForceHiddenFolderUI();
    restoreStealthFolderUI();
    if (silent) {
      setFolderStealthMode(true);
    } else {
      setFolderStealthMode(false);
    }

    if (getAllVisibleFolderUiContainers().length > 0) {
      if (silent) {
        hideFolderUiForAutomation();
      }
      return true;
    }

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
      if (silent) {
        hideFolderUiForAutomation();
      }
      return true;
    }
    if (silent) {
      setFolderStealthMode(false);
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
    async getFolders({ forceOpen = false, allowAutoOpenModal = false, jobId = null } = {}) {
      let folders = await getStoredFolders();

      if (!isModalOpen()) {
        if (!allowAutoOpenModal) {
          return folders;
        }
        const opened = await ensureModalOpenForJob(jobId);
        if (!opened) {
          return folders;
        }
      }

      let scrapedFolders = collectVisibleFolderNames();

      if (forceOpen) {
        const openedMenu = await openFolderMenuForJob(jobId, { silent: true });
        if (openedMenu) {
          for (let i = 0; i < 6; i++) {
            await sleep(120);
            scrapedFolders = scrapedFolders.concat(collectVisibleFolderNames());
          }
        }
      }

      if (scrapedFolders.length === 0) {
        const containers = findFolderContainers();
        containers.forEach((container) => {
          scrapedFolders = scrapedFolders.concat(extractFolderNamesFromCheckboxes(container));
        });

        if (scrapedFolders.length === 0) {
          const labels = Array.from(document.querySelectorAll('label'))
            .filter((label) => isElementVisible(label))
            .filter((label) => {
              const text = cleanFolderName(getTextWithoutIcons(label) || label.textContent);
              if (!text || text.length > 60 || isExcludedFolderName(text)) return false;
              const direct = label.querySelector('input[type="checkbox"]');
              const byFor = label.htmlFor ? document.getElementById(label.htmlFor) : null;
              return !!direct || (byFor && byFor.type === 'checkbox');
            });
          if (labels.length > 0) {
            scrapedFolders = labels.map((label) => cleanFolderName(getTextWithoutIcons(label) || label.textContent));
          }
        }
      }

      await closeFolderMenus();

      folders = uniqueList((folders || []).concat(scrapedFolders || []));
      if (folders.length > 0) {
        await saveFolderList(folders);
      }
      return folders;
    },

    async setFolderState(name, { jobId = null, desiredState = null } = {}) {
      const target = cleanFolderName(name);
      if (!target) return { success: false, message: 'Missing folder name' };

      const opened = await openFolderMenuForJob(jobId, { silent: true });
      if (!opened) return { success: false, message: 'Folder menu not available' };

      await sleep(150);

      let item = findFolderMenuItemByName(target);
      if (!item) {
        await sleep(150);
        await openFolderMenuForJob(jobId, { silent: true });
        await sleep(150);
        item = findFolderMenuItemByName(target);
      }

      if (!item) {
        await closeFolderMenus({ preferSave: false });
        return { success: false, message: 'Folder not found' };
      }

      const currentState = getFolderItemState(item);
      if (desiredState === true && currentState === true) {
        await closeFolderMenus({ preferSave: false });
        return { success: true, changed: false };
      }
      if (desiredState === false && currentState === false) {
        await closeFolderMenus({ preferSave: false });
        return { success: true, changed: false };
      }

      const checkbox = item.matches?.('input[type="checkbox"]')
        ? item
        : item.querySelector?.('input[type="checkbox"]');
      const clickTarget = checkbox?.closest('label') || item.closest?.('label') || item;

      if (desiredState === null) {
        safeClick(clickTarget);
      } else {
        let state = getFolderItemState(item);
        for (let i = 0; i < 2 && state !== desiredState; i++) {
          safeClick(clickTarget);
          await sleep(120);
          state = getFolderItemState(item);
        }

        if (state !== desiredState) {
          await closeFolderMenus({ preferSave: false });
          return { success: false, message: 'Could not update folder state' };
        }
      }

      await sleep(140);
      await closeFolderMenus({ preferSave: true });
      return { success: true, changed: true };
    },

    async selectFolder(name, jobId = null) {
      return this.setFolderState(name, { jobId, desiredState: null });
    },

    async createFolder(name) {
      const target = cleanFolderName(name);
      if (!target) return { success: false, message: 'Missing folder name' };

      if (!isModalOpen()) {
        return { success: false, message: 'Open a posting before creating a folder' };
      }

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

      await closeFolderMenus();

      const existing = await this.getFolders({ forceOpen: true, allowAutoOpenModal: true });
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
          SHORTLIST_STORAGE_KEYS.folderName
        ]);
        settings = {
          newJobDaysThreshold: loaded.newJobDaysThreshold || DEFAULT_SETTINGS.newJobDaysThreshold,
          shortlistFolderName: cleanFolderName(loaded[SHORTLIST_STORAGE_KEYS.folderName] || DEFAULT_SETTINGS.shortlistFolderName)
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

  async function persistShortlistFolderName(name) {
    const value = cleanFolderName(name);
    settings = settings || {};
    settings.shortlistFolderName = value;
    if (window.AzureStorage?.saveSettings) {
      await window.AzureStorage.saveSettings({ [SHORTLIST_STORAGE_KEYS.folderName]: value });
      return;
    }
    await chrome.storage.sync.set({ [SHORTLIST_STORAGE_KEYS.folderName]: value });
  }

  function removeDefaultFolderPrompt() {
    const docs = [document];
    try {
      if (window.top?.document && window.top.document !== document) {
        docs.push(window.top.document);
      }
    } catch (_) {
      // no-op
    }

    docs.forEach((doc) => {
      const existing = doc.getElementById('waw-folder-prompt-overlay');
      if (existing) {
        existing.remove();
      }
    });
    isDefaultFolderPromptVisible = false;
  }

  function populateDefaultFolderPromptDropdown(selectEl, folders, selectedFolder) {
    if (!selectEl) return;
    const doc = selectEl.ownerDocument || document;
    selectEl.innerHTML = '';
    const normalizedFolders = uniqueList(folders || []);
    if (normalizedFolders.length === 0) {
      const empty = doc.createElement('option');
      empty.value = '';
      empty.textContent = '-- No folders found --';
      empty.disabled = true;
      empty.selected = true;
      selectEl.appendChild(empty);
      return;
    }

    normalizedFolders.forEach((folder) => {
      const option = doc.createElement('option');
      option.value = folder;
      option.textContent = folder;
      selectEl.appendChild(option);
    });

    if (selectedFolder) {
      const match = normalizedFolders.find((folder) => folder.toLowerCase() === selectedFolder.toLowerCase());
      if (match) {
        selectEl.value = match;
        return;
      }
    }
    selectEl.selectedIndex = 0;
  }

  async function showDefaultFolderPrompt({ folders = [], reason = '', autoRefresh = false, jobId = null } = {}) {
    if (IS_APPLICATIONS_PAGE) return;
    if (!isModalOpen()) return;

    removeDefaultFolderPrompt();
    isDefaultFolderPromptVisible = true;

    const promptDocument = (() => {
      try {
        if (window.top?.document) return window.top.document;
      } catch (_) {
        // no-op
      }
      return document;
    })();

    const overlay = promptDocument.createElement('div');
    overlay.id = 'waw-folder-prompt-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647 !important;
      isolation: isolate;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    `;

    const panel = promptDocument.createElement('div');
    panel.style.cssText = `
      width: min(460px, 100%);
      background: #fff;
      color: #1f2937;
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.3);
      padding: 18px;
      position: relative;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    panel.innerHTML = `
      <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Choose Default Shortlist Folder</div>
      <div id="waw-folder-prompt-text" style="font-size:13px;color:#475569;margin-bottom:10px;">
        ${reason || 'Select the folder to use when you shortlist with the up arrow key.'}
      </div>
      <select id="waw-folder-prompt-select" style="width:100%;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;"></select>
      <div id="waw-folder-prompt-status" style="min-height:18px;font-size:12px;color:#64748b;margin-top:8px;"></div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
        <button id="waw-folder-prompt-refresh" style="padding:8px 10px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;cursor:pointer;">Refresh Folders</button>
        <button id="waw-folder-prompt-save" style="padding:8px 12px;border:none;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">Save Default Folder</button>
      </div>
    `;

    overlay.appendChild(panel);
    (promptDocument.body || promptDocument.documentElement).appendChild(overlay);

    const selectEl = panel.querySelector('#waw-folder-prompt-select');
    const statusEl = panel.querySelector('#waw-folder-prompt-status');
    const refreshBtn = panel.querySelector('#waw-folder-prompt-refresh');
    const saveBtn = panel.querySelector('#waw-folder-prompt-save');

    const updateStatus = (text, isError = false) => {
      if (!statusEl) return;
      statusEl.textContent = text || '';
      statusEl.style.color = isError ? '#dc2626' : '#64748b';
    };

    const selectedSetting = cleanFolderName(settings?.shortlistFolderName || '');
    populateDefaultFolderPromptDropdown(selectEl, folders, selectedSetting);

    const refreshFolders = async () => {
      refreshBtn.disabled = true;
      updateStatus('Refreshing folders...');
      try {
        const refreshed = await FolderManager.getFolders({
          forceOpen: true,
          allowAutoOpenModal: true,
          jobId: jobId || getCurrentModalJobId()
        });
        populateDefaultFolderPromptDropdown(selectEl, refreshed, selectedSetting);
        updateStatus(refreshed.length > 0 ? `Found ${refreshed.length} folder${refreshed.length === 1 ? '' : 's'}` : 'No folders found');
      } catch (error) {
        updateStatus(error?.message || 'Failed to refresh folders', true);
      } finally {
        refreshBtn.disabled = false;
      }
    };

    refreshBtn.addEventListener('click', refreshFolders);

    saveBtn.addEventListener('click', async () => {
      const selected = cleanFolderName(selectEl?.value || '');
      if (!selected) {
        updateStatus('Select a folder first', true);
        return;
      }

      try {
        await persistShortlistFolderName(selected);
        await setFolderSelectionRequired(false);
        removeDefaultFolderPrompt();
        showNotification(`Default folder set to "${selected}"`, 'add');
      } catch (error) {
        updateStatus(error?.message || 'Failed to save folder', true);
      }
    });

    if (autoRefresh || folders.length === 0) {
      await refreshFolders();
    }
  }

  async function ensureDefaultShortlistFolderSelected({ reason = '', forcePrompt = false, jobId = null } = {}) {
    if (IS_APPLICATIONS_PAGE) {
      return !!cleanFolderName(settings?.shortlistFolderName || '');
    }
    if (!isModalOpen()) return false;

    const selectedFolder = cleanFolderName(settings?.shortlistFolderName || '');
    let folders = await getStoredFolders();
    let isValid = !!selectedFolder && (folders.length === 0 || folderListContains(folders, selectedFolder));

    if (isValid && !forcePrompt) {
      await setFolderSelectionRequired(false);
      removeDefaultFolderPrompt();
      return true;
    }

    if (forcePrompt || folders.length === 0) {
      folders = await FolderManager.getFolders({ forceOpen: true, allowAutoOpenModal: true, jobId: jobId || getCurrentModalJobId() });
      isValid = !!selectedFolder && folderListContains(folders, selectedFolder);
      if (isValid && !forcePrompt) {
        await setFolderSelectionRequired(false);
        removeDefaultFolderPrompt();
        return true;
      }
    }

    await setFolderSelectionRequired(true);
    await showDefaultFolderPrompt({
      folders,
      reason: reason || (selectedFolder ? 'Your default folder is unavailable. Choose a new one.' : 'Choose a default shortlist folder to start shortlisting.'),
      autoRefresh: folders.length === 0 || forcePrompt,
      jobId: jobId || getCurrentModalJobId()
    });
    return false;
  }

  // ============================================
  // Job Table Functions
  // ============================================

  function getAllJobLinks() {
    const rows = Array.from(document.querySelectorAll('tbody tr, tr.table__row--body'));
    const rowLinkSelectors = [
      'a.overflow--ellipsis',
      'td:nth-child(2) a',
      'a[href="javascript:void(0)"]',
      'a[onclick]'
    ];

    const isLikelyJobLink = (link) => {
      if (!link) return false;
      const text = normalizeText(link.textContent);
      if (!text || text.length > 220) return false;
      if (link.querySelector('i.material-icons')) return false;
      return true;
    };

    const links = [];
    rows.forEach((row) => {
      const rowText = normalizeText(row.textContent).toLowerCase();
      if (rowText.includes('cancelled') || rowText.includes('canceled')) return;

      let selected = null;
      for (const selector of rowLinkSelectors) {
        const candidate = row.querySelector(selector);
        if (isLikelyJobLink(candidate)) {
          selected = candidate;
          break;
        }
      }
      if (!selected) {
        const candidates = Array.from(row.querySelectorAll('a'));
        selected = candidates.find(isLikelyJobLink) || null;
      }
      if (selected) links.push(selected);
    });

    if (links.length === 0) {
      document.querySelectorAll('tbody a').forEach((link) => {
        if (isLikelyJobLink(link)) links.push(link);
      });
    }

    jobLinks = Array.from(new Set(links));
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

  function updateShortlistIndicators(jobId, isShortlisted) {
    ensureShortlistIndicator(jobId);
    document.querySelectorAll(`.waw-shortlist-indicator[data-job-id="${jobId}"]`).forEach((el) => {
      el.innerHTML = isShortlisted ? '★' : '☆';
      el.title = isShortlisted ? 'Remove from shortlist' : 'Add to shortlist';
      el.style.color = isShortlisted ? '#f39c12' : '#999';
    });
    updateModalShortlistIndicator();
  }

  async function promptFolderSelection(jobId, reason = '') {
    await ensureDefaultShortlistFolderSelected({
      reason: reason || 'Choose a default shortlist folder to continue.',
      forcePrompt: true,
      jobId
    });
  }

  async function addToWaterlooWorksFolder(jobId) {
    const folderName = cleanFolderName(settings?.shortlistFolderName || '');

    if (!folderName) {
      if (IS_APPLICATIONS_PAGE) {
        showNotification('Select a shortlist folder by opening a posting in jobs.htm first.', 'info');
        return false;
      }
      await promptFolderSelection(jobId, 'Choose a default shortlist folder before shortlisting.');
      return false;
    }

    const modalReady = await ensureModalOpenForJob(jobId);
    if (!modalReady) {
      showNotification('Open a posting before shortlisting', 'info');
      return false;
    }

    let folders = await getStoredFolders();
    if (!folders || folders.length === 0 || !folderListContains(folders, folderName)) {
      folders = await FolderManager.getFolders({ forceOpen: true, allowAutoOpenModal: true, jobId });
    }

    if (!folders || folders.length === 0) {
      if (IS_APPLICATIONS_PAGE) {
        showNotification('Select a shortlist folder by opening a posting in jobs.htm first.', 'info');
        return false;
      }
      await promptFolderSelection(jobId, 'No valid folders found. Refresh and choose a default shortlist folder.');
      return false;
    }

    if (!folderListContains(folders, folderName)) {
      if (IS_APPLICATIONS_PAGE) {
        showNotification('Select a shortlist folder by opening a posting in jobs.htm first.', 'info');
        return false;
      }
      await promptFolderSelection(jobId, 'Your default folder is unavailable. Choose a new default shortlist folder.');
      return false;
    }

    const result = await FolderManager.setFolderState(folderName, { jobId, desiredState: true });
    if (!result?.success) {
      console.log(`[WAW] Could not select folder ${folderName}: ${result?.message || 'unknown error'}`);
      if (IS_APPLICATIONS_PAGE) {
        showNotification('Select a shortlist folder by opening a posting in jobs.htm first.', 'info');
        return false;
      }
      await promptFolderSelection(jobId, 'Could not use your current default folder. Choose another folder.');
      return false;
    }

    await setFolderSelectionRequired(false);
    return true;
  }

  async function removeFromWaterlooWorksFolder(jobId) {
    const folderName = cleanFolderName(settings?.shortlistFolderName || '');
    if (!folderName) {
      if (IS_APPLICATIONS_PAGE) {
        showNotification('Select a shortlist folder by opening a posting in jobs.htm first.', 'info');
        return false;
      }
      await ensureDefaultShortlistFolderSelected({
        reason: 'Choose a default shortlist folder.',
        forcePrompt: true,
        jobId
      });
      return false;
    }

    const modalReady = await ensureModalOpenForJob(jobId);
    if (!modalReady) {
      return false;
    }

    const result = await FolderManager.setFolderState(folderName, { jobId, desiredState: false });
    if (!result?.success) {
      if (IS_APPLICATIONS_PAGE) {
        showNotification('Select a shortlist folder by opening a posting in jobs.htm first.', 'info');
        return false;
      }
      await ensureDefaultShortlistFolderSelected({
        reason: 'Could not access the current shortlist folder. Choose a new default folder.',
        forcePrompt: true,
        jobId
      });
      return false;
    }
    return true;
  }

  async function toggleShortlistJob(jobId, indicatorElement = null) {
    const jobIdStr = String(jobId || '');
    if (!jobIdStr) return false;
    const wasShortlisted = shortlistedJobs.has(jobIdStr);

    if (wasShortlisted) {
      shortlistedJobs.delete(jobIdStr);
      saveShortlist();
      updateShortlistIndicators(jobIdStr, false);
      const removedFromFolder = await removeFromWaterlooWorksFolder(jobIdStr);
      if (removedFromFolder) {
        showNotification('Removed from shortlist', 'remove');
      } else {
        showNotification('Removed locally. Could not sync folder removal.', 'info');
      }
      return true;
    }

    const added = await addToWaterlooWorksFolder(jobIdStr);
    if (!added) {
      return false;
    }

    shortlistedJobs.add(jobIdStr);
    saveShortlist();
    updateShortlistIndicators(jobIdStr, true);
    showNotification('Added to shortlist!', 'add');
    return true;
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
    
    // Always refresh job links first to avoid stale index drift.
    getAllJobLinks();
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
      } else {
        let recovered = false;
        if (lastClickedJobId) {
          const clickedIdx = jobLinks.findIndex((link) => {
            const row = link.closest('tr');
            return row && String(getJobIdFromRow(row)) === String(lastClickedJobId);
          });
          if (clickedIdx >= 0) {
            currentJobIndex = clickedIdx;
            recovered = true;
            console.log('[WAW] Using last clicked job fallback:', currentJobIndex);
          }
        }

        if (!recovered) {
          const selectedRow = document.querySelector('tr.waw-selected, tr[aria-selected="true"], tr.table__row--selected');
          const selectedIndex = Number(selectedRow?.dataset?.wawIndex);
          if (Number.isFinite(selectedIndex)) {
            currentJobIndex = selectedIndex;
            recovered = true;
            console.log('[WAW] Using selected row index fallback:', currentJobIndex);
          }
        }

        if (!recovered && currentJobIndex < 0) {
          currentJobIndex = delta > 0 ? 0 : jobLinks.length - 1;
          console.log(`[WAW] Could not find job in list, starting at index ${currentJobIndex}`);
        }
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
    getAllJobLinks();
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

  function setCurrentJobContext({ index = null, jobId = null } = {}) {
    getAllJobLinks();

    if (Number.isFinite(index) && index >= 0 && index < jobLinks.length) {
      currentJobIndex = index;
      return true;
    }

    if (jobId) {
      for (let i = 0; i < jobLinks.length; i++) {
        const row = jobLinks[i].closest('tr');
        if (row && String(getJobIdFromRow(row)) === String(jobId)) {
          currentJobIndex = i;
          return true;
        }
      }
    }

    return false;
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
      z-index: 2147483000;
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
                if (IS_JOBS_PAGE) {
                  ensureDefaultShortlistFolderSelected({
                    reason: 'Choose a default shortlist folder to start shortlisting.',
                    forcePrompt: false,
                    jobId: getCurrentModalJobId()
                  }).catch(() => {});
                }
              }, 300);
            }
          }
        }

        for (const node of mutation.removedNodes) {
          if (node.nodeType === 1 && node.matches && node.matches('div[data-v-70e7ded6-s]')) {
            console.log('[WAW] Modal closed');
            const navUI = document.getElementById('waw-modal-nav');
            if (navUI) navUI.remove();
            removeDefaultFolderPrompt();
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
      if (!isModalOpen()) return;
      const menus = getVisibleFolderMenus();
      if (menus.length === 0) return;
      const folders = collectVisibleFolderNames();
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

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes[SHORTLIST_STORAGE_KEYS.folderName]) {
        settings = settings || {};
        settings.shortlistFolderName = cleanFolderName(changes[SHORTLIST_STORAGE_KEYS.folderName].newValue);
        if (settings.shortlistFolderName) {
          removeDefaultFolderPrompt();
          setFolderSelectionRequired(false).catch(() => {});
        }
      }
      if (changes[SHORTLIST_STORAGE_KEYS.reselect]) {
        chrome.storage.sync.get({ [SHORTLIST_STORAGE_KEYS.folderName]: DEFAULT_SETTINGS.shortlistFolderName })
          .then((result) => {
            settings = settings || {};
            settings.shortlistFolderName = cleanFolderName(result[SHORTLIST_STORAGE_KEYS.folderName] || DEFAULT_SETTINGS.shortlistFolderName);
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
    setCurrentJobContext,
    isModalOpen,
    shortlistedJobs,
    notify: showNotification
  };
  window.WAWFolderManager = FolderManager;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request?.action) return;

    if (request.action === 'getShortlistFolders') {
      if (IS_APPLICATIONS_PAGE) {
        sendResponse({
          folders: [],
          selectedFolder: cleanFolderName(settings?.shortlistFolderName || DEFAULT_SETTINGS.shortlistFolderName),
          context: BOARD_CONTEXT,
          requiresModal: true,
          message: 'Shortlist folders can only be managed from jobs.htm pages'
        });
        return true;
      }

      if (!isModalOpen()) {
        getStoredFolders()
          .then((folders) => {
            sendResponse({
              folders: uniqueList(folders || []),
              selectedFolder: cleanFolderName(settings?.shortlistFolderName || DEFAULT_SETTINGS.shortlistFolderName),
              context: BOARD_CONTEXT,
              requiresModal: true,
              message: 'Open a posting to select a folder'
            });
          })
          .catch((error) => {
            sendResponse({ error: error?.message || 'Failed to load saved folders' });
          });
        return true;
      }

      FolderManager.getFolders({ forceOpen: !!request.forceOpen, allowAutoOpenModal: false })
        .then(async (folders) => {
          if (folders.length > 0) {
            await setFolderSelectionRequired(false);
          }
          sendResponse({
            folders,
            selectedFolder: cleanFolderName(settings?.shortlistFolderName || DEFAULT_SETTINGS.shortlistFolderName),
            context: BOARD_CONTEXT,
            requiresModal: false,
            message: folders.length > 0 ? 'Folders found' : 'No folders found'
          });
        })
        .catch((error) => {
          sendResponse({ error: error?.message || 'Failed to fetch folders' });
        });
      return true;
    }

    if (request.action === 'selectShortlistFolder') {
      const name = cleanFolderName(request.name);
      if (name) {
        settings = settings || {};
        settings.shortlistFolderName = name;
        window.AzureStorage?.saveSettings({ [SHORTLIST_STORAGE_KEYS.folderName]: name });
        setFolderSelectionRequired(false);
      }
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'createShortlistFolder') {
      const name = cleanFolderName(request.name);
      FolderManager.createFolder(name)
        .then(async (result) => {
          if (result?.success && name) {
            settings = settings || {};
            settings.shortlistFolderName = name;
            await window.AzureStorage?.saveSettings({ [SHORTLIST_STORAGE_KEYS.folderName]: name });
            await setFolderSelectionRequired(false);
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
