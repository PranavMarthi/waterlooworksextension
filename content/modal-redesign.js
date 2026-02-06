/**
 * Modal Redesign for WaterlooActuallyWorks
 * Uses DOM parsing to extract job sections
 */

(function() {
  'use strict';

  if (!window.location.href.includes('waterlooworks.uwaterloo.ca')) return;

  console.log('[WAW] Modal Redesign loading...');

  // Cache parsed results by job ID
  const cache = new Map();
  
  // Track saved jobs (persist in localStorage)
  let savedJobs = new Set(JSON.parse(localStorage.getItem('waw-saved-jobs') || '[]'));
  
  function isJobSaved(jobId) {
    return jobId && savedJobs.has(jobId);
  }
  
  function markJobAsSaved(jobId) {
    if (!jobId) return;
    savedJobs.add(jobId);
    localStorage.setItem('waw-saved-jobs', JSON.stringify([...savedJobs]));
    updateSavedBadge(true);
  }
  
  function updateSavedBadge(isSaved) {
    const badge = document.getElementById('waw-saved-badge');
    if (badge) {
      badge.classList.toggle('visible', isSaved);
    }
  }

  let overlay = null;
  let isActive = false;
  let currentWWModal = null; // Reference to the current WaterlooWorks modal
  let currentJobId = null; // Track current job ID for saved status
  let suppressHandleUntil = 0;
  let suppressObserver = false;
  let navigationIntentUntil = 0;

  // ============================================
  // AGGRESSIVE: Hide modal instantly via inline styles
  // Keep elements in DOM for button triggering
  // ============================================
  
  function hideOriginalModal(el) {
    if (!el || el.id === 'waw-overlay') return;
    el.style.cssText = 'position:fixed!important;top:-9999px!important;left:-9999px!important;visibility:hidden!important;opacity:0!important;pointer-events:auto!important;';
  }

  // Fast observer to catch and hide modals IMMEDIATELY
  const hideObserver = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        // Check if it's the WW job modal or contains it (avoid matching generic [role="dialog"])
        if (node.matches?.('div[data-v-70e7ded6-s], .modal__content, .modal__overlay')) {
          hideOriginalModal(node);
        }
        // Also check children
        const modal = node.querySelector?.('div[data-v-70e7ded6-s], .modal__content, .modal__overlay');
        if (modal) hideOriginalModal(modal);
      }
    }
  });
  hideObserver.observe(document.documentElement, { childList: true, subtree: true });
  
  // Also hide any existing modals right now
  document.querySelectorAll('div[data-v-70e7ded6-s], .modal__content, .modal__overlay').forEach(hideOriginalModal);

  // Backup CSS styles
  const style = document.createElement('style');
  style.id = 'waw-modal-hide-backup';
  style.textContent = `
    body.waw-active { overflow: hidden; }
    #waw-overlay { z-index: 99999999 !important; }
  `;
  document.head.appendChild(style);

  // ============================================
  // Job Navigation (our own implementation)
  // ============================================
  
  let jobLinks = [];
  let currentJobIndex = -1;
  let isNavigating = false;
  let lastClickedJobId = null;
  let navGeneration = 0; // Incremented each navigation to invalidate stale callbacks

  const JOB_LINK_SELECTORS = [
    'a.overflow--ellipsis',
    'a.posting-title',
    'a[href="javascript:void(0)"]',
    'a[onclick]'
  ];

  function refreshJobLinks() {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    const links = [];

    rows.forEach((row) => {
      let link = null;
      for (const selector of JOB_LINK_SELECTORS) {
        link = row.querySelector(selector);
        if (link) break;
      }
      if (!link) {
        link = row.querySelector('a[href*="javascript"], a[onclick]');
      }
      if (link) links.push(link);
    });

    jobLinks = links;
    if (jobLinks.length === 0) {
      jobLinks = Array.from(document.querySelectorAll('tbody a'));
    }

    jobLinks.forEach((link, index) => {
      const row = link.closest('tr');
      if (row) {
        row.dataset.wawModalIndex = index;
        if (!row.dataset.wawModalClickBound) {
          row.addEventListener('click', () => {
            const idx = Number(row.dataset.wawModalIndex);
            if (Number.isFinite(idx)) currentJobIndex = idx;
            const jid = getJobIdFromRow(row);
            if (jid) lastClickedJobId = jid;
          });
          row.dataset.wawModalClickBound = 'true';
        }
      }
      if (!link.dataset.wawModalClickBound) {
        link.addEventListener('click', () => {
          currentJobIndex = index;
          const jid = getJobIdFromRow(row);
          if (jid) lastClickedJobId = jid;
          navigationIntentUntil = Date.now() + 1200;
        });
        link.dataset.wawModalClickBound = 'true';
      }
    });
    console.log('[WAW] Found job links:', jobLinks.length);
    return jobLinks;
  }

  function getJobIdFromRow(row) {
    if (!row) return null;
    const checkbox = row.querySelector('input[type="checkbox"][name="dataViewerSelection"]');
    if (checkbox && checkbox.value) {
      return String(checkbox.value);
    }

    const firstTh = row.querySelector('th');
    if (firstTh) {
      const spans = firstTh.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent.trim();
        if (/^\d{6}$/.test(text)) {
          return text;
        }
      }
    }

    const match = row.textContent.match(/\b\d{6}\b/);
    if (match) return match[0];
    return null;
  }

  function safeClick(element) {
    if (!element) return false;
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    const isAnchor = tag === 'a';
    const href = isAnchor ? element.getAttribute('href') || '' : '';
    const isJavascriptHref = isAnchor && href.trim().toLowerCase().startsWith('javascript:');
    let restoreHref = null;

    if (isJavascriptHref) {
      restoreHref = href;
      element.setAttribute('href', '#');
      element.addEventListener('click', (event) => event.preventDefault(), { capture: true, once: true });
    }

    element.click();

    if (restoreHref !== null) {
      element.setAttribute('href', restoreHref);
    }
    return true;
  }

  function getCurrentJobId() {
    // Try to get current job ID from the hidden WW modal
    const modal = document.querySelector('div[data-v-70e7ded6-s], .modal__content');
    if (modal) {
      const jobIdEl = modal.querySelector('[class*="job-id"], [data-job-id]');
      if (jobIdEl) return jobIdEl.textContent?.trim() || jobIdEl.dataset?.jobId;
      // Try from URL or hidden input
      const match = modal.innerHTML.match(/job[_-]?id["\s:=]+["']?(\d+)/i);
      if (match) return match[1];
    }
    return currentJobId || lastClickedJobId || null;
  }

  document.addEventListener('click', (event) => {
    const link = event.target?.closest?.('a');
    if (!link) return;
    const row = link.closest('tr');
    if (!row) return;
    if (jobLinks.length === 0) refreshJobLinks();
    const idx = Number(row.dataset.wawModalIndex);
    if (Number.isFinite(idx)) currentJobIndex = idx;
    const jid = getJobIdFromRow(row);
    if (jid) lastClickedJobId = jid;
  }, true);

  function findCurrentJobIndex() {
    if (jobLinks.length === 0) refreshJobLinks();
    
    const currentId = getCurrentJobId();
    if (currentId) {
      for (let i = 0; i < jobLinks.length; i++) {
        const row = jobLinks[i].closest('tr');
        const rowId = getJobIdFromRow(row) || row?.dataset?.jobId || row?.querySelector('[data-job-id]')?.dataset?.jobId;
        if (rowId === currentId) {
          return i;
        }
        // Also check if the link contains the ID
        if (jobLinks[i].href?.includes(currentId) || jobLinks[i].onclick?.toString()?.includes(currentId)) {
          return i;
        }
      }
    }
    return currentJobIndex >= 0 ? currentJobIndex : 0;
  }

  function syncJobIndexFromId(jobId) {
    if (!jobId) return;
    if (jobLinks.length === 0) refreshJobLinks();
    for (let i = 0; i < jobLinks.length; i++) {
      const row = jobLinks[i].closest('tr');
      const rowId = getJobIdFromRow(row) || row?.dataset?.jobId || row?.querySelector('[data-job-id]')?.dataset?.jobId;
      if (rowId === jobId) {
        currentJobIndex = i;
        return;
      }
      if (jobLinks[i].href?.includes(jobId) || jobLinks[i].onclick?.toString()?.includes(jobId)) {
        currentJobIndex = i;
        return;
      }
    }
    const selected = document.querySelector('tr.waw-selected');
    if (selected?.dataset?.wawModalIndex) {
      const idx = Number(selected.dataset.wawModalIndex);
      if (Number.isFinite(idx)) currentJobIndex = idx;
    }
  }

  function showNavNotification(message) {
    // Lightweight notification for navigation edge cases
    const existing = document.getElementById('waw-nav-notification');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'waw-nav-notification';
    el.textContent = message;
    el.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.75); color: white; padding: 10px 20px;
      border-radius: 8px; font-size: 14px; font-weight: 500; z-index: 999999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: waw-overlay-in 0.2s ease;
    `;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, 1500);
  }

  function closeHiddenWWModal() {
    const closeBtn = document.querySelector('button[aria-label="Close"], .modal__close');
    if (closeBtn) closeBtn.click();
  }

  /**
   * Poll for a WaterlooWorks modal to appear with content.
   * Resolves with the modal element, or null on timeout.
   */
  function pollForModal(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const modal = document.querySelector(
          '.modal__content.height--100, div[data-v-70e7ded6-s] .modal__content, .modal__content'
        );
        if (modal) {
          const hasTitle = modal.querySelector('.dashboard-header__posting-title h2, h2.h3');
          const hasFields = modal.querySelectorAll('.tag__key-value-list').length > 3;
          if (hasTitle || hasFields) {
            resolve(modal);
            return;
          }
        }
        if (Date.now() - start < timeoutMs) {
          setTimeout(check, 100);
        } else {
          // Last-ditch: return whatever modal exists even without full content
          resolve(modal || null);
        }
      };
      setTimeout(check, 80);
    });
  }

  /**
   * After a pagination button is clicked, poll until the job table
   * has new content (different job IDs), then open the target job.
   * @param {'first'|'last'} position - which job to open on the new page
   */
  function waitForTableUpdateThenOpen(position, gen) {
    const oldJobIds = new Set(
      jobLinks.map(link => {
        const row = link.closest('tr');
        return row ? getJobIdFromRow(row) : null;
      }).filter(Boolean)
    );

    console.log(`[WAW] Waiting for table update, will open ${position} job. Old jobs: ${oldJobIds.size}`);

    let attempts = 0;
    const maxAttempts = 40; // ~4s at 100ms intervals

    const check = () => {
      // Abort if a newer navigation has started
      if (gen !== navGeneration) return;

      attempts++;
      refreshJobLinks();

      const newJobIds = new Set(
        jobLinks.map(link => {
          const row = link.closest('tr');
          return row ? getJobIdFromRow(row) : null;
        }).filter(Boolean)
      );

      const hasChanged = newJobIds.size > 0 &&
        ![...newJobIds].every(id => oldJobIds.has(id));

      if (hasChanged) {
        console.log('[WAW] Table content changed, opening ' + position + ' job');
        setTimeout(() => {
          if (gen !== navGeneration) return;
          refreshJobLinks();
          if (jobLinks.length === 0) {
            console.log('[WAW] No job links after pagination');
            isNavigating = false;
            return;
          }

          const targetIndex = position === 'first' ? 0 : jobLinks.length - 1;
          currentJobIndex = targetIndex;
          const link = jobLinks[targetIndex];

          if (link) {
            navigationIntentUntil = Date.now() + 1200;
            safeClick(link);
            pollForModal(3000).then((modal) => {
              if (gen !== navGeneration) return;
              if (modal && !isActive) {
                handleModal(modal);
              }
              isNavigating = false;
            });
          } else {
            isNavigating = false;
          }
        }, 300);
      } else if (attempts < maxAttempts) {
        setTimeout(check, 100);
      } else {
        console.log('[WAW] Pagination table watch timed out');
        showNavNotification('Page change timed out');
        isNavigating = false;
      }
    };

    setTimeout(check, 100);
  }

  function navigateToJob(direction) {
    console.log('[WAW] navigateToJob called, direction:', direction);
    
    if (isNavigating) return;
    isNavigating = true;
    const gen = ++navGeneration; // Tag this navigation cycle
    navigationIntentUntil = Date.now() + 5000;

    if (jobLinks.length === 0) refreshJobLinks();
    if (jobLinks.length === 0) {
      console.log('[WAW] No job links found');
      isNavigating = false;
      return;
    }

    // Find current position
    currentJobIndex = findCurrentJobIndex();
    console.log('[WAW] Current job index:', currentJobIndex);

    // Calculate new index
    let newIndex = currentJobIndex + direction;

    // Handle pagination / edge cases instead of wrapping
    if (newIndex < 0) {
      // At the beginning of the page — try previous page
      const prevPageBtn = document.querySelector('a[aria-label="Go to previous page"]');
      if (prevPageBtn) {
        console.log('[WAW] Navigating to previous page (last job)');
        closeHiddenWWModal();
        waitForTableUpdateThenOpen('last', gen);
        safeClick(prevPageBtn);
        return; // isNavigating will be reset by waitForTableUpdateThenOpen
      }
      // No previous page — we're on the very first job
      showNavNotification('First job on first page');
      isNavigating = false;
      return;
    }

    if (newIndex >= jobLinks.length) {
      // At the end of the page — try next page
      const nextPageBtn = document.querySelector('a[aria-label="Go to next page"]');
      if (nextPageBtn) {
        console.log('[WAW] Navigating to next page (first job)');
        closeHiddenWWModal();
        waitForTableUpdateThenOpen('first', gen);
        safeClick(nextPageBtn);
        return; // isNavigating will be reset by waitForTableUpdateThenOpen
      }
      // No next page — we're on the very last job
      showNavNotification('Last job on last page');
      isNavigating = false;
      return;
    }
    
    console.log('[WAW] New job index:', newIndex);
    currentJobIndex = newIndex;

    // Close the hidden WW modal first
    closeHiddenWWModal();

    // Click the new job link after a short delay, then poll for modal
    setTimeout(() => {
      if (gen !== navGeneration) return; // Stale navigation, abort
      const link = jobLinks[newIndex];
      if (link) {
        console.log('[WAW] Clicking job link:', link.textContent?.substring(0, 50));
        safeClick(link);
        
        // Poll for the modal to appear with content (up to 3s)
        pollForModal(3000).then((modal) => {
          if (gen !== navGeneration) return; // Stale navigation, abort
          if (modal && !isActive) {
            console.log('[WAW] Modal found after navigation, handling...');
            handleModal(modal);
          } else if (!modal) {
            console.log('[WAW] Modal not found after polling');
            showNavNotification('Could not load job posting');
          }
          isNavigating = false;
        });
      } else {
        isNavigating = false;
      }
    }, 150);
  }

  // ============================================
  // Parse content sections from DOM
  // ============================================

  function parseContentSections(modal) {
    const data = { description: '', responsibilities: '', skills: '' };
    
    // Get the full text content of the modal
    const fullText = modal.innerText || modal.textContent || '';
    
    // Define the sections we want and the headers that follow them
    const ALL_HEADERS = [
      'Work Term:', 'Job Type:', 'Job Title:', 'Number of Job Openings:', 'Level:',
      'Region:', 'Job - Address Line One:', 'Job - City:', 'Job - Province/State:',
      'Job - Postal/Zip Code:', 'Job - Country:', 'Employment Location Arrangement:',
      'Work Term Duration:', 'Special Work Term Start/End Date Considerations:',
      'Job Summary:', 'Job Responsibilities:', 'Required Skills:',
      'Transportation and Housing:', 'Compensation and Benefits:',
      'Targeted Degrees and Disciplines:', 'Application Deadline',
      'Application Documents Required:', 'Additional Application Information:',
      'Application Method:', 'Organization:', 'Division:'
    ];
    
    // Extract section content between headers
    function extractSection(headerName) {
      const headerIndex = fullText.indexOf(headerName);
      if (headerIndex === -1) return '';
      
      const contentStart = headerIndex + headerName.length;
      
      // Find the next header
      let nextHeaderIndex = fullText.length;
      for (const h of ALL_HEADERS) {
        if (h === headerName) continue;
        const idx = fullText.indexOf(h, contentStart);
        if (idx !== -1 && idx < nextHeaderIndex) {
          nextHeaderIndex = idx;
        }
      }
      
      let content = fullText.substring(contentStart, nextHeaderIndex).trim();
      
      // Clean up the content
      content = content.replace(/\n\s*\n\s*\n/g, '\n\n'); // Remove excessive newlines
      content = content.replace(/^\s+/gm, ''); // Remove leading whitespace from lines
      
      return content;
    }
    
    // Extract our target sections
    data.description = extractSection('Job Summary:');
    data.responsibilities = extractSection('Job Responsibilities:');
    data.skills = extractSection('Required Skills:');
    
    console.log('[WAW] Parsed description:', data.description.substring(0, 100) + '...');
    console.log('[WAW] Parsed responsibilities:', data.responsibilities.substring(0, 100) + '...');
    console.log('[WAW] Parsed skills:', data.skills.substring(0, 100) + '...');
    
    return data;
  }

  // ============================================
  // Company URL lookup (Clearbit + Google fallback)
  // ============================================
  
  const companyUrlCache = new Map();
  
  async function fetchCompanyUrl(companyName) {
    if (!companyName) return null;
    
    // Check cache first
    if (companyUrlCache.has(companyName)) {
      return companyUrlCache.get(companyName);
    }
    
    // Try Clearbit API first
    try {
      const response = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(companyName)}`);
      if (response.ok) {
        const results = await response.json();
        if (results && results.length > 0 && results[0].domain) {
          const url = `https://${results[0].domain}`;
          companyUrlCache.set(companyName, { url, isSearch: false });
          console.log('[WAW] Found company URL via Clearbit:', url);
          return { url, isSearch: false };
        }
      }
    } catch (e) {
      console.log('[WAW] Clearbit API error:', e);
    }
    
    // Fallback: Google search link
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(companyName + ' company')}`;
    companyUrlCache.set(companyName, { url: googleUrl, isSearch: true });
    console.log('[WAW] Using Google search fallback for:', companyName);
    return { url: googleUrl, isSearch: true };
  }

  // ============================================
  // Parse basic job data (header/sidebar)
  // ============================================

  function parseBasicJobData(modal) {
    const data = {
      title: '', company: '', location: '', jobId: '',
      duration: '', compensation: '', deadline: '',
      supplementaryRequired: 'No'
    };

    const h2 = modal.querySelector('.dashboard-header__posting-title h2, h2.h3');
    if (h2) data.title = h2.textContent.trim();

    const jobIdEl = modal.querySelector('.dashboard-header__posting-title .tag-label');
    if (jobIdEl) {
      const match = jobIdEl.textContent.match(/\d{6}/);
      if (match) data.jobId = match[0];
    }

    const headerInfo = modal.querySelector('.dashboard-header--mini__content .font--14');
    if (headerInfo) {
      const spans = headerInfo.querySelectorAll('span');
      if (spans[0]) data.company = spans[0].textContent.trim();
      if (spans[1]) data.location = spans[1].textContent.trim();
    }

    modal.querySelectorAll('.tag__key-value-list').forEach(kv => {
      const labelEl = kv.querySelector('.label');
      if (!labelEl) return;
      const label = labelEl.textContent.toLowerCase().trim();
      const pEl = kv.querySelector('p');
      if (!pEl) return;
      const value = pEl.textContent.trim();

      if (label.includes('work term duration')) data.duration = value;
      else if (label.includes('job - city')) data.location = value;
      else if (label.includes('job - province') && data.location && !data.location.includes(value)) {
        data.location += ', ' + value;
      }
      else if (label.includes('compensation')) data.compensation = value;
      else if (label.includes('application deadline')) data.deadline = value;
    });

    return data;
  }

  function esc(t) { return t ? t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }
  
  // Clean up filler/BS from job descriptions
  function cleanContent(text) {
    if (!text) return '';
    
    // Filler phrases to remove
    const fillerPhrases = [
      /^(we are |we're )?(looking for|seeking|searching for)[^.!?\n]*[.!?\n]/gi,
      /^(the |an? )?(ideal|perfect|right) candidate[^.!?\n]*[.!?\n]/gi,
      /^(this is )?(a |an )?(great|excellent|amazing|exciting|unique) opportunity[^.!?\n]*[.!?\n]/gi,
      /^(you will |you'll )?(have the |get the )?(opportunity|chance) to[^.!?\n]*[.!?\n]/gi,
      /^(join|be part of) (our|a) (dynamic|innovative|growing|world-class)[^.!?\n]*[.!?\n]/gi,
      /^(if you('re| are) )?(passionate|excited|enthusiastic) about[^.!?\n]*[.!?\n]/gi,
      /we (offer|provide) (a |an )?(competitive|comprehensive)[^.!?\n]*[.!?\n]/gi,
      /equal opportunity employer[^.!?\n]*/gi,
      /we (value|celebrate) diversity[^.!?\n]*/gi,
      /apply (now|today)[^.!?\n]*/gi,
    ];
    
    let cleaned = text;
    
    // Remove filler phrases
    fillerPhrases.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });
    
    // Remove redundant bullet markers
    cleaned = cleaned.replace(/^[•\-\*]\s*/gm, '');
    
    // Remove empty lines and excessive whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    
    return cleaned;
  }
  
  function fmt(t) {
    if (!t) return '';
    const cleaned = cleanContent(t);
    const lines = cleaned.split(/\n+/)
      .map(l => l.trim())
      .map(l => l.replace(/^[•\-\*\u2022\u2023\u25E6\u2043\u2219]+\s*/g, '')) // Remove existing bullets
      .filter(l => l && l.length > 2);
    
    // If only a few lines, show as paragraphs; otherwise as bullets
    if (lines.length <= 2) {
      return lines.map(l => `<p style="margin:0 0 8px">${esc(l)}</p>`).join('');
    }
    return lines.map(l => `<p style="margin:0 0 2px">• ${esc(l)}</p>`).join('');
  }

  // ============================================
  // Show Overlay
  // ============================================

  function showOverlay(data) {
    if (overlay) overlay.remove();
    
    overlay = document.createElement('div');
    overlay.id = 'waw-overlay';
    overlay.innerHTML = `
      <style>
        @keyframes waw-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes waw-card-in { from { opacity: 0; transform: scale(0.98) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        #waw-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.52); display: flex; align-items: center; justify-content: center;
          z-index: 9999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          animation: waw-overlay-in 0.2s ease;
        }
        #waw-card {
          display: flex; width: 92%; max-width: 980px; max-height: 85vh;
          background: #f0f4f8; border-radius: 24px;
          box-shadow: 0 32px 64px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04);
          overflow: hidden; position: relative;
          transition: box-shadow 0.2s ease, transform 0.2s ease;
          animation: waw-card-in 0.25s ease;
        }
        #waw-card:focus-within { box-shadow: 0 40px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06); }
        #waw-main { flex: 1; padding: 40px 44px; display: flex; flex-direction: column; overflow: hidden; }
        #waw-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
        #waw-title {
          font-size: 28px; font-weight: 700; color: #0f172a; margin: 0; flex: 1;
          line-height: 1.25; letter-spacing: -0.02em;
        }
        #waw-saved-badge { display: none; padding: 6px 12px; background: #0d9488; color: white; border-radius: 10px; font-size: 12px; font-weight: 600; white-space: nowrap; }
        #waw-saved-badge.visible { display: inline-block; }
        #waw-company { font-size: 16px; color: #475569; margin-bottom: 24px; font-weight: 500; }
        #waw-company a { color: #0d9488; text-decoration: none; border-bottom: 1px solid transparent; transition: color 0.15s ease, border-color 0.15s ease; }
        #waw-company a:hover { color: #0f766e; border-bottom-color: #0d9488; }
        #waw-body { flex: 1; overflow-y: auto; padding-right: 14px; }
        #waw-body::-webkit-scrollbar { width: 6px; }
        #waw-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        #waw-body::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .waw-section { margin-bottom: 28px; }
        .waw-section-title {
          font-size: 11px; font-weight: 700; color: #0d9488; text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 10px;
        }
        .waw-section-content { font-size: 15px; color: #334155; line-height: 1.8; }
        #waw-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 22px; border-top: 1px solid rgba(0,0,0,0.06); }
        #waw-actions { display: flex; gap: 10px; }
        .waw-action-btn {
          padding: 12px 20px; background: #e2e8f0; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; color: #334155;
          cursor: pointer; display: flex; align-items: center; gap: 6px;
          transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
        }
        .waw-action-btn:hover { background: #cbd5e1; transform: translateY(-1px); }
        .waw-action-btn:active { transform: translateY(0); }
        #waw-apply { background: #0d9488; color: #fff; }
        #waw-apply:hover { background: #0f766e; color: #fff; }
        #waw-nav { display: flex; background: #e2e8f0; border-radius: 14px; overflow: hidden; }
        .waw-nav-btn {
          width: 60px; height: 46px; border: none; background: transparent; font-size: 18px; color: #475569; cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .waw-nav-btn:hover { background: #0d9488; color: #fff; }
        .waw-nav-btn:first-child { border-right: 1px solid rgba(0,0,0,0.08); }
        #waw-sidebar { width: 270px; padding: 36px 24px; background: #e8eef4; flex-shrink: 0; border-left: 1px solid rgba(0,0,0,0.05); }
        .waw-info { margin-bottom: 20px; }
        .waw-info-label { font-size: 11px; font-weight: 700; color: #0d9488; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
        .waw-info-value { font-size: 14px; color: #475569; line-height: 1.55; }
        #waw-close {
          position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border-radius: 50%;
          background: rgba(0,0,0,0.06); border: none; font-size: 22px; color: #64748b; cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        #waw-close:hover { background: rgba(0,0,0,0.1); color: #334155; }
      </style>
      
      <div id="waw-card">
        <button id="waw-close">×</button>
        <div id="waw-main">
          <div id="waw-header">
            <h1 id="waw-title">${esc(data.title) || 'Position'}</h1>
            <span id="waw-saved-badge">★ Saved</span>
          </div>
          <div id="waw-company" data-company="${esc(data.company)}">@ <span id="waw-company-name">${esc(data.company) || 'Company'}</span></div>
          <div id="waw-body">
            ${data.isLoading ? '<div style="color:#718096; display:flex; align-items:center; justify-content:center; height:200px; font-size:16px;">Loading...</div>' : `
              ${data.description ? `<div class="waw-section"><div class="waw-section-title">Description:</div><div class="waw-section-content">${fmt(data.description)}</div></div>` : ''}
              ${data.responsibilities ? `<div class="waw-section"><div class="waw-section-title">Responsibilities:</div><div class="waw-section-content">${fmt(data.responsibilities)}</div></div>` : ''}
              ${data.skills ? `<div class="waw-section"><div class="waw-section-title">Skills:</div><div class="waw-section-content">${fmt(data.skills)}</div></div>` : ''}
              ${!data.description && !data.responsibilities && !data.skills ? '<div style="color:#718096;">No details found</div>' : ''}
            `}
          </div>
          <div id="waw-footer">
            <div id="waw-actions">
              <button class="waw-action-btn" id="waw-save" title="Save to My Jobs Folder">📁</button>
              <button class="waw-action-btn" id="waw-apply" title="Apply">✓ Apply</button>
              <button class="waw-action-btn" id="waw-print" title="Print">🖨️</button>
            </div>
            <div id="waw-nav">
              <button class="waw-nav-btn" id="waw-prev">◀</button>
              <button class="waw-nav-btn" id="waw-next">▶</button>
            </div>
          </div>
        </div>
        <div id="waw-sidebar">
          <div class="waw-info"><div class="waw-info-label">Duration:</div><div class="waw-info-value">${esc(data.duration) || 'N/A'}</div></div>
          <div class="waw-info"><div class="waw-info-label">Location:</div><div class="waw-info-value">${esc(data.location) || 'N/A'}</div></div>
          <div class="waw-info"><div class="waw-info-label">Compensation:</div><div class="waw-info-value">${esc(data.compensation) || 'N/A'}</div></div>
          <div class="waw-info"><div class="waw-info-label">Deadline:</div><div class="waw-info-value">${esc(data.deadline) || 'N/A'}</div></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('waw-active');
    isActive = true;
    
    // Store current job ID and check saved status
    currentJobId = data.jobId;
    if (currentJobId && !data.isLoading) {
      updateSavedBadge(isJobSaved(currentJobId));
    }

    // Fetch company URL and update the link
    if (data.company && !data.isLoading) {
      fetchCompanyUrl(data.company).then(result => {
        const companyNameEl = document.getElementById('waw-company-name');
        if (result && companyNameEl) {
          const title = result.isSearch ? 'Search for company' : 'Visit company website';
          companyNameEl.innerHTML = `<a href="${result.url}" target="_blank" title="${title}">${esc(data.company)}</a>`;
        }
      });
    }

    const closeAll = () => {
      console.log('[WAW] closeAll() called');
      
      // Pause hideObserver during close to prevent mutation cascades
      hideObserver.disconnect();
      setTimeout(() => {
        hideObserver.observe(document.documentElement, { childList: true, subtree: true });
        console.log('[WAW] hideObserver reconnected');
      }, 500);
      
      // Remove our overlay
      if (overlay) { overlay.remove(); overlay = null; }
      document.querySelectorAll('#waw-overlay').forEach((el) => el.remove());
      document.body.classList.remove('waw-active');
      isActive = false;
      document.removeEventListener('keydown', keyHandler, true);
      suppressHandleUntil = Date.now() + 200;
      suppressObserver = true;
      setTimeout(() => { suppressObserver = false; }, 300);

      const modalNodes = document.querySelectorAll('div[data-v-70e7ded6-s], .modal__content, .modal');
      modalNodes.forEach((node) => {
        if (node) node.dataset.wawSuppress = 'true';
      });
      setTimeout(() => {
        modalNodes.forEach((node) => {
          if (node) delete node.dataset.wawSuppress;
        });
      }, 300);

      const closeWaterlooModal = () => {
        console.log('[WAW] closeWaterlooModal: modals', document.querySelectorAll('div[data-v-70e7ded6-s], .modal__content, .modal').length);
        const closeButtons = document.querySelectorAll(
          'div[data-v-70e7ded6-s] button[aria-label="Close"], .modal__close, button.close, [data-dismiss="modal"]'
        );
        console.log('[WAW] closeWaterlooModal: closeButtons', closeButtons.length);
        let clicked = false;
        closeButtons.forEach((btn) => {
          if (btn) {
            btn.click();
            clicked = true;
          }
        });

        if (!clicked) {
          const modal = document.querySelector('div[data-v-70e7ded6-s], .modal__content, .modal');
          const modalClose = modal?.querySelector?.('button[aria-label="Close"], .modal__close, button.close');
          if (modalClose) {
            modalClose.click();
            clicked = true;
          }
        }

        if (!clicked) {
          const backdrop = document.querySelector('.modal-backdrop, .overlay, [data-dismiss="modal"]');
          console.log('[WAW] closeWaterlooModal: fallback backdrop', !!backdrop);
          if (backdrop) {
            backdrop.click();
          } else {
            const modal = document.querySelector('div[data-v-70e7ded6-s], .modal__content, .modal');
            if (modal) {
              modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
          }
        }
      };

      // Close the hidden WaterlooWorks modal (retry a few times)
      closeWaterlooModal();
      setTimeout(closeWaterlooModal, 120);
      setTimeout(closeWaterlooModal, 300);

      // Hard-hide (NOT remove) any remaining modals/backdrops so WW's
      // framework can still find and clean them up properly.
      const hardHide = () => {
        console.log('[WAW] hardHide: backdrops', document.querySelectorAll('.modal-backdrop, .overlay').length);
        document.querySelectorAll('.modal-backdrop, .overlay').forEach((el) => {
          if (!el || el.id === 'waw-overlay') return;
          el.style.display = 'none';
          el.style.pointerEvents = 'none';
        });
      };
      hardHide();
      setTimeout(hardHide, 180);

      // Scroll restoration: use a reactive MutationObserver to immediately
      // undo any scroll-locking that WW's framework re-applies after close.
      const forceEnableScroll = () => {
        document.body.style.overflow = '';
        document.body.style.overflowX = '';
        document.body.style.overflowY = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.body.style.pointerEvents = '';
        document.documentElement.style.overflow = '';
        document.documentElement.style.overflowX = '';
        document.documentElement.style.overflowY = '';
        document.documentElement.style.position = '';
        document.documentElement.style.pointerEvents = '';
        document.body.classList.remove('modal-open', 'overflow-hidden', 'waw-active', 'no-scroll');
        if (getComputedStyle(document.body).overflow === 'hidden') {
          document.body.style.setProperty('overflow', 'auto', 'important');
        }
        if (getComputedStyle(document.documentElement).overflow === 'hidden') {
          document.documentElement.style.setProperty('overflow', 'auto', 'important');
        }
      };

      // Run immediately
      forceEnableScroll();
      
      // Reactive scroll guard: watches for WW framework re-applying scroll lock
      const scrollGuard = new MutationObserver(() => {
        const bodyOverflow = document.body.style.overflow;
        const htmlOverflow = document.documentElement.style.overflow;
        const hasModalOpen = document.body.classList.contains('modal-open');
        if (bodyOverflow === 'hidden' || htmlOverflow === 'hidden' || hasModalOpen) {
          console.log('[WAW] scrollGuard: undoing scroll lock re-applied by WW');
          forceEnableScroll();
        }
      });
      scrollGuard.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
      scrollGuard.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
      
      // Disconnect the guard after 3 seconds — long enough for WW's async cleanup
      setTimeout(() => {
        scrollGuard.disconnect();
        // One final check
        forceEnableScroll();
        console.log('[WAW] Scroll guard disconnected');
      }, 3000);
      
      console.log('[WAW] closeAll() finished setup');
    };

    const nav = (dir) => {
      console.log('[WAW] nav() called, direction:', dir);
      if (overlay) { overlay.remove(); overlay = null; }
      document.body.classList.remove('waw-active');
      isActive = false;
      document.removeEventListener('keydown', keyHandler, true);
      
      // Force-reset isNavigating so rapid keypresses aren't blocked
      // by a previous navigation's pending pollForModal callback.
      // The navGeneration counter ensures stale callbacks are ignored.
      isNavigating = false;
      
      // Aggressively reset scroll
      const resetScroll = () => {
        document.body.style.overflow = '';
        document.body.style.overflowX = '';
        document.body.style.overflowY = '';
        document.body.style.position = '';
        document.documentElement.style.overflow = '';
        document.documentElement.style.overflowX = '';
        document.documentElement.style.overflowY = '';
        document.body.classList.remove('modal-open', 'overflow-hidden', 'waw-active');
      };
      resetScroll();
      
      // Use our own navigation
      navigateToJob(dir);
    };

    const keyHandler = (e) => {
      if (!isActive || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      console.log('[WAW] Key pressed:', e.key);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeAll();
      }
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        nav(-1);
      }
      else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        nav(1);
      }
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Toggle shortlist (star) for the current job
        if (currentJobId && window.WAWNavigator?.toggleShortlistJob) {
          window.WAWNavigator.toggleShortlistJob(currentJobId);
        }
      }
      else if (e.key === 's' || e.key === 'S' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (currentJobId && window.WAWNavigator?.toggleShortlistJob) {
          window.WAWNavigator.toggleShortlistJob(currentJobId);
        }
      }
    };

    document.getElementById('waw-close').onclick = closeAll;
    overlay.onclick = (e) => { if (e.target === overlay) closeAll(); };
    document.getElementById('waw-prev').onclick = () => nav(-1);
    document.getElementById('waw-next').onclick = () => nav(1);
    
    // Helper function to click a button in the CURRENT WaterlooWorks modal
    const clickCurrentModalButton = (iconName) => {
      if (!currentWWModal) {
        console.log('[WAW] No current modal stored!');
        return false;
      }
      
      console.log('[WAW] Looking for', iconName, 'button');
      
      // Find the modal container - go up to find the parent that contains both modal content and navbar
      let modalContainer = currentWWModal;
      // Try to find the Vue modal wrapper that contains the navbar
      while (modalContainer && !modalContainer.querySelector('nav.floating--action-bar')) {
        if (modalContainer.parentElement) {
          modalContainer = modalContainer.parentElement;
        } else {
          break;
        }
        // Stop if we've gone too far up
        if (modalContainer === document.body) {
          modalContainer = currentWWModal;
          break;
        }
      }
      
      // Store original styles for elements we'll modify
      const elementsToRestore = [];
      
      // Make the modal container and its children accessible
      const makeAccessible = (el) => {
        if (!el) return;
        elementsToRestore.push({ el, style: el.getAttribute('style') || '' });
        el.style.cssText = 'position:fixed;top:0;left:0;opacity:0.01;pointer-events:auto;z-index:1;';
      };
      
      makeAccessible(modalContainer);
      makeAccessible(currentWWModal);
      
      // Find the navbar - search in container, then siblings, then document
      let navbar = modalContainer.querySelector('nav.floating--action-bar');
      if (!navbar) {
        // Try finding navbar as sibling
        navbar = currentWWModal.parentElement?.querySelector('nav.floating--action-bar');
      }
      if (!navbar) {
        // Last resort - find any floating action bar on the page
        navbar = document.querySelector('nav.floating--action-bar');
      }
      
      console.log('[WAW] Found navbar:', !!navbar);
      
      let clicked = false;
      if (navbar) {
        makeAccessible(navbar);
        const btns = navbar.querySelectorAll('button');
        console.log('[WAW] Found', btns.length, 'buttons in navbar');
        
        for (const btn of btns) {
          const icon = btn.querySelector('i.material-icons');
          const iconText = icon?.textContent?.trim();
          console.log('[WAW] Button icon:', iconText);
          if (iconText === iconName) {
            console.log('[WAW] Clicking button with icon:', iconName);
            btn.style.pointerEvents = 'auto';
            btn.click();
            clicked = true;
            break;
          }
        }
      }
      
      // Restore original styles after a short delay
      setTimeout(() => {
        elementsToRestore.forEach(({ el, style }) => {
          el.style.cssText = style || 'position:fixed!important;top:-9999px!important;left:-9999px!important;visibility:hidden!important;opacity:0!important;pointer-events:auto!important;';
        });
      }, 100);
      
      if (!clicked) {
        console.log('[WAW] Button with icon', iconName, 'not found');
      }
      
      return clicked;
    };
    
    // Action buttons - trigger buttons in the CURRENT WaterlooWorks modal
    document.getElementById('waw-save').onclick = () => {
      console.log('[WAW] Save button clicked');
      clickCurrentModalButton('create_new_folder');
      // Mark job as saved and update badge
      if (currentJobId) {
        markJobAsSaved(currentJobId);
      }
    };
    
    document.getElementById('waw-apply').onclick = () => {
      console.log('[WAW] Apply button clicked');
      clickCurrentModalButton('playlist_add');
    };
    
    document.getElementById('waw-print').onclick = () => {
      console.log('[WAW] Print button clicked');
      clickCurrentModalButton('print');
    };

    document.addEventListener('keydown', keyHandler, true);
  }

  // ============================================
  // Handle Modal
  // ============================================

  function handleModal(modal) {
    if (isActive) return;
    
    // Store reference to the current WaterlooWorks modal for action buttons
    currentWWModal = modal;
    console.log('[WAW] Stored current modal reference');
    
    // Show loading overlay IMMEDIATELY to cover the original modal
    showOverlay({ 
      title: 'Loading...', 
      company: '', 
      description: '', 
      responsibilities: '', 
      skills: '',
      duration: '',
      location: '',
      compensation: '',
      deadline: '',
      isLoading: true
    });

    let attempts = 0;
    const check = () => {
      attempts++;
      const hasTitle = modal.querySelector('.dashboard-header__posting-title h2, h2.h3');
      const hasFields = modal.querySelectorAll('.tag__key-value-list').length > 5;

      if ((hasTitle && hasFields) || attempts > 25) {
        // Get basic data (header/sidebar)
        const basicData = parseBasicJobData(modal);
        const jobId = basicData.jobId;
        if (jobId) lastClickedJobId = jobId;
        syncJobIndexFromId(jobId);
        
        // Check cache first
        if (jobId && cache.has(jobId)) {
          console.log('[WAW] Using cached data for job:', jobId);
          const cachedData = cache.get(jobId);
          updateOverlayContent({ ...basicData, ...cachedData });
          return;
        }
        
        // Parse content sections from modal DOM
        const contentData = parseContentSections(modal);
        
        // Cache the result
        if (jobId) {
          cache.set(jobId, contentData);
          console.log('[WAW] Cached job:', jobId);
        }
        
        // Update overlay with actual content
        updateOverlayContent({ ...basicData, ...contentData });
      } else {
        setTimeout(check, 120);
      }
    };
    setTimeout(check, 100);
    // Once we start handling, this navigation cycle is complete
    isNavigating = false;
  }
  
  // Update existing overlay content without recreating it
  function updateOverlayContent(data) {
    if (!overlay) return;
    
    const titleEl = document.getElementById('waw-title');
    const companyEl = document.getElementById('waw-company');
    const bodyEl = document.getElementById('waw-body');
    const sidebarEl = document.getElementById('waw-sidebar');
    
    if (titleEl) titleEl.textContent = data.title || 'Position';
    
    // Update current job ID and saved badge
    currentJobId = data.jobId;
    updateSavedBadge(isJobSaved(currentJobId));
    if (companyEl) {
      companyEl.innerHTML = `@ <span id="waw-company-name">${esc(data.company) || 'Company'}</span>`;
      companyEl.dataset.company = data.company;
      
      // Fetch company URL
      if (data.company) {
        fetchCompanyUrl(data.company).then(result => {
          const companyNameEl = document.getElementById('waw-company-name');
          if (result && companyNameEl) {
            const title = result.isSearch ? 'Search for company' : 'Visit company website';
            companyNameEl.innerHTML = `<a href="${result.url}" target="_blank" title="${title}">${esc(data.company)}</a>`;
          }
        });
      }
    }
    
    if (bodyEl) {
      let content = '';
      if (data.description) content += `<div class="waw-section"><div class="waw-section-title">Description:</div><div class="waw-section-content">${fmt(data.description)}</div></div>`;
      if (data.responsibilities) content += `<div class="waw-section"><div class="waw-section-title">Responsibilities:</div><div class="waw-section-content">${fmt(data.responsibilities)}</div></div>`;
      if (data.skills) content += `<div class="waw-section"><div class="waw-section-title">Skills:</div><div class="waw-section-content">${fmt(data.skills)}</div></div>`;
      if (!data.description && !data.responsibilities && !data.skills) content = '<div style="color:#718096;">No details found</div>';
      bodyEl.innerHTML = content;
    }
    
    if (sidebarEl) {
      sidebarEl.innerHTML = `
        <div class="waw-info"><div class="waw-info-label">Duration:</div><div class="waw-info-value">${esc(data.duration) || 'N/A'}</div></div>
        <div class="waw-info"><div class="waw-info-label">Location:</div><div class="waw-info-value">${esc(data.location) || 'N/A'}</div></div>
        <div class="waw-info"><div class="waw-info-label">Compensation:</div><div class="waw-info-value">${esc(data.compensation) || 'N/A'}</div></div>
        <div class="waw-info"><div class="waw-info-label">Deadline:</div><div class="waw-info-value">${esc(data.deadline) || 'N/A'}</div></div>
      `;
    }
  }

  // Observer - watch for new modals (content changes only when navigating)
  let lastModalContent = '';
  
  new MutationObserver(muts => {
    if (suppressObserver) return;
    for (const m of muts) {
      // Check for new nodes
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const modal = node.querySelector?.('.modal__content') || (node.classList?.contains('modal__content') ? node : null);
        if (modal) {
          console.log('[WAW] New modal detected, isActive:', isActive, 'navIntent:', Date.now() < navigationIntentUntil);
          if (!isActive && Date.now() >= suppressHandleUntil && Date.now() < navigationIntentUntil && modal.dataset?.wawSuppress !== 'true') {
            handleModal(modal);
          }
        }
      }
    }
    
    // Also check if an existing modal has new content (user click or navigation)
    if (!isActive && Date.now() < navigationIntentUntil) {
      const modal = document.querySelector('.modal__content.height--100, div[data-v-70e7ded6-s] .modal__content');
      if (modal) {
        if (Date.now() < suppressHandleUntil || modal.dataset?.wawSuppress === 'true') {
          return;
        }
        const title = modal.querySelector('.dashboard-header__posting-title h2, h2.h3')?.textContent || '';
        if (title && title !== lastModalContent) {
          console.log('[WAW] Modal content changed, title:', title.substring(0, 30));
          lastModalContent = title;
          handleModal(modal);
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  document.addEventListener('click', (event) => {
    const link = event.target?.closest?.('a');
    if (!link) return;
    const row = link.closest('tr');
    if (!row) return;
    // Clear all suppress flags — a genuine user click should always open the modal
    suppressHandleUntil = 0;
    suppressObserver = false;
    navigationIntentUntil = Date.now() + 2000;
    // Also clear wawSuppress from any modal nodes
    document.querySelectorAll('[data-waw-suppress]').forEach((node) => {
      delete node.dataset.wawSuppress;
    });
  }, true);

  const existing = document.querySelector('.modal__content.height--100');
  if (existing) handleModal(existing);

  console.log('[WAW] Modal Redesign ready (DOM parsing)');
})();
