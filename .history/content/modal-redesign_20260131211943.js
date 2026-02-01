/**
 * Modal Redesign for WaterlooActuallyWorks
 * Completely replaces WaterlooWorks job modal with clean UI
 * Uses Gemini API to extract description, responsibilities, and skills
 */

(function() {
  'use strict';

  if (!window.location.href.includes('waterlooworks.uwaterloo.ca')) return;

  console.log('[WAW] Modal Redesign loading...');

  // ============================================
  // Gemini API Configuration
  // ============================================
  
  const GEMINI_API_KEY = 'AIzaSyCRuB8R1c7imZ-VucebE2G0xKPPz0Rj7uE';
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  // ============================================
  // IMMEDIATELY hide the original modal with CSS
  // ============================================
  
  const style = document.createElement('style');
  style.id = 'waw-modal-hide';
  style.textContent = `
    .modal__content.height--100.overflow--hidden {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .modal__overlay, .modal-backdrop {
      background: transparent !important;
    }
    body.waw-active { overflow: hidden; }
  `;
  document.head.insertBefore(style, document.head.firstChild);

  let overlay = null;
  let isActive = false;

  // ============================================
  // Parse with Gemini API
  // ============================================

  async function parseWithGemini(modalText, retryCount = 0) {
    const prompt = `Extract job posting information from the text below. Return ONLY a valid JSON object with these three fields:

1. "description" - The job summary/description (look for "Job Summary" section)
2. "responsibilities" - The job responsibilities (look for "Job Responsibilities" section)
3. "skills" - The required skills (look for "Required Skills" section)

Return ONLY the JSON object, no markdown, no code blocks:
{"description": "...", "responsibilities": "...", "skills": "..."}

If a field is not found, use empty string.

Text:
${modalText}`;

    try {
      console.log('[WAW] Calling Gemini API...' + (retryCount > 0 ? ` (retry ${retryCount})` : ''));
      console.log('[WAW] Modal text preview:', modalText.substring(0, 500));
      
      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
        })
      });

      console.log('[WAW] Gemini response status:', response.status);

      // Handle rate limiting
      if (response.status === 429 && retryCount < 3) {
        const delay = (retryCount + 1) * 2000;
        console.log(`[WAW] Rate limited, retrying in ${delay/1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        return parseWithGemini(modalText, retryCount + 1);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[WAW] Gemini error response:', errorText);
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[WAW] Gemini raw response:', result);

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log('[WAW] Gemini text output:', text);
      
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      console.log('[WAW] Cleaned text:', cleanedText);
      
      const parsed = JSON.parse(cleanedText);
      
      console.log('[WAW] Gemini parsed:', parsed);
      return {
        description: parsed.description || '',
        responsibilities: parsed.responsibilities || '',
        skills: parsed.skills || ''
      };
    } catch (error) {
      console.error('[WAW] Gemini parsing failed:', error);
      console.error('[WAW] Error details:', error.message);
      return { description: '', responsibilities: '', skills: '' };
    }
  }

  // ============================================
  // Parse Basic Job Data (title, company, sidebar info)
  // ============================================

  function parseBasicJobData(modal) {
    const data = {
      title: '',
      company: '',
      location: '',
      jobId: '',
      duration: '',
      compensation: '',
      deadline: '',
      supplementaryRequired: 'No'
    };

    // Title
    const h2 = modal.querySelector('.dashboard-header__posting-title h2, h2.h3');
    if (h2) data.title = h2.textContent.trim();

    // Job ID
    const jobIdEl = modal.querySelector('.dashboard-header__posting-title .tag-label');
    if (jobIdEl) {
      const match = jobIdEl.textContent.match(/\d{6}/);
      if (match) data.jobId = match[0];
    }

    // Company and location from header
    const headerInfo = modal.querySelector('.dashboard-header--mini__content .font--14');
    if (headerInfo) {
      const spans = headerInfo.querySelectorAll('span');
      if (spans[0]) data.company = spans[0].textContent.trim();
      if (spans[1]) data.location = spans[1].textContent.trim();
    }

    // Parse key-value lists for sidebar fields
    modal.querySelectorAll('.tag__key-value-list').forEach(kv => {
      const labelEl = kv.querySelector('.label');
      if (!labelEl) return;
      const label = labelEl.textContent.toLowerCase().trim();
      const pEl = kv.querySelector('p');
      if (!pEl) return;
      const value = pEl.textContent.trim();

      if (label.includes('work term duration')) data.duration = value;
      else if (label.includes('job - city')) data.location = value;
      else if (label.includes('job - province')) {
        if (data.location && !data.location.includes(value)) data.location += ', ' + value;
      }
      else if (label.includes('compensation')) data.compensation = value;
      else if (label.includes('application deadline')) data.deadline = value;
    });

    return data;
  }

  function esc(t) { return t ? t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }
  
  function fmt(t) {
    if (!t) return '';
    return t.split(/\n+/).map(l => l.trim()).filter(l => l).map(l => `<p style="margin:0 0 8px">• ${esc(l)}</p>`).join('');
  }

  // ============================================
  // Show Overlay
  // ============================================

  function showOverlay(data, isLoading = false) {
    if (overlay) overlay.remove();

    const loadingHTML = `<div style="color:#718096;font-style:italic;padding:20px 0;">Parsing job details...</div>`;
    
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
            ${isLoading ? loadingHTML : `
              ${data.description ? `<div class="waw-section"><div class="waw-section-title">Description:</div><div class="waw-section-content">${fmt(data.description)}</div></div>` : ''}
              ${data.responsibilities ? `<div class="waw-section"><div class="waw-section-title">Responsibilities:</div><div class="waw-section-content">${fmt(data.responsibilities)}</div></div>` : ''}
              ${data.skills ? `<div class="waw-section"><div class="waw-section-title">Skills:</div><div class="waw-section-content">${fmt(data.skills)}</div></div>` : ''}
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
          <div class="waw-info"><div class="waw-info-label">Application Deadline:</div><div class="waw-info-value">${esc(data.deadline) || 'N/A'}</div></div>
          <div class="waw-info"><div class="waw-info-label">Supplementary Info:</div><div class="waw-info-value">${esc(data.supplementaryRequired)}</div></div>
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
      const closeBtn = document.querySelector('[aria-label="Close"], .modal__close');
      if (closeBtn) closeBtn.click();
    };

    const nav = (dir) => {
      if (overlay) { overlay.remove(); overlay = null; }
      document.body.classList.remove('waw-active');
      isActive = false;
      document.removeEventListener('keydown', keyHandler);
      if (window.WAWNavigator?.navigateJob) window.WAWNavigator.navigateJob(dir);
    };

    const keyHandler = (e) => {
      if (!isActive || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
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

  function updateOverlayContent(data) {
    const body = document.getElementById('waw-body');
    if (!body) return;
    
    body.innerHTML = `
      ${data.description ? `<div class="waw-section"><div class="waw-section-title">Description:</div><div class="waw-section-content">${fmt(data.description)}</div></div>` : ''}
      ${data.responsibilities ? `<div class="waw-section"><div class="waw-section-title">Responsibilities:</div><div class="waw-section-content">${fmt(data.responsibilities)}</div></div>` : ''}
      ${data.skills ? `<div class="waw-section"><div class="waw-section-title">Skills:</div><div class="waw-section-content">${fmt(data.skills)}</div></div>` : ''}
      ${!data.description || !data.responsibilities || !data.skills ? '<div style="color:#718096;font-style:italic;">No details available</div>' : ''}
    `;
  }

  // ============================================
  // Watch for Modal
  // ============================================

  async function handleModal(modal) {
    if (isActive) return;

    let attempts = 0;
    const check = async () => {
      attempts++;
      const hasTitle = modal.querySelector('.dashboard-header__posting-title h2, h2.h3');
      const hasFields = modal.querySelectorAll('.tag__key-value-list').length > 5;

      if ((hasTitle && hasFields) || attempts > 25) {
        // Get basic data for header/sidebar
        const basicData = parseBasicJobData(modal);
        
        // Show overlay with loading state
        showOverlay(basicData, true);
        
        // Get ALL text from the modal and send to Gemini
        const modalText = modal.innerText || modal.textContent || '';
        console.log('[WAW] Sending to Gemini, text length:', modalText.length);
        
        // Call Gemini to extract description, responsibilities, skills
        const geminiData = await parseWithGemini(modalText);
        
        // Update overlay with Gemini's result
        updateOverlayContent(geminiData);
      } else {
        setTimeout(check, 120);
      }
    };
    setTimeout(check, 100);
  }

  // Observer
  new MutationObserver(muts => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const modal = node.querySelector?.('.modal__content') || (node.classList?.contains('modal__content') ? node : null);
        if (modal && !isActive) handleModal(modal);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Check existing
  const existing = document.querySelector('.modal__content.height--100');
  if (existing) handleModal(existing);

  console.log('[WAW] Modal Redesign ready (Gemini)');
})();
