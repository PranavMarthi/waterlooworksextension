/**
 * Options Page Script for WaterlooWorks Azure
 */

// Default settings
const DefaultSettings = {
  themeId: 'azure-light',
  darkMode: false,
  autoDarkMode: false,
  darkModeStart: '22:00',
  darkModeEnd: '07:00',
  featuresEnabled: true,
  layoutCompact: false,
  batchOperations: true,
  keyboardShortcuts: true,
  stickyNav: true,
  highlightNew: true,
  openInNewTab: true,
  newJobDaysThreshold: 7,
  shortlistFolderName: 'shortlist',
  shortlistFolders: [],
  jobRearrangerEnabled: true,
  jobRearrangerPriorityKeys: ['duration', 'location', 'compensation', 'deadline', 'method'],
  jobRearrangerStandardOrder: ['job_description', 'responsibilities', 'required_skills', 'targeted_degrees'],
  highlightUnread: true,
  version: '5.0.0',
  firstRun: true
};

// Element references
const elements = {
  welcomeSection: document.getElementById('welcome-section'),
  dismissWelcome: document.getElementById('dismiss-welcome'),
  featuresEnabled: document.getElementById('features-enabled'),
  themeSelect: document.getElementById('theme-select'),
  darkMode: document.getElementById('dark-mode'),
  autoDarkMode: document.getElementById('auto-dark-mode'),
  darkModeSchedule: document.getElementById('dark-mode-schedule'),
  darkModeStart: document.getElementById('dark-mode-start'),
  darkModeEnd: document.getElementById('dark-mode-end'),
  layoutCompact: document.getElementById('layout-compact'),
  stickyNav: document.getElementById('sticky-nav'),
  highlightNew: document.getElementById('highlight-new'),
  shortlistFolder: document.getElementById('shortlist-folder'),
  shortlistFolderList: document.getElementById('shortlist-folder-list'),
  openNewTab: document.getElementById('open-new-tab'),
  batchOperations: document.getElementById('batch-operations'),
  newJobDays: document.getElementById('new-job-days'),
  highlightUnread: document.getElementById('highlight-unread'),
  keyboardShortcuts: document.getElementById('keyboard-shortcuts'),
  jobRearrangerEnabled: document.getElementById('job-rearranger-enabled'),
  jobRearrangerPriorityKeys: document.getElementById('job-rearranger-priority-keys'),
  jobRearrangerStandardOrder: document.getElementById('job-rearranger-standard-order'),
  jobRearrangerReset: document.getElementById('job-rearranger-reset'),
  resetSettings: document.getElementById('reset-settings')
};

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get(DefaultSettings);
    
    // Apply settings to UI
    elements.featuresEnabled.checked = settings.featuresEnabled;
    elements.themeSelect.value = settings.themeId;
    elements.darkMode.checked = settings.darkMode;
    elements.autoDarkMode.checked = settings.autoDarkMode;
    elements.darkModeStart.value = settings.darkModeStart;
    elements.darkModeEnd.value = settings.darkModeEnd;
    elements.layoutCompact.checked = settings.layoutCompact;
    elements.stickyNav.checked = settings.stickyNav;
    elements.highlightNew.checked = settings.highlightNew;
    if (elements.shortlistFolder) {
      elements.shortlistFolder.value = settings.shortlistFolderName || DefaultSettings.shortlistFolderName;
    }
    if (elements.shortlistFolderList) {
      const folderList = Array.isArray(settings.shortlistFolders) ? settings.shortlistFolders : [];
      elements.shortlistFolderList.innerHTML = '';
      folderList.forEach((name) => {
        if (!name) return;
        const option = document.createElement('option');
        option.value = name;
        elements.shortlistFolderList.appendChild(option);
      });
    }
    elements.openNewTab.checked = settings.openInNewTab;
    elements.batchOperations.checked = settings.batchOperations;
    if (elements.newJobDays) {
      elements.newJobDays.value = settings.newJobDaysThreshold || 7;
    }
    elements.highlightUnread.checked = settings.highlightUnread;
    elements.keyboardShortcuts.checked = settings.keyboardShortcuts;
    if (elements.jobRearrangerEnabled) {
      elements.jobRearrangerEnabled.checked = settings.jobRearrangerEnabled !== false;
    }
    if (elements.jobRearrangerPriorityKeys) {
      elements.jobRearrangerPriorityKeys.value = Array.isArray(settings.jobRearrangerPriorityKeys)
        ? settings.jobRearrangerPriorityKeys.join('\n')
        : DefaultSettings.jobRearrangerPriorityKeys.join('\n');
    }
    if (elements.jobRearrangerStandardOrder) {
      elements.jobRearrangerStandardOrder.value = Array.isArray(settings.jobRearrangerStandardOrder)
        ? settings.jobRearrangerStandardOrder.join('\n')
        : DefaultSettings.jobRearrangerStandardOrder.join('\n');
    }

    // Show/hide conditional UI
    updateDarkModeScheduleVisibility();
    
    // Show welcome section if first run or URL has welcome param
    const urlParams = new URLSearchParams(window.location.search);
    if (settings.firstRun || urlParams.get('welcome') === 'true') {
      elements.welcomeSection.classList.remove('hidden');
    }
    
    console.log('[Azure Options] Settings loaded:', settings);
  } catch (error) {
    console.error('[Azure Options] Failed to load settings:', error);
  }
}

