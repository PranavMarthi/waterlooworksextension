/**
 * Popup Script for WaterlooWorks Azure
 */

// Element references
const quickEnable = document.getElementById('quick-enable');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const openOptions = document.getElementById('open-options');
const shortlistFolderInput = document.getElementById('shortlist-folder-input');
const shortlistFolderList = document.getElementById('shortlist-folder-list');
const shortlistFolderApply = document.getElementById('shortlist-folder-apply');

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
    if (shortlistFolderInput) {
      shortlistFolderInput.value = settings.shortlistFolderName || 'shortlist';
    }
    if (shortlistFolderList) {
      shortlistFolderList.innerHTML = '';
      const folders = Array.isArray(settings.shortlistFolders) ? settings.shortlistFolders : [];
      folders.forEach((name) => {
        if (!name) return;
        const option = document.createElement('option');
        option.value = name;
        shortlistFolderList.appendChild(option);
      });
    }
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

async function applyShortlistFolder(value, { force = false } = {}) {
  const normalized = value.trim() || 'shortlist';
  if (shortlistFolderInput) {
    shortlistFolderInput.value = normalized;
  }
  await saveSetting('shortlistFolderName', normalized);
  if (force) {
    await saveSetting('shortlistFolderReselect', Date.now());
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

  shortlistFolderInput?.addEventListener('change', (e) => {
    applyShortlistFolder(e.target.value, { force: false });
  });

  shortlistFolderApply?.addEventListener('click', () => {
    if (!shortlistFolderInput) return;
    applyShortlistFolder(shortlistFolderInput.value, { force: true });
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initEventListeners();
});
