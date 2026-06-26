/**
 * core/router.js — View navigation, lifted out of App.
 *
 * Owns the tab/view switching that used to be `setupNavigation` +
 * `navigateTo` inside app.js. View-specific side effects (rendering the word
 * bank, booting the insights page, etc.) are injected as hooks at init time so
 * the router stays decoupled from feature modules.
 *
 * Usage:
 *   Router.init({
 *     onEnter: { bank: renderWordBank, insights: () => Insights.render(...), ... },
 *     onLeave: { insights: () => Insights.cleanup() },
 *     always: () => updateTrialBadges(),
 *   });
 *   Router.navigateTo('translate');
 *
 * Depends on: Store (for currentView), Analytics + window.Motion (optional).
 */
const Router = (() => {
  let _hooks = { onEnter: {}, onLeave: {}, always: null };

  function init(hooks) {
    _hooks = {
      onEnter: (hooks && hooks.onEnter) || {},
      onLeave: (hooks && hooks.onLeave) || {},
      always: (hooks && hooks.always) || null,
    };
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.tab));
    });
  }

  function navigateTo(viewId) {
    const prevView = (typeof Store !== 'undefined') ? Store.state.currentView : null;

    // Leave hook for the view we're navigating away from.
    if (prevView && prevView !== viewId && _hooks.onLeave[prevView]) {
      try { _hooks.onLeave[prevView](); } catch (e) { console.error('[Router] onLeave error:', e); }
    }

    if (typeof Analytics !== 'undefined') {
      Analytics.logEvent('screen_view', { screen_name: viewId });
    }

    if (typeof Store !== 'undefined') Store.state.currentView = viewId;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));

    const view = document.getElementById(`view-${viewId}`);
    if (view) {
      view.classList.add('active');
      if (window.Motion) {
        window.Motion.animate(view, { opacity: [0, 1], y: [12, 0] }, { duration: 0.35, easing: [0.16, 1, 0.3, 1] });
      }
    }
    document.querySelectorAll(`[data-tab="${viewId}"]`).forEach(b => b.classList.add('active'));

    // Enter hook for the destination view.
    if (_hooks.onEnter[viewId]) {
      try { _hooks.onEnter[viewId](); } catch (e) { console.error('[Router] onEnter error:', e); }
    }

    if (_hooks.always) {
      try { _hooks.always(viewId); } catch (e) { console.error('[Router] always-hook error:', e); }
    }
  }

  return { init, navigateTo };
})();
