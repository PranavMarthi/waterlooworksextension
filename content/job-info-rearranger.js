/**
 * Job Information Rearranger for WaterlooWorks Azure
 * Based on the working WaterlooWorks Job Navigator extension
 * Reorders job posting info in the modal: key info at top (highlighted),
 * then job description, responsibilities, skills, targeted degrees, then the rest.
 */

(function() {
  'use strict';

  // Check if we're on WaterlooWorks
  if (!window.location.href.includes('waterlooworks.uwaterloo.ca')) {
    return;
  }

  console.log('[Azure] Job Info Rearranger loading...');

  // Global state
  let modalObserver = null;
  let isEnhancing = false;
  let settings = null;

  // Default settings
  const DEFAULT_SETTINGS = {
    jobRearrangerEnabled: true,
    jobRearrangerPriorityKeys: ['duration', 'location', 'compensation', 'deadline', 'method'],
    jobRearrangerStandardOrder: ['job_description', 'responsibilities', 'required_skills', 'targeted_degrees']
  };

  // Label to key mapping (matches actual WaterlooWorks labels)
  const LABEL_TO_KEY = {
    'work term duration': 'duration',
    'work term': 'work_term',
    'region': 'location',
    'job - city': 'city',
    'job - province/state': 'province',
    'job - country': 'country',
    'job - address line one': 'address',
    'job - postal/zip code': 'postal',
    'employment location arrangement': 'arrangement',
    'compensation and benefits': 'compensation',
    'application deadline': 'deadline',
    'application delivery': 'method',
    'if by website, go to': 'external_url',
    'job summary': 'job_description',
    'job responsibilities': 'responsibilities',
    'required skills': 'required_skills',
    'targeted degrees and disciplines': 'targeted_degrees'
  };

  // Load settings from storage
  async function loadSettings() {
    try {
      if (window.AzureStorage) {
        const loaded = await window.AzureStorage.getSettings([
          'jobRearrangerEnabled',
          'jobRearrangerPriorityKeys',
          'jobRearrangerStandardOrder'
        ]);
        settings = {
          jobRearrangerEnabled: loaded.jobRearrangerEnabled !== false,
          jobRearrangerPriorityKeys: loaded.jobRearrangerPriorityKeys || DEFAULT_SETTINGS.jobRearrangerPriorityKeys,
          jobRearrangerStandardOrder: loaded.jobRearrangerStandardOrder || DEFAULT_SETTINGS.jobRearrangerStandardOrder
        };
      } else {
        settings = DEFAULT_SETTINGS;
      }
      console.log('[Azure] Rearranger settings loaded:', settings);
    } catch (e) {
      console.error('[Azure] Failed to load settings:', e);
      settings = DEFAULT_SETTINGS;
    }
  }

  // Check if modal is open
  function isModalOpen() {
    return document.querySelector('div[data-v-70e7ded6-s]') !== null;
  }

  // Get label key from text
  function getLabelKey(labelText) {
    const lower = labelText.trim().toLowerCase().replace(/:$/, '');
    if (LABEL_TO_KEY[lower]) return LABEL_TO_KEY[lower];
    
    // Partial match
    for (const [pattern, key] of Object.entries(LABEL_TO_KEY)) {
      if (lower.includes(pattern) || pattern.includes(lower)) {
        return key;
      }
    }
    return null;
  }

  // Parse all fields from the modal
  function parseFieldsFromModal(modalContainer) {
    const fields = {};
    const fieldElements = {};
    
    // Find all .tag__key-value-list elements
    const keyValueLists = modalContainer.querySelectorAll('.tag__key-value-list');
    console.log(`[Azure] Found ${keyValueLists.length} key-value lists`);
    
    keyValueLists.forEach(kvList => {
      const parentDiv = kvList.parentElement;
      if (!parentDiv) return;
      
      // Find the label
      const labelElement = kvList.querySelector('span.label, .label');
      if (!labelElement) return;
      
      const labelText = labelElement.textContent.trim().replace(/:$/, '');
      if (!labelText) return;
      
      // Get the value
      const valueElement = kvList.querySelector('p');
      let value = '';
      if (valueElement) {
        value = valueElement.textContent.trim();
        // Also check for tables (like Level field)
        const table = kvList.querySelector('.container--table, table');
        if (table && !value) {
          value = table.textContent.trim();
        }
      }
      
      const key = getLabelKey(labelText);
      if (key) {
        fields[key] = { label: labelText, value: value, element: parentDiv };
        fieldElements[key] = parentDiv;
        console.log(`[Azure] Parsed field: ${labelText} -> ${key}`);
      }
    });
    
    return { fields, fieldElements };
  }

  // Build location from city + province
  function buildLocation(fields) {
    const parts = [];
    if (fields.city) parts.push(fields.city.value);
    if (fields.province) parts.push(fields.province.value);
    if (parts.length > 0) {
      return parts.join(', ');
    }
    // Fallback to region if present
    if (fields.location) return fields.location.value;
    return null;
  }

  // Create the priority info box
  function createPriorityBox(fields) {
    if (!settings.jobRearrangerEnabled) return null;
    
    const priorityKeys = settings.jobRearrangerPriorityKeys || [];
    const priorityItems = [];
    
    // Duration
    if (priorityKeys.includes('duration') && fields.duration) {
      priorityItems.push({
        label: 'Work Term Duration',
        value: fields.duration.value,
        key: 'duration'
      });
    }
    
    // Location (city + province)
    if (priorityKeys.includes('location')) {
      const locationValue = buildLocation(fields);
      if (locationValue) {
        priorityItems.push({
          label: 'Location',
          value: locationValue,
          key: 'location'
        });
      }
    }
    
    // Compensation
    if (priorityKeys.includes('compensation') && fields.compensation) {
      priorityItems.push({
        label: 'Compensation & Benefits',
        value: fields.compensation.value,
        key: 'compensation'
      });
    }
    
    // Deadline
    if (priorityKeys.includes('deadline') && fields.deadline) {
      priorityItems.push({
        label: 'Application Deadline',
        value: fields.deadline.value,
        key: 'deadline'
      });
    }
    
    // Application method (only if not WaterlooWorks)
    if (priorityKeys.includes('method') && fields.method) {
      const methodLower = fields.method.value.toLowerCase().trim();
      const isRegular = /^waterlooworks$/i.test(methodLower) || 
                        methodLower.includes('waterlooworks') ||
                        methodLower === '';
      if (!isRegular) {
        priorityItems.push({
          label: 'Apply Via',
          value: fields.method.value,
          key: 'method'
        });
        // Also add the URL if present
        if (fields.external_url && fields.external_url.value) {
          priorityItems.push({
            label: 'Application URL',
            value: fields.external_url.value,
            key: 'external_url',
            isLink: true
          });
        }
      }
    }
    
    if (priorityItems.length === 0) return null;
    
    // Create the box
    const box = document.createElement('div');
    box.className = 'azure-priority-box';
    box.style.cssText = `
      background: linear-gradient(135deg, #1a5276 0%, #2471a3 100%);
      border-radius: 12px;
      padding: 0;
      margin: 0 0 24px 0;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    `;
    
    const header = document.createElement('div');
    header.className = 'azure-priority-header';
    header.textContent = 'Key Information';
    header.style.cssText = `
      background: rgba(0, 0, 0, 0.2);
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      padding: 12px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;
    box.appendChild(header);
    
    const content = document.createElement('div');
    content.className = 'azure-priority-content';
    content.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1px;
      background: rgba(0, 0, 0, 0.1);
    `;
    
    priorityItems.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = `azure-priority-item azure-priority-${item.key}`;
      itemDiv.style.cssText = `
        background: rgba(255, 255, 255, 0.05);
        padding: 14px 20px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      `;
      
      const labelSpan = document.createElement('span');
      labelSpan.className = 'azure-priority-label';
      labelSpan.textContent = item.label;
      labelSpan.style.cssText = `
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: rgba(255, 255, 255, 0.7);
      `;
      
      const valueSpan = document.createElement('span');
      valueSpan.className = 'azure-priority-value';
      valueSpan.style.cssText = `
        font-size: 15px;
        font-weight: 600;
        color: #fff;
        line-height: 1.4;
        word-break: break-word;
      `;
      
      if (item.isLink && item.value.startsWith('http')) {
        const link = document.createElement('a');
        link.href = item.value;
        link.target = '_blank';
        link.textContent = item.value.length > 50 ? item.value.substring(0, 50) + '...' : item.value;
        link.style.cssText = 'color: #85c1e9; text-decoration: underline;';
        valueSpan.appendChild(link);
      } else {
        valueSpan.textContent = item.value;
      }
      
      // Color coding for specific fields
      if (item.key === 'duration') valueSpan.style.color = '#82e0aa';
      if (item.key === 'location') valueSpan.style.color = '#85c1e9';
      if (item.key === 'compensation') valueSpan.style.color = '#58d68d';
      if (item.key === 'deadline') valueSpan.style.color = '#f1948a';
      if (item.key === 'method') valueSpan.style.color = '#f8c471';
      
      itemDiv.appendChild(labelSpan);
      itemDiv.appendChild(valueSpan);
      content.appendChild(itemDiv);
    });
    
    box.appendChild(content);
    return box;
  }

  // Main enhancement function
  function enhanceModal() {
    if (!settings || !settings.jobRearrangerEnabled) {
      console.log('[Azure] Rearranger disabled, skipping');
      return;
    }
    
    console.log('[Azure] Starting modal enhancement...');
    
    if (isEnhancing) {
      console.log('[Azure] Already enhancing, skipping');
      return;
    }
    
    const modalContainer = document.querySelector('div[data-v-70e7ded6-s]');
    if (!modalContainer) {
      console.log('[Azure] Modal container not found');
      return;
    }
    
    // Check if already enhanced
    if (modalContainer.dataset.azureEnhanced === 'true') {
      console.log('[Azure] Modal already enhanced');
      return;
    }
    
    // Only enhance OVERVIEW tab
    const activeTab = modalContainer.querySelector('[role="tab"][aria-selected="true"], .tab-item .items.active');
    if (activeTab) {
      const tabText = activeTab.textContent.trim().toUpperCase();
      if (!tabText.includes('OVERVIEW')) {
        console.log(`[Azure] Not on OVERVIEW tab (current: ${tabText}), skipping`);
        return;
      }
    }
    
    isEnhancing = true;
    
    try {
      // Parse all fields
      const { fields, fieldElements } = parseFieldsFromModal(modalContainer);
      console.log('[Azure] Parsed fields:', Object.keys(fields));
      
      if (Object.keys(fields).length === 0) {
        console.log('[Azure] No fields found');
        isEnhancing = false;
        return;
      }
      
      // Find the Job Posting Information panel
      const panels = modalContainer.querySelectorAll('div[id^="panel_"]');
      let jobInfoPanel = null;
      
      for (const panel of panels) {
        const h4 = panel.querySelector('h4');
        if (h4 && h4.textContent.includes('Job Posting Information')) {
          jobInfoPanel = panel;
          break;
        }
      }
      
      if (!jobInfoPanel) {
        console.log('[Azure] Job Posting Information panel not found');
        isEnhancing = false;
        return;
      }
      
      // Create and insert the priority box
      const existingBox = modalContainer.querySelector('.azure-priority-box');
      if (existingBox) existingBox.remove();
      
      const priorityBox = createPriorityBox(fields);
      if (priorityBox) {
        // Insert at the top of the Job Posting Information panel
        const h4 = jobInfoPanel.querySelector('h4');
        if (h4 && h4.nextSibling) {
          jobInfoPanel.insertBefore(priorityBox, h4.nextSibling);
        } else {
          jobInfoPanel.insertBefore(priorityBox, jobInfoPanel.firstChild);
        }
        console.log('[Azure] Priority box inserted');
      }
      
      // Hide the original priority fields (they're shown in the box)
      const priorityKeys = settings.jobRearrangerPriorityKeys || [];
      const locationKeys = ['city', 'province', 'country', 'address', 'postal'];
      
      for (const key of priorityKeys) {
        if (key === 'location') {
          // Hide all location-related fields
          locationKeys.forEach(lk => {
            if (fieldElements[lk]) {
              fieldElements[lk].style.display = 'none';
            }
          });
        } else if (fieldElements[key]) {
          fieldElements[key].style.display = 'none';
        }
      }
      
      // Also hide deadline and method from their original locations (in Application Information panel)
      if (fieldElements.deadline) fieldElements.deadline.style.display = 'none';
      if (fieldElements.method) fieldElements.method.style.display = 'none';
      if (fieldElements.external_url) fieldElements.external_url.style.display = 'none';
      
      modalContainer.dataset.azureEnhanced = 'true';
      console.log('[Azure] Modal enhancement complete');
      
    } catch (e) {
      console.error('[Azure] Enhancement error:', e);
    }
    
    isEnhancing = false;
  }

  // Setup MutationObserver for modal detection
  function setupModalObserver() {
    if (modalObserver) return;
    
    modalObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check for added nodes (modal opened)
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const modal = node.matches && node.matches('div[data-v-70e7ded6-s]') ? node :
                         node.querySelector && node.querySelector('div[data-v-70e7ded6-s]');
            
            if (modal) {
              console.log('[Azure] Modal detected via MutationObserver');
              
              // Wait for content to load then enhance
              setTimeout(() => {
                const tabPanel = modal.querySelector('[role="tabpanel"]');
                if (tabPanel && tabPanel.querySelector('div[id^="panel_"]')) {
                  enhanceModal();
                } else {
                  // Content not ready, wait more
                  setTimeout(enhanceModal, 200);
                }
              }, 100);
            }
          }
        }
        
        // Check for removed nodes (modal closed) - reset enhanced flag
        for (const node of mutation.removedNodes) {
          if (node.nodeType === 1 && node.matches && node.matches('div[data-v-70e7ded6-s]')) {
            console.log('[Azure] Modal closed');
          }
        }
      }
    });
    
    modalObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    console.log('[Azure] Modal observer setup complete');
  }

  // Initialize
  async function initialize() {
    console.log('[Azure] Initializing Job Info Rearranger...');
    
    await loadSettings();
    
    if (!settings.jobRearrangerEnabled) {
      console.log('[Azure] Rearranger disabled by user');
      return;
    }
    
    setupModalObserver();
    
    // If modal is already open, enhance it
    if (isModalOpen()) {
      console.log('[Azure] Modal already open, enhancing...');
      setTimeout(enhanceModal, 500);
    }
    
    console.log('[Azure] Job Info Rearranger ready');
  }

  // Start initialization
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initialize();
  } else {
    document.addEventListener('DOMContentLoaded', initialize);
  }

  // Export for external access
  window.AzureJobInfoRearranger = {
    init: initialize,
    enhance: enhanceModal,
    isModalOpen: isModalOpen
  };

})();
