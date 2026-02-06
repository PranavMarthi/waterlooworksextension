/**
 * Popup Script for WaterlooWorks Azure
 */

// Element references
const quickEnable = document.getElementById('quick-enable');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const openOptions = document.getElementById('open-options');
const folderSelect = document.getElementById('shortlist-folder-select');
const folderRefresh = document.getElementById('shortlist-folder-refresh');
const folderStatus = document.getElementById('shortlist-status');

/**
 * Find the active WaterlooWorks tab (or any WW tab)
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function findWaterlooWorksTab() {
  try {
    // First try the active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url?.includes('waterlooworks.uwaterloo.ca')) {
      return activeTab;
    }
    // Fall back to any WaterlooWorks tab
    const wwTabs = await chrome.tabs.query({ url: 'https://waterlooworks.uwaterloo.ca/*' });
    return wwTabs.length > 0 ? wwTabs[0] : null;
  } catch (e) {
    console.error('[Azure Popup] Failed to query tabs:', e);
    return null;
  }
}

/**
 * Send a message to the content script on a WaterlooWorks tab
 */
async function sendToContentScript(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Populate the folder dropdown from a list of names
 */
function populateFolderDropdown(folders, selectedFolder) {
  if (!folderSelect) return;

  // Clear existing options except the placeholder
  folderSelect.innerHTML = '';

  if (!folders || folders.length === 0) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = '-- No folders found --';
    folderSelect.appendChild(placeholder);
    return;
  }

  folders.forEach((name) => {
    if (!name) return;
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (name === selectedFolder) {
      option.selected = true;
    }
    folderSelect.appendChild(option);
  });

  // If no folder was selected but we have a selectedFolder value, and it's in the list, select it
  if (selectedFolder && !folderSelect.value) {
    // The selected folder might not be in the list; add it as the first option
    const hasSelected = folders.some(f => f === selectedFolder);
    if (!hasSelected) {
      const option = document.createElement('option');
      option.value = selectedFolder;
      option.textContent = selectedFolder;
      option.selected = true;
      folderSelect.insertBefore(option, folderSelect.firstChild);
    }
  }
}

/**
 * Set status text with optional type ('', 'success', 'error')
 */
function setStatus(text, type = '') {
  if (!folderStatus) return;
  folderStatus.textContent = text;
  folderStatus.className = 'shortlist-status' + (type ? ' ' + type : '');
}

/**
 * Fetch folders from the content script on the WaterlooWorks tab
 */
async function fetchFoldersFromTab(forceOpen = false) {
  if (folderRefresh) folderRefresh.classList.add('spinning');
  setStatus('Fetching folders...');

  const tab = await findWaterlooWorksTab();
  if (!tab) {
    setStatus('Open WaterlooWorks to load folders', 'error');
    if (folderRefresh) folderRefresh.classList.remove('spinning');
    // Still populate from stored folders as fallback
    await loadStoredFolders();
    return;
  }

  try {
    const response = await sendToContentScript(tab.id, {
      action: 'getShortlistFolders',
      forceOpen: forceOpen
    });

    if (folderRefresh) folderRefresh.classList.remove('spinning');

    if (response?.error) {
      setStatus('Error: ' + response.error, 'error');
      await loadStoredFolders();
      return;
    }

    const folders = response?.folders || [];
    const selectedFolder = response?.selectedFolder || '';

    if (folders.length > 0) {
      // Save to storage so they persist across popup opens
      await chrome.storage.sync.set({ shortlistFolders: folders });
      populateFolderDropdown(folders, selectedFolder);
      setStatus(folders.length + ' folder' + (folders.length !== 1 ? 's' : '') + ' found', 'success');
    } else {
      setStatus('No folders found on page', '');
      await loadStoredFolders();
    }
  } catch (error) {
    if (folderRefresh) folderRefresh.classList.remove('spinning');
    console.error('[Azure Popup] Failed to fetch folders:', error);
    setStatus('Could not reach WaterlooWorks tab', 'error');
    await loadStoredFolders();
  }
}

/**
 * Load folders from chrome.storage (fallback when tab not available)
 */
async function loadStoredFolders() {
  try {
    const settings = await chrome.storage.sync.get({
      shortlistFolderName: 'shortlist',
      shortlistFolders: []
    });
    const folders = Array.isArray(settings.shortlistFolders) ? settings.shortlistFolders : [];
    populateFolderDropdown(folders, settings.shortlistFolderName);
  } catch (e) {
    console.error('[Azure Popup] Failed to load stored folders:', e);
  }
}

/**
 * Load settings
 */
async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get({
      featuresEnabled: true,
      darkMode: false,
      shortlistFolderName: 'shortlist',
      shortlistFolders: []
    });
    
    quickEnable.checked = settings.featuresEnabled;
    darkModeToggle.checked = settings.darkMode;

    // Populate dropdown from stored folders first (instant), then try fetching live
    const folders = Array.isArray(settings.shortlistFolders) ? settings.shortlistFolders : [];
    populateFolderDropdown(folders, settings.shortlistFolderName);

    // Attempt to fetch live folders from the WaterlooWorks tab
    fetchFoldersFromTab(false);
  } catch (error) {
    console.error('[Azure Popup] Failed to load settings:', error);
  }
}

/**
 * Save setting
 */
async function saveSetting(key, value) {
  try {
    await chrome.storage.sync.set({ [key]: value });
  } catch (error) {
    console.error('[Azure Popup] Failed to save setting:', error);
  }
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
  // Quick enable toggle
  quickEnable.addEventListener('change', (e) => {
    saveSetting('featuresEnabled', e.target.checked);
  });

  // Dark mode toggle
  darkModeToggle.addEventListener('change', (e) => {
    saveSetting('darkMode', e.target.checked);
  });

  // Open options
  openOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Folder dropdown selection
  folderSelect?.addEventListener('change', (e) => {
    const value = e.target.value;
    if (value) {
      saveSetting('shortlistFolderName', value);
      // Also notify the content script via a reselect timestamp
      saveSetting('shortlistFolderReselect', Date.now());
      setStatus('Folder set to: ' + value, 'success');
    }
  });

  // Refresh button — force-scrape folders from the WW page
  folderRefresh?.addEventListener('click', () => {
    fetchFoldersFromTab(true);
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initEventListeners();
});
