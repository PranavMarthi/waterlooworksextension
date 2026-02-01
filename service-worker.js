/**
 * Service Worker for WaterlooWorks Azure
 * Handles background tasks, extension lifecycle, and messaging
 */

// Extension version
const VERSION = '4.0.0';

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Azure SW] Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // First time installation
    chrome.storage.sync.set({
      version: VERSION,
      firstRun: true,
      featuresEnabled: true,
      themeId: 'azure-light',
      darkMode: false
    });
    
    // Open options page on first install
    chrome.tabs.create({
      url: chrome.runtime.getURL('options/options.html?welcome=true')
    });
  } else if (details.reason === 'update') {
    // Extension updated
    console.log('[Azure SW] Updated from', details.previousVersion, 'to', VERSION);
    
    chrome.storage.sync.set({
      version: VERSION
    });
  }
});

/**
 * Handle messages from content scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Azure SW] Message received:', request.action);
  
  switch (request.action) {
    case 'getVersion':
      sendResponse({ version: VERSION });
      break;
      
    case 'openOptions':
      chrome.tabs.create({
        url: chrome.runtime.getURL('options/options.html')
      });
      sendResponse({ success: true });
      break;
      
    case 'openTab':
      chrome.tabs.create({
        url: request.url,
        active: request.active !== false
      });
      sendResponse({ success: true });
      break;
      
    case 'getSettings':
      chrome.storage.sync.get(null, (settings) => {
        sendResponse(settings);
      });
      return true; // Keep channel open for async response
      
    case 'saveSettings':
      chrome.storage.sync.set(request.settings, () => {
        sendResponse({ success: true });
      });
      return true;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
});

/**
 * Handle extension icon click (if no popup)
 */
chrome.action.onClicked.addListener((tab) => {
  // This only fires if no popup is defined
  // Since we have a popup, this won't be triggered normally
  console.log('[Azure SW] Action clicked on tab:', tab.id);
});

/**
 * Listen for tab updates to potentially re-inject
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('waterlooworks.uwaterloo.ca')) {
    console.log('[Azure SW] WaterlooWorks tab updated:', tabId);
  }
});

/**
 * Context menu setup (optional)
 */
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'azure-options',
      title: 'WaterlooWorks Azure Options',
      contexts: ['action']
    });
  });
}

// Set up context menus when service worker starts
chrome.runtime.onStartup.addListener(() => {
  console.log('[Azure SW] Service worker started');
  setupContextMenus();
});

// Also set up on install
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'azure-options') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('options/options.html')
    });
  }
});

console.log('[Azure SW] Service worker loaded');