/**
 * Save a single setting
 */
async function saveSetting(key, value) {
  try {
    await chrome.storage.sync.set({ [key]: value });
    console.log(`[Azure Options] Saved ${key}:`, value);
  } catch (error) {
    console.error(`[Azure Options] Failed to save ${key}:`, error);
  }
}

/**
 * Update dark mode schedule visibility
 */
function updateDarkModeScheduleVisibility() {
  if (elements.autoDarkMode.checked) {
    elements.darkModeSchedule.style.display = 'flex';
  } else {
    elements.darkModeSchedule.style.display = 'none';
  }
}

/**
 * Reset all settings to defaults
 */
async function resetAllSettings() {
  if (confirm('Are you sure you want to reset all settings to defaults?')) {
    try {
      await chrome.storage.sync.set(DefaultSettings);
      loadSettings();
      console.log('[Azure Options] Settings reset to defaults');
    } catch (error) {
      console.error('[Azure Options] Failed to reset settings:', error);
    }
  }
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
  // Welcome dismiss
  elements.dismissWelcome?.addEventListener('click', () => {
    elements.welcomeSection.classList.add('hidden');
    saveSetting('firstRun', false);
  });

  // General
  elements.featuresEnabled.addEventListener('change', (e) => {
    saveSetting('featuresEnabled', e.target.checked);
  });

  // Appearance
  elements.themeSelect.addEventListener('change', (e) => {
    saveSetting('themeId', e.target.value);
  });

  elements.darkMode.addEventListener('change', (e) => {
    saveSetting('darkMode', e.target.checked);
  });

  elements.autoDarkMode.addEventListener('change', (e) => {
    saveSetting('autoDarkMode', e.target.checked);
    updateDarkModeScheduleVisibility();
  });

  elements.darkModeStart.addEventListener('change', (e) => {
    saveSetting('darkModeStart', e.target.value);
  });

  elements.darkModeEnd.addEventListener('change', (e) => {
    saveSetting('darkModeEnd', e.target.value);
  });

  // Layout
  elements.layoutCompact.addEventListener('change', (e) => {
    saveSetting('layoutCompact', e.target.checked);
  });

  elements.stickyNav.addEventListener('change', (e) => {
    saveSetting('stickyNav', e.target.checked);
  });

  // Job Postings
  elements.highlightNew.addEventListener('change', (e) => {
    saveSetting('highlightNew', e.target.checked);
  });

  elements.shortlistFolder?.addEventListener('blur', (e) => {
    const value = e.target.value.trim() || DefaultSettings.shortlistFolderName;
    e.target.value = value;
    saveSetting('shortlistFolderName', value);
  });

  elements.openNewTab.addEventListener('change', (e) => {
    saveSetting('openInNewTab', e.target.checked);
  });

  elements.batchOperations.addEventListener('change', (e) => {
    saveSetting('batchOperations', e.target.checked);
  });

  elements.newJobDays?.addEventListener('change', (e) => {
    saveSetting('newJobDaysThreshold', parseInt(e.target.value) || 7);
  });

  // Messages
  elements.highlightUnread.addEventListener('change', (e) => {
    saveSetting('highlightUnread', e.target.checked);
  });

  // Keyboard shortcuts
  elements.keyboardShortcuts.addEventListener('change', (e) => {
    saveSetting('keyboardShortcuts', e.target.checked);
  });

  // Job posting layout
  elements.jobRearrangerEnabled?.addEventListener('change', (e) => {
    saveSetting('jobRearrangerEnabled', e.target.checked);
  });
  elements.jobRearrangerPriorityKeys?.addEventListener('blur', () => {
    const arr = elements.jobRearrangerPriorityKeys.value.split('\n').map(s => s.trim()).filter(Boolean);
    saveSetting('jobRearrangerPriorityKeys', arr);
  });
  elements.jobRearrangerStandardOrder?.addEventListener('blur', () => {
    const arr = elements.jobRearrangerStandardOrder.value.split('\n').map(s => s.trim()).filter(Boolean);
    saveSetting('jobRearrangerStandardOrder', arr);
  });
  elements.jobRearrangerReset?.addEventListener('click', () => {
    elements.jobRearrangerPriorityKeys.value = DefaultSettings.jobRearrangerPriorityKeys.join('\n');
    elements.jobRearrangerStandardOrder.value = DefaultSettings.jobRearrangerStandardOrder.join('\n');
    saveSetting('jobRearrangerPriorityKeys', DefaultSettings.jobRearrangerPriorityKeys);
    saveSetting('jobRearrangerStandardOrder', DefaultSettings.jobRearrangerStandardOrder);
  });

  // Reset
  elements.resetSettings.addEventListener('click', resetAllSettings);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initEventListeners();
});
