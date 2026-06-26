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

  return {
    logEvent
  };
})();
