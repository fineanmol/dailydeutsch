/**
 * ui.js — Shared UI Utilities Module
 *
 * Pure, stateless helpers that are safe to call from any module.
 * No state, no DOM setup — just functions.
 *
 * Usage: UI.showToast('message', 'success')
 *        UI.escHtml(str)
 */

const UI = (() => {

  // ── HTML Escaping ─────────────────────────────────────────────

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  // ── String Utilities ──────────────────────────────────────────

  function capitalise(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  // ── Date Utilities ────────────────────────────────────────────

  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function formatTimeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  }

  // ── Toast Notifications ───────────────────────────────────────

  /**
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const ICONS = { success: '✅', error: '❌', info: '💡' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    // Build with textContent so a message containing user data can't inject markup.
    const icon = document.createElement('span');
    icon.textContent = ICONS[type] || '💡';
    const msg = document.createElement('span');
    msg.textContent = message;
    toast.append(icon, msg);
    container.appendChild(toast);

    if (window.Motion) {
      const { animate } = window.Motion;
      animate(toast, { opacity: [0, 1], scale: [0.85, 1], y: [15, 0] }, { duration: 0.3, easing: [0.175, 0.885, 0.32, 1.275] });
      setTimeout(() => {
        animate(toast, { opacity: 0, y: -15, scale: 0.9 }, { duration: 0.25 }).then(() => toast.remove());
      }, 2800);
    } else {
      setTimeout(() => toast.remove(), 3100);
    }
  }

  // ── Modal ─────────────────────────────────────────────────────

  /**
   * Show a generic modal overlay.
   * @param {string} title       - Modal heading.
   * @param {string} contentHtml - Inner HTML for the modal body.
   */
  function showModal(title, contentHtml) {
    const existing = document.getElementById('ai-modal-overlay');
    if (existing) existing.remove();

    // Remember what had focus so we can restore it on close (a11y).
    const previouslyFocused = document.activeElement;

    const overlay = document.createElement('div');
    overlay.id = 'ai-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="${escHtml(title)}">
        <div class="modal-header">
          <h2 class="modal-title">${escHtml(title)}</h2>
          <button class="btn btn-ghost btn-icon modal-close-btn" aria-label="Close" data-modal-close>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">${contentHtml}</div>
      </div>
    `;

    const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

    function close() {
      document.removeEventListener('keydown', onKeydown, true);
      overlay.remove();
      // Restore focus to the trigger element.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    }

    function onKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      // Trap Tab focus inside the modal.
      const focusables = Array.from(overlay.querySelectorAll(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-modal-close]').addEventListener('click', close);
    document.addEventListener('keydown', onKeydown, true);

    document.body.appendChild(overlay);

    // Move focus into the dialog (first focusable, else the close button).
    const initial = overlay.querySelector(FOCUSABLE) || overlay.querySelector('[data-modal-close]');
    if (initial) initial.focus();

    // Expose a programmatic close for inline handlers that used to call .remove().
    overlay._close = close;

    if (window.Motion) {
      window.Motion.animate(overlay.querySelector('.modal-card'),
        { opacity: [0, 1], scale: [0.93, 1], y: [20, 0] },
        { duration: 0.3, easing: [0.16, 1, 0.3, 1] }
      );
    }
  }

  // ── Public API ────────────────────────────────────────────────

  return { escHtml, escAttr, capitalise, formatDate, formatTimeAgo, showToast, showModal };

})();
