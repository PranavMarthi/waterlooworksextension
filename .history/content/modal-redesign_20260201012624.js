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

  let overlay = null;
  let isActive = false;

  // ============================================
  // AGGRESSIVE: Hide modal instantly via inline styles
  // ============================================
  
  function hideOriginalModal(el) {
    if (!el || el.id === 'waw-overlay') return;
    el.style.cssText = 'position:fixed!important;top:-9999px!important;left:-9999px!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;';
  }

  // Fast observer to catch and hide modals IMMEDIATELY
  const hideObserver = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        // Check if it's the WW modal or contains it
        if (node.matches?.('div[data-v-70e7ded6-s], .modal__content, .modal__overlay, [role="dialog"]')) {
          hideOriginalModal(node);
        }
        // Also check children
        const modal = node.querySelector?.('div[data-v-70e7ded6-s], .modal__content, .modal__overlay, [role="dialog"]');
        if (modal) hideOriginalModal(modal);
      }
    }
  });
  hideObserver.observe(document.documentElement, { childList: true, subtree: true });
  
  // Also hide any existing modals right now
  document.querySelectorAll('div[data-v-70e7ded6-s], .modal__content, .modal__overlay, [role="dialog"]').forEach(hideOriginalModal);

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

  function refreshJobLinks() {
    // Get all job title links from the table
    jobLinks = Array.from(document.querySelectorAll('table tbody tr td a[href*="javascript"], table tbody tr a.posting-title'));
    if (jobLinks.length === 0) {
      // Fallback: try other selectors
      jobLinks = Array.from(document.querySelectorAll('tr[data-job-id] a, .job-listing a, table a[onclick]'));
    }
    console.log('[WAW] Found job links:', jobLinks.length);
    return jobLinks;
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
    return null;
  }

  function findCurrentJobIndex() {
    if (jobLinks.length === 0) refreshJobLinks();
    
    const currentId = getCurrentJobId();
    if (currentId) {
      for (let i = 0; i < jobLinks.length; i++) {
        const row = jobLinks[i].closest('tr');
        const rowId = row?.dataset?.jobId || row?.querySelector('[data-job-id]')?.dataset?.jobId;
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

  function navigateToJob(direction) {
    console.log('[WAW] navigateToJob called, direction:', direction);
    
    if (jobLinks.length === 0) refreshJobLinks();
    if (jobLinks.length === 0) {
      console.log('[WAW] No job links found');
      return;
    }

    // Find current position
    currentJobIndex = findCurrentJobIndex();
    console.log('[WAW] Current job index:', currentJobIndex);

    // Calculate new index
    let newIndex = currentJobIndex + direction;
    
    // Wrap around
    if (newIndex < 0) newIndex = jobLinks.length - 1;
    if (newIndex >= jobLinks.length) newIndex = 0;
    
    console.log('[WAW] New job index:', newIndex);
    currentJobIndex = newIndex;

    // Close the hidden WW modal first
    const closeBtn = document.querySelector('button[aria-label="Close"], .modal__close, [data-v-70e7ded6-s] button');
    if (closeBtn) {
      closeBtn.click();
    }

    // Click the new job link after a short delay
    setTimeout(() => {
      const link = jobLinks[newIndex];
      if (link) {
        console.log('[WAW] Clicking job link:', link.textContent?.substring(0, 50));
        link.click();
        
        // After clicking, wait for modal to appear and handle it
        setTimeout(() => {
          const modal = document.querySelector('.modal__content.height--100, div[data-v-70e7ded6-s] .modal__content, .modal__content');
          if (modal && !isActive) {
            console.log('[WAW] Modal found after navigation, handling...');
            handleModal(modal);
          }
        }, 200);
      }
    }, 50);
  }

  // ============================================
  // Parse content sections from DOM
  // ============================================

  function parseContentSections(modal) {
    const data = { description: '', responsibilities: '', skills: '' };
    
    // Map label text to our data keys
    const LABEL_MAP = {
      'job summary': 'description',
      'job responsibilities': 'responsibilities',
      'required skills': 'skills'
    };

    // Find all labels with the specific class
    const labels = modal.querySelectorAll('.label.align--middle.display--flex');
    console.log('[WAW] Found labels:', labels.length);
    
    labels.forEach(labelEl => {
      const labelText = labelEl.textContent.toLowerCase().trim().replace(/:$/, '');
      const key = LABEL_MAP[labelText];
      if (!key) return;
      
      // Find the parent container that holds all the content
      const parent = labelEl.closest('.tag__key-value-list') || labelEl.parentElement?.parentElement;
      if (!parent) return;
      
      let content = '';
      
      // Get ALL content from the parent - look for <p> which may contain text + lists
      const pEl = parent.querySelector('p');
      if (pEl) {
        // Get the full innerHTML and process it
        let html = pEl.innerHTML;
        
        // Convert <li> tags to bullet points
        html = html.replace(/<li[^>]*>/gi, '\n• ');
        html = html.replace(/<\/li>/gi, '');
        
        // Convert <br> to newlines
        html = html.replace(/<br\s*\/?>/gi, '\n');
        
        // Remove <ul>, <ol>, and other tags
        html = html.replace(/<\/?(?:ul|ol)[^>]*>/gi, '');
        html = html.replace(/<[^>]+>/g, '');
        
        // Clean up whitespace
        content = html.trim();
      }
      
      // Also check for standalone <ul> or <ol> lists in the parent
      if (!content || content.length < 50) {
        const lists = parent.querySelectorAll('ul, ol');
        lists.forEach(list => {
          const items = list.querySelectorAll('li');
          items.forEach(li => {
            content += '\n• ' + li.textContent.trim();
          });
        });
        content = content.trim();
      }
      
      if (content) {
        data[key] = content;
        console.log(`[WAW] Found ${labelText} (${content.length} chars):`, content.substring(0, 100) + '...');
      }
    });

    console.log('[WAW] Parsed sections:', Object.keys(data).filter(k => data[k]));
    return data;
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
        #waw-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center;
          z-index: 9999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        #waw-card {
          display: flex; width: 92%; max-width: 980px; max-height: 85vh;
          background: #e8eff5; border-radius: 20px; box-shadow: 0 25px 80px rgba(0,0,0,0.35);
          overflow: hidden; position: relative;
        }
        #waw-main { flex: 1; padding: 36px 42px; display: flex; flex-direction: column; overflow: hidden; }
        #waw-title { font-size: 32px; font-weight: 700; color: #1a1a2e; margin: 0 0 8px; }
        #waw-company { font-size: 17px; color: #4a5568; margin-bottom: 28px; }
        #waw-body { flex: 1; overflow-y: auto; padding-right: 12px; }
        #waw-body::-webkit-scrollbar { width: 5px; }
        #waw-body::-webkit-scrollbar-thumb { background: #bfc8d0; border-radius: 3px; }
        .waw-section { margin-bottom: 24px; }
        .waw-section-title { font-size: 14px; font-weight: 700; color: #1a1a2e; margin-bottom: 10px; }
        .waw-section-content { font-size: 14px; color: #4a5568; line-height: 1.75; }
        #waw-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 20px; }
        #waw-apply { padding: 14px 44px; background: #d3dce5; border: none; border-radius: 26px; font-size: 15px; font-weight: 600; color: #2d3748; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        #waw-apply:hover { background: #c6d0da; }
        #waw-nav { display: flex; background: #d3dce5; border-radius: 26px; overflow: hidden; }
        .waw-nav-btn { width: 60px; height: 46px; border: none; background: transparent; font-size: 18px; color: #4a5568; cursor: pointer; }
        .waw-nav-btn:hover { background: rgba(0,0,0,0.06); }
        .waw-nav-btn:first-child { border-right: 1px solid rgba(0,0,0,0.1); }
        #waw-sidebar { width: 270px; padding: 36px 24px; background: #f3f5f8; flex-shrink: 0; }
        .waw-info { margin-bottom: 18px; }
        .waw-info-label { font-size: 13px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
        .waw-info-value { font-size: 14px; color: #4a5568; line-height: 1.5; }
        #waw-close { position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; border-radius: 50%; background: rgba(0,0,0,0.08); border: none; font-size: 22px; color: #555; cursor: pointer; }
        #waw-close:hover { background: rgba(0,0,0,0.12); }
      </style>
      
      <div id="waw-card">
        <button id="waw-close">×</button>
        <div id="waw-main">
          <h1 id="waw-title">${esc(data.title) || 'Position'}</h1>
          <div id="waw-company">@ ${esc(data.company) || 'Company'}</div>
          <div id="waw-body">
            ${data.isLoading ? '<div style="color:#718096; display:flex; align-items:center; justify-content:center; height:200px; font-size:16px;">Loading...</div>' : `
              ${data.description ? `<div class="waw-section"><div class="waw-section-title">Description:</div><div class="waw-section-content">${fmt(data.description)}</div></div>` : ''}
              ${data.responsibilities ? `<div class="waw-section"><div class="waw-section-title">Responsibilities:</div><div class="waw-section-content">${fmt(data.responsibilities)}</div></div>` : ''}
              ${data.skills ? `<div class="waw-section"><div class="waw-section-title">Skills:</div><div class="waw-section-content">${fmt(data.skills)}</div></div>` : ''}
              ${!data.description && !data.responsibilities && !data.skills ? '<div style="color:#718096;">No details found</div>' : ''}
            `}
          </div>
          <div id="waw-footer">
            <button id="waw-apply"><span>↑</span> Apply</button>
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

    const closeAll = () => {
      if (overlay) { overlay.remove(); overlay = null; }
      document.body.classList.remove('waw-active');
      isActive = false;
      document.removeEventListener('keydown', keyHandler);
      
      // Reset all scroll locks
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      
      // Remove any WW scroll lock classes
      document.body.classList.remove('modal-open', 'overflow-hidden', 'no-scroll');
      
      // Close the hidden WW modal by temporarily enabling pointer events
      const modal = document.querySelector('div[data-v-70e7ded6-s], .modal__content');
      if (modal) {
        modal.style.pointerEvents = 'auto';
        const closeBtn = modal.querySelector('[aria-label="Close"], .modal__close, button');
        if (closeBtn) {
          closeBtn.click();
        }
        // Re-hide after click
        setTimeout(() => {
          if (modal) modal.style.pointerEvents = 'none';
        }, 100);
      }
    };

    const nav = (dir) => {
      console.log('[WAW] nav() called, direction:', dir);
      if (overlay) { overlay.remove(); overlay = null; }
      document.body.classList.remove('waw-active');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      isActive = false;
      document.removeEventListener('keydown', keyHandler);
      
      // Use our own navigation
      navigateToJob(dir);
    };

    const keyHandler = (e) => {
      if (!isActive || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      console.log('[WAW] Key pressed:', e.key);
      if (e.key === 'Escape') { e.preventDefault(); closeAll(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
    };

    document.getElementById('waw-close').onclick = closeAll;
    overlay.onclick = (e) => { if (e.target === overlay) closeAll(); };
    document.getElementById('waw-prev').onclick = () => nav(-1);
    document.getElementById('waw-next').onclick = () => nav(1);
    document.getElementById('waw-apply').onclick = () => {
      const btn = document.querySelector('[class*="btn"][class*="apply"], button[onclick*="apply"]');
      if (btn) btn.click();
    };

    document.addEventListener('keydown', keyHandler);
  }

  // ============================================
  // Handle Modal
  // ============================================

  function handleModal(modal) {
    if (isActive) return;
    
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
  }
  
  // Update existing overlay content without recreating it
  function updateOverlayContent(data) {
    if (!overlay) return;
    
    const titleEl = document.getElementById('waw-title');
    const companyEl = document.getElementById('waw-company');
    const bodyEl = document.getElementById('waw-body');
    const sidebarEl = document.getElementById('waw-sidebar');
    
    if (titleEl) titleEl.textContent = data.title || 'Position';
    if (companyEl) companyEl.textContent = `@ ${data.company || 'Company'}`;
    
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

  // Observer - watch for new modals AND content changes in existing modals
  let lastModalContent = '';
  
  new MutationObserver(muts => {
    for (const m of muts) {
      // Check for new nodes
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const modal = node.querySelector?.('.modal__content') || (node.classList?.contains('modal__content') ? node : null);
        if (modal) {
          console.log('[WAW] New modal detected, isActive:', isActive);
          if (!isActive) handleModal(modal);
        }
      }
    }
    
    // Also check if an existing modal has new content (for navigation)
    if (!isActive) {
      const modal = document.querySelector('.modal__content.height--100, div[data-v-70e7ded6-s] .modal__content');
      if (modal) {
        const title = modal.querySelector('.dashboard-header__posting-title h2, h2.h3')?.textContent || '';
        if (title && title !== lastModalContent) {
          console.log('[WAW] Modal content changed, title:', title.substring(0, 30));
          lastModalContent = title;
          handleModal(modal);
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  const existing = document.querySelector('.modal__content.height--100');
  if (existing) handleModal(existing);

  console.log('[WAW] Modal Redesign ready (DOM parsing)');
})();
