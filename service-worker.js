/**
 * Background service worker for WaterlooActuallyWorks.
 * Keeps install defaults and simple utility messaging.
 */

const VERSION = '5.0.0';

const INSTALL_DEFAULTS = {
  version: VERSION,
  firstRun: true,
  featuresEnabled: true,
  keyboardShortcuts: true,
  shortlistFolderName: '',
  shortlistFolders: [],
  shortlistFolderSelectionRequired: true,
  jobRearrangerEnabled: true,
  jobRearrangerPriorityKeys: ['duration', 'location', 'compensation', 'deadline', 'method'],
  jobRearrangerStandardOrder: ['job_description', 'responsibilities', 'required_skills', 'targeted_degrees']
};

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set(INSTALL_DEFAULTS);
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
    return;
  }

  if (details.reason === 'update') {
    await chrome.storage.sync.set({ version: VERSION });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request?.action) {
    case 'getVersion':
      sendResponse({ version: VERSION });
      return;

    case 'openTab':
      if (!request.url) {
        sendResponse({ success: false, error: 'Missing URL' });
        return;
      }
      chrome.tabs.create({
        url: request.url,
        active: request.active !== false
      });
      sendResponse({ success: true });
      return;

    case 'getSettings':
      chrome.storage.sync.get(null, (settings) => {
        sendResponse(settings || {});
      });
      return true;

    case 'saveSettings':
      chrome.storage.sync.set(request.settings || {}, () => {
        sendResponse({ success: true });
      });
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return;
  }
});
