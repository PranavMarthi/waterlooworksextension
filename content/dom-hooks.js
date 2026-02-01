/**
 * DOM Hooks for WaterlooWorks Azure
 * Provides DOM manipulation utilities and page-specific hooks
 */

const DOMHooks = {
  /**
   * Inject a stylesheet into the page
   * @param {string} href - URL of the stylesheet
   * @param {string} id - Unique ID for the link element
   * @returns {HTMLLinkElement}
   */
  injectStylesheet(href, id = null) {
    // Check if already injected
    if (id && document.getElementById(id)) {
      return document.getElementById(id);
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = href;
    link.classList.add('azure-injected');
    
    if (id) {
      link.id = id;
    }

    (document.head || document.documentElement).appendChild(link);
    return link;
  },

  /**
   * Inject inline CSS styles
   * @param {string} css - CSS text
   * @param {string} id - Unique ID for the style element
   * @returns {HTMLStyleElement}
   */
  injectStyles(css, id = null) {
    // Check if already injected
    if (id && document.getElementById(id)) {
      const existing = document.getElementById(id);
      existing.textContent = css;
      return existing;
    }

    const style = document.createElement('style');
    style.textContent = css;
    style.classList.add('azure-injected');
    
    if (id) {
      style.id = id;
    }

    (document.head || document.documentElement).appendChild(style);
    return style;
  },

  /**
   * Set CSS variables on the root element
   * @param {object} variables - Object of variable name -> value pairs
   */
  setCSSVariables(variables) {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value);
    }
  },

  /**
   * Add a class to the body element
   * @param {string} className - Class to add
   */
  addBodyClass(className) {
    document.body?.classList.add(className);
  },

  /**
   * Remove a class from the body element
   * @param {string} className - Class to remove
   */
  removeBodyClass(className) {
    document.body?.classList.remove(className);
  },

  /**
   * Create an element with attributes and children
   * @param {string} tag - Tag name
   * @param {object} attrs - Attributes object
   * @param {Array} children - Child elements or text
   * @returns {HTMLElement}
   */
  createElement(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    element.classList.add('azure-injected');
    
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class' || key === 'className') {
        element.classList.add(...value.split(' '));
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'dataset') {
        Object.assign(element.dataset, value);
      } else {
        element.setAttribute(key, value);
      }
    }

    for (const child of children) {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        element.appendChild(child);
      }
    }

    return element;
  },

  /**
   * Insert element before a reference element
   * @param {HTMLElement} newElement - Element to insert
   * @param {HTMLElement} referenceElement - Reference element
   */
  insertBefore(newElement, referenceElement) {
    referenceElement.parentNode?.insertBefore(newElement, referenceElement);
  },

  /**
   * Insert element after a reference element
   * @param {HTMLElement} newElement - Element to insert
   * @param {HTMLElement} referenceElement - Reference element
   */
  insertAfter(newElement, referenceElement) {
    referenceElement.parentNode?.insertBefore(newElement, referenceElement.nextSibling);
  },

  /**
   * Remove all Azure-injected elements
   */
  cleanup() {
    document.querySelectorAll('.azure-injected').forEach(el => el.remove());
  },

  /**
   * Wait for an element to appear in the DOM
   * @param {string} selector - CSS selector
   * @param {number} timeout - Timeout in ms (default 5000)
   * @returns {Promise<HTMLElement>}
   */
  waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      // Check if already exists
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });

      // Timeout
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  },

  /**
   * Show a loading overlay
   * @param {string} message - Loading message
   */
  showLoading(message = 'Loading...') {
    if (document.getElementById('azure-loading')) return;

    const overlay = this.createElement('div', {
      id: 'azure-loading',
      class: 'azure-loading-overlay',
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '99999'
      }
    }, [
      this.createElement('div', {
        class: 'azure-loading-content',
        style: {
          background: 'white',
          padding: '20px 40px',
          borderRadius: '8px',
          textAlign: 'center'
        }
      }, [message])
    ]);

    document.body?.appendChild(overlay);
  },

  /**
   * Hide the loading overlay
   */
  hideLoading() {
    document.getElementById('azure-loading')?.remove();
  }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.AzureDOMHooks = DOMHooks;
}
