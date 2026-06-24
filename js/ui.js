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
    toast.innerHTML = `<span>${ICONS[type] || '💡'}</span><span>${message}</span>`;
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

    const overlay = document.createElement('div');
    overlay.id = 'ai-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="${escHtml(title)}">
        <div class="modal-header">
          <h2 class="modal-title">${escHtml(title)}</h2>
          <button class="btn btn-ghost btn-icon modal-close-btn" aria-label="Close" onclick="document.getElementById('ai-modal-overlay').remove()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">${contentHtml}</div>
      </div>
    `;

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);

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
