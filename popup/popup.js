/**
 * Popup Script for WaterlooWorks Azure
 */

// Element references
const quickEnable = document.getElementById('quick-enable');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const openOptions = document.getElementById('open-options');
const shortlistFolderSelect = document.getElementById('shortlist-folder-select');
const shortlistFolderInput = document.getElementById('shortlist-folder-input');
const shortlistFolderCreate = document.getElementById('shortlist-folder-create');
const shortlistFolderRefresh = document.getElementById('shortlist-folder-refresh');
const shortlistStatus = document.getElementById('shortlist-status');

const DEFAULT_SHORTLIST_FOLDER = 'shortlist';

function setStatus(message) {
  if (!shortlistStatus) return;
  shortlistStatus.textContent = message || '';
}

function normalizeFolderName(name) {
  return (name || '').trim();
}

function updateFolderSelect(folderList, selected) {
  if (!shortlistFolderSelect) return;
  shortlistFolderSelect.innerHTML = '';

  const folders = Array.isArray(folderList) ? folderList.filter(Boolean) : [];
  if (folders.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No folders found';
    shortlistFolderSelect.appendChild(option);
    shortlistFolderSelect.disabled = true;
  } else {
    shortlistFolderSelect.disabled = false;
    folders.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      shortlistFolderSelect.appendChild(option);
    });
  }

  if (selected && folders.length > 0) {
    shortlistFolderSelect.value = selected;
  }
}

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return { error: 'no_active_tab' };
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    return { error: 'send_failed', details: error?.message };
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
      shortlistFolderName: DEFAULT_SHORTLIST_FOLDER,
      shortlistFolders: []
    });
    
    quickEnable.checked = settings.featuresEnabled;
    darkModeToggle.checked = settings.darkMode;
    updateFolderSelect(settings.shortlistFolders, settings.shortlistFolderName || DEFAULT_SHORTLIST_FOLDER);
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

async function saveFolderList(folders) {
  const list = Array.isArray(folders) ? folders.filter(Boolean) : [];
  await saveSetting('shortlistFolders', list);
}

async function refreshFolders({ forceOpen = false } = {}) {
  setStatus('Refreshing folders...');
  const response = await sendToActiveTab({ action: 'getShortlistFolders', forceOpen });

  if (response?.error) {
    setStatus('Open WaterlooWorks and refresh to load folders');
  }

  if (response?.folders) {
    await saveFolderList(response.folders);
    const selected = response.selectedFolder || shortlistFolderSelect?.value || DEFAULT_SHORTLIST_FOLDER;
    updateFolderSelect(response.folders, selected);
    setStatus(response.message || 'Folders updated');
    return;
  }

  setStatus('Using saved folders (open a posting to refresh)');
  const settings = await chrome.storage.sync.get({
    shortlistFolderName: DEFAULT_SHORTLIST_FOLDER,
    shortlistFolders: []
  });
  updateFolderSelect(settings.shortlistFolders, settings.shortlistFolderName || DEFAULT_SHORTLIST_FOLDER);
}

async function createFolderFromPopup() {
  const name = normalizeFolderName(shortlistFolderInput?.value);
  if (!name) {
    setStatus('Enter a folder name');
    return;
  }

  setStatus('Creating folder...');
  const response = await sendToActiveTab({ action: 'createShortlistFolder', name });

  if (response?.success) {
    const folders = response.folders || [];
    await saveFolderList(folders);
    await saveSetting('shortlistFolderName', response.selectedFolder || name);
    updateFolderSelect(folders, response.selectedFolder || name);
    shortlistFolderInput.value = '';
    setStatus('Folder created');
    return;
  }

  if (response?.error) {
    setStatus('Open WaterlooWorks and try again');
  } else {
    setStatus(response?.message || 'Could not create folder (open a posting and try again)');
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

  shortlistFolderRefresh?.addEventListener('click', () => {
    refreshFolders({ forceOpen: true });
  });

  shortlistFolderSelect?.addEventListener('change', (e) => {
    const value = normalizeFolderName(e.target.value) || DEFAULT_SHORTLIST_FOLDER;
    saveSetting('shortlistFolderName', value);
  });

  shortlistFolderCreate?.addEventListener('click', () => {
    createFolderFromPopup();
  });

  shortlistFolderInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      shortlistFolderCreate?.click();
    }
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initEventListeners();
  refreshFolders({ forceOpen: false });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.shortlistFolders || changes.shortlistFolderName) {
    chrome.storage.sync.get({
      shortlistFolderName: DEFAULT_SHORTLIST_FOLDER,
      shortlistFolders: []
    }).then((settings) => {
      updateFolderSelect(settings.shortlistFolders, settings.shortlistFolderName || DEFAULT_SHORTLIST_FOLDER);
    });
  }
});
