/**
 * Popup Script for WaterlooWorks Azure
 */

// Element references
const quickEnable = document.getElementById('quick-enable');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const openOptions = document.getElementById('open-options');

/**
 * Load settings
 */
async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get({
      featuresEnabled: true,
      darkMode: false
    });
    
    quickEnable.checked = settings.featuresEnabled;
    darkModeToggle.checked = settings.darkMode;
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
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initEventListeners();
});
