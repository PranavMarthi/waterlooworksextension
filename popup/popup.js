const quickEnable = document.getElementById('quick-enable');
const shortlistFolderSelect = document.getElementById('shortlist-folder-select');
const shortlistFolderRefresh = document.getElementById('shortlist-folder-refresh');
const shortlistFolderApply = document.getElementById('shortlist-folder-apply');
const shortlistStatus = document.getElementById('shortlist-status');
const shortlistSection = document.querySelector('.shortlist-section');

let activeBoardContext = 'shared';
let activePageType = 'unknown';

function getBoardContextFromUrl(url) {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('/co-op/direct/')) return 'direct';
  if (lower.includes('/co-op/full/')) return 'full';
  return 'shared';
}

function getPageTypeFromUrl(url) {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('/applications.htm')) return 'applications';
  if (lower.includes('/jobs.htm')) return 'jobs';
  return 'other';
}

function isApplicationsPageContext() {
  return activePageType === 'applications';
}

function setShortlistSectionVisibility() {
  if (!shortlistSection) return;
  shortlistSection.style.display = isApplicationsPageContext() ? 'none' : '';
}

function getContextualKeys(context = activeBoardContext) {
  if (context === 'direct') {
    return {
      folderName: 'shortlistFolderNameDirect',
      folders: 'shortlistFoldersDirect',
      selectionRequired: 'shortlistFolderSelectionRequiredDirect',
      reselect: 'shortlistFolderReselectDirect'
    };
  }
  if (context === 'full') {
    return {
      folderName: 'shortlistFolderNameFull',
      folders: 'shortlistFoldersFull',
      selectionRequired: 'shortlistFolderSelectionRequiredFull',
      reselect: 'shortlistFolderReselectFull'
    };
  }
  return {
    folderName: 'shortlistFolderName',
    folders: 'shortlistFolders',
    selectionRequired: 'shortlistFolderSelectionRequired',
    reselect: 'shortlistFolderReselect'
  };
}

function contextLabel(context = activeBoardContext) {
  if (context === 'direct') return 'Direct';
  if (context === 'full') return 'Full';
  return 'Shared';
}

const EXCLUDED_FOLDER_NAMES = new Set([
  'save',
  'saved',
  'my applications',
  'my program',
  'remove from search',
  'removed from search',
  'select all',
  'select row',
  'create new folder',
  'create a new folder',
  'new folder',
  'create folder',
  'create a folder',
  'add folder'
]);

function normalizeFolderName(name) {
  return String(name || '')
    .replace(/toggle_?on\s*toggle_?off/gi, ' ')
    .replace(/toggle_?on|toggle_?off/gi, ' ')
    .replace(/^[/\\>\-]+\s*/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExcludedFolderName(name) {
  const lower = normalizeFolderName(name).toLowerCase();
  return !lower || EXCLUDED_FOLDER_NAMES.has(lower);
}

function uniqueFolders(folders) {
  const seen = new Set();
  const result = [];

  (folders || []).forEach((folder) => {
    const name = normalizeFolderName(folder);
    if (!name || isExcludedFolderName(name)) return;

    const key = name.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    result.push(name);
  });

  return result;
}

function setShortlistStatus(text, type = '') {
  if (!shortlistStatus) return;
  shortlistStatus.textContent = text;
  shortlistStatus.className = `shortlist-status${type ? ` ${type}` : ''}`;
}

async function saveSetting(key, value) {
  await chrome.storage.sync.set({ [key]: value });
}

async function saveContextSetting(baseKey, value) {
  const keys = getContextualKeys();
  const key = keys[baseKey] || baseKey;
  await saveSetting(key, value);
}

function populateFolderDropdown(folders, selectedFolder) {
  shortlistFolderSelect.innerHTML = '';

  const normalizedFolders = uniqueFolders(folders);
  const normalizedSelected = normalizeFolderName(selectedFolder);

  if (normalizedFolders.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Open a posting to select a folder';
    option.disabled = true;
    option.selected = true;
    shortlistFolderSelect.appendChild(option);
    return;
  }

  normalizedFolders.forEach((folder) => {
    const option = document.createElement('option');
    option.value = folder;
    option.textContent = folder;
    shortlistFolderSelect.appendChild(option);
  });

  if (!normalizedSelected) {
    shortlistFolderSelect.selectedIndex = 0;
    return;
  }

  const match = normalizedFolders.find((folder) => folder.toLowerCase() === normalizedSelected.toLowerCase());
  if (match) {
    shortlistFolderSelect.value = match;
  } else {
    shortlistFolderSelect.selectedIndex = 0;
  }
}

async function loadStoredFoldersOnly() {
  const keys = getContextualKeys();
  const settings = await chrome.storage.sync.get({
    [keys.folderName]: '',
    [keys.folders]: []
  });

  const folders = uniqueFolders(settings[keys.folders]);
  populateFolderDropdown(folders, settings[keys.folderName] || '');
  return { folders, selected: settings[keys.folderName] || '' };
}

async function loadSettings() {
  try {
    if (isApplicationsPageContext()) {
      setShortlistStatus('Shortlist folder settings are managed from jobs.htm only.', '');
      return;
    }

    const keys = getContextualKeys();
    const settings = await chrome.storage.sync.get({
      featuresEnabled: true,
      [keys.folderName]: '',
      [keys.folders]: [],
      [keys.selectionRequired]: false
    });

    quickEnable.checked = settings.featuresEnabled !== false;

    const folders = uniqueFolders(settings[keys.folders]);
    populateFolderDropdown(folders, settings[keys.folderName] || '');

    if (settings[keys.selectionRequired]) {
      setShortlistStatus('Open a posting to select a default folder', 'error');
      return;
    }

    const selected = normalizeFolderName(settings[keys.folderName]);
    if (selected) {
      setShortlistStatus(`${contextLabel()}: ${selected}`, 'success');
    } else {
      setShortlistStatus(`${contextLabel()}: open a posting, then click Refresh`, '');
    }
  } catch (error) {
    console.error('[WAW Popup] Failed to load settings:', error);
    setShortlistStatus('Failed to load popup settings', 'error');
  }
}

async function applySelectedFolder({ force = false } = {}) {
  await syncActiveContextFromTabs();
  if (isApplicationsPageContext()) {
    setShortlistStatus('Open jobs.htm to manage shortlist folders.', 'error');
    return;
  }

  const value = normalizeFolderName(shortlistFolderSelect?.value || '');
  if (!value) {
    setShortlistStatus('Select a folder first', 'error');
    return;
  }

  await saveContextSetting('folderName', value);
  await saveContextSetting('selectionRequired', false);

  if (force) {
    await saveContextSetting('reselect', Date.now());
  }

  setShortlistStatus(`${contextLabel()}: ${value}`, 'success');
}

async function findWaterlooWorksTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.url?.includes('waterlooworks.uwaterloo.ca')) {
    return activeTab;
  }

  const wwTabs = await chrome.tabs.query({ url: 'https://waterlooworks.uwaterloo.ca/*' });
  return wwTabs[0] || null;
}

