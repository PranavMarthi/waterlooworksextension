/**
 * Storage utility for WaterlooWorks Azure
 * Handles chrome.storage.sync with fallback to local
 */

const StorageKeys = {
  // Theme settings
  THEME_ID: 'themeId',
  DARK_MODE: 'darkMode',
  AUTO_DARK_MODE: 'autoDarkMode',
  DARK_MODE_START: 'darkModeStart',
  DARK_MODE_END: 'darkModeEnd',
  
  // Feature flags
  FEATURES_ENABLED: 'featuresEnabled',
  LAYOUT_COMPACT: 'layoutCompact',
  BATCH_OPERATIONS: 'batchOperations',
  KEYBOARD_SHORTCUTS: 'keyboardShortcuts',
  STICKY_NAV: 'stickyNav',
  
  // Job posting settings
  HIGHLIGHT_NEW: 'highlightNew',
  OPEN_IN_NEW_TAB: 'openInNewTab',
  NEW_JOB_DAYS_THRESHOLD: 'newJobDaysThreshold',
  SHORTLIST_FOLDER_NAME: 'shortlistFolderName',
  SHORTLIST_FOLDERS: 'shortlistFolders',

  // Job posting layout / rearranger
  JOB_REARRANGER_ENABLED: 'jobRearrangerEnabled',
  JOB_REARRANGER_PRIORITY_KEYS: 'jobRearrangerPriorityKeys',
  JOB_REARRANGER_STANDARD_ORDER: 'jobRearrangerStandardOrder',

  // Messages settings
  HIGHLIGHT_UNREAD: 'highlightUnread',
  
  // Extension state
  VERSION: 'version',
  FIRST_RUN: 'firstRun'
};

const DefaultSettings = {
  [StorageKeys.THEME_ID]: 'azure-light',
  [StorageKeys.DARK_MODE]: false,
  [StorageKeys.AUTO_DARK_MODE]: false,
  [StorageKeys.DARK_MODE_START]: '22:00',
  [StorageKeys.DARK_MODE_END]: '07:00',
  [StorageKeys.FEATURES_ENABLED]: true,
  [StorageKeys.LAYOUT_COMPACT]: false,
  [StorageKeys.BATCH_OPERATIONS]: true,
  [StorageKeys.KEYBOARD_SHORTCUTS]: true,
  [StorageKeys.STICKY_NAV]: true,
  [StorageKeys.HIGHLIGHT_NEW]: true,
  [StorageKeys.OPEN_IN_NEW_TAB]: true,
  [StorageKeys.NEW_JOB_DAYS_THRESHOLD]: 7,
  [StorageKeys.SHORTLIST_FOLDER_NAME]: 'shortlist',
  [StorageKeys.SHORTLIST_FOLDERS]: [],
  [StorageKeys.JOB_REARRANGER_ENABLED]: true,
  [StorageKeys.JOB_REARRANGER_PRIORITY_KEYS]: ['duration', 'location', 'compensation', 'deadline', 'method'],
  [StorageKeys.JOB_REARRANGER_STANDARD_ORDER]: ['job_description', 'responsibilities', 'required_skills', 'targeted_degrees'],
  [StorageKeys.HIGHLIGHT_UNREAD]: true,
  [StorageKeys.VERSION]: '5.0.0',
  [StorageKeys.FIRST_RUN]: true
};

/**
 * Get settings from storage
 * @param {string|string[]|null} keys - Keys to retrieve, or null for all
 * @returns {Promise<object>} Settings object
 */
async function getSettings(keys = null) {
  const keysToGet = keys || Object.keys(DefaultSettings);
  
  try {
    // Try sync storage first
    const result = await chrome.storage.sync.get(keysToGet);
    
    // Merge with defaults for any missing keys
    const settings = {};
    const keyArray = Array.isArray(keysToGet) ? keysToGet : [keysToGet];
    
    for (const key of keyArray) {
      settings[key] = result[key] !== undefined ? result[key] : DefaultSettings[key];
    }
    
    return settings;
  } catch (error) {
    console.warn('[Azure] Sync storage failed, falling back to local:', error);
    
    try {
      const result = await chrome.storage.local.get(keysToGet);
      const settings = {};
      const keyArray = Array.isArray(keysToGet) ? keysToGet : [keysToGet];
      
      for (const key of keyArray) {
        settings[key] = result[key] !== undefined ? result[key] : DefaultSettings[key];
      }
      
      return settings;
    } catch (localError) {
      console.error('[Azure] Local storage also failed:', localError);
      return DefaultSettings;
    }
  }
}

/**
 * Save settings to storage
 * @param {object} settings - Settings to save
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  try {
    await chrome.storage.sync.set(settings);
  } catch (error) {
    console.warn('[Azure] Sync storage save failed, falling back to local:', error);
    await chrome.storage.local.set(settings);
  }
}

/**
 * Reset settings to defaults
 * @returns {Promise<void>}
 */
async function resetSettings() {
  await saveSettings(DefaultSettings);
}

/**
 * Listen for settings changes
 * @param {function} callback - Callback function(changes, areaName)
 */
function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener(callback);
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.AzureStorage = {
    StorageKeys,
    DefaultSettings,
    getSettings,
    saveSettings,
    resetSettings,
    onSettingsChanged
  };
}
