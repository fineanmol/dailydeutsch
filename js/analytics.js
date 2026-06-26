/**
 * analytics.js — Central Analytics Tracker
 * Wraps Firebase Analytics compat SDK for safe, exception-free logging of custom events.
 */

const Analytics = (() => {
  let analyticsInstance = null;

  function getAnalytics() {
    if (analyticsInstance) return analyticsInstance;
    if (typeof window !== 'undefined' && window.firebase && typeof window.firebase.analytics === 'function') {
      try {
        analyticsInstance = window.firebase.analytics();
      } catch (e) {
        console.warn('[Analytics] Failed to retrieve Firebase Analytics instance:', e);
      }
    }
    return analyticsInstance;
  }

  /**
   * Log a custom event with optional parameters.
   * @param {string} name - Event name (use lowercase snake_case)
   * @param {Object} [params] - Key-value pair parameters
   */
  function logEvent(name, params = {}) {
    const analytics = getAnalytics();
    if (analytics) {
      try {
        analytics.logEvent(name, params);
        console.log(`[Analytics] Event logged: "${name}"`, params);
      } catch (e) {
        console.error(`[Analytics] Error logging event "${name}":`, e);
      }
    } else {
      console.log(`[Analytics] Dry-run (Analytics blocked/inactive): "${name}"`, params);
    }
  }

  /**
   * Fire an event at most ONCE per device, ever. Used for activation-funnel
   * milestones (first_translation, first_word_saved, …). The fired set is
   * persisted in localStorage so it survives reloads but not a data clear.
   * @returns {boolean} true if this was the first time (event fired).
   */
  function logEventOnce(name, params = {}) {
    const KEY = 'dd_fired_once';
    let fired = {};
    try { fired = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { fired = {}; }
    if (fired[name]) return false;
    fired[name] = 1;
    try { localStorage.setItem(KEY, JSON.stringify(fired)); } catch { /* ignore quota */ }
    logEvent(name, params);
    return true;
  }

  return {
    logEvent,
    logEventOnce
  };
})();