async function syncActiveContextFromTabs() {
  const tab = await findWaterlooWorksTab();
  if (tab?.url) {
    activeBoardContext = getBoardContextFromUrl(tab.url);
    activePageType = getPageTypeFromUrl(tab.url);
  } else {
    activeBoardContext = 'shared';
    activePageType = 'other';
  }
  setShortlistSectionVisibility();
  return tab;
}

function sendToContentScript(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function refreshFolders() {
  shortlistFolderRefresh.classList.add('spinning');
  setShortlistStatus('Refreshing folder list...');

  try {
    const tab = await syncActiveContextFromTabs();
    if (isApplicationsPageContext()) {
      setShortlistStatus('Open jobs.htm to refresh shortlist folders.', 'error');
      return;
    }
    if (!tab) {
      await loadStoredFoldersOnly();
      setShortlistStatus('Open WaterlooWorks, then click Refresh', 'error');
      return;
    }

    const response = await sendToContentScript(tab.id, {
      action: 'getShortlistFolders',
      forceOpen: true
    });

    if (response?.error) {
      await loadStoredFoldersOnly();
      setShortlistStatus(response.error, 'error');
      return;
    }

    const fetchedFolders = uniqueFolders(response?.folders || []);
    const selectedFolder = normalizeFolderName(response?.selectedFolder || '');
    if (response?.context) {
      activeBoardContext = response.context;
    }

    if (response?.requiresModal) {
      populateFolderDropdown(fetchedFolders, selectedFolder);
      setShortlistStatus(`${contextLabel()}: open a posting to refresh folders`, 'error');
      return;
    }

    if (fetchedFolders.length === 0) {
      const fallback = await loadStoredFoldersOnly();
      if (fallback.folders.length > 0) {
        setShortlistStatus('No new folders found. Using cached list.', '');
      } else {
        setShortlistStatus('No valid folders found in this posting.', 'error');
      }
      return;
    }

    await saveContextSetting('folders', fetchedFolders);
    await saveContextSetting('selectionRequired', false);
    populateFolderDropdown(fetchedFolders, selectedFolder);

    const selected = normalizeFolderName(shortlistFolderSelect.value);
    if (selected) {
      await saveContextSetting('folderName', selected);
    }

    setShortlistStatus(`${contextLabel()}: loaded ${fetchedFolders.length} folder${fetchedFolders.length === 1 ? '' : 's'}`, 'success');
  } catch (error) {
    console.error('[WAW Popup] Failed to refresh folders:', error);
    await loadStoredFoldersOnly();
    setShortlistStatus('Could not fetch folders from WaterlooWorks', 'error');
  } finally {
    shortlistFolderRefresh.classList.remove('spinning');
  }
}

function initEventListeners() {
  quickEnable.addEventListener('change', (event) => {
    saveSetting('featuresEnabled', event.target.checked);
  });

  shortlistFolderSelect?.addEventListener('change', () => {
    applySelectedFolder({ force: false });
  });

  shortlistFolderRefresh?.addEventListener('click', () => {
    refreshFolders();
  });

  shortlistFolderApply?.addEventListener('click', () => {
    applySelectedFolder({ force: true });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await syncActiveContextFromTabs();
  await loadSettings();
  initEventListeners();
});
