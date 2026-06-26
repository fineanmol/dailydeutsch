/**
 * core/store.js — Central application state with a tiny pub/sub layer.
 *
 * Replaces the old single mutable `state` object that lived inside app.js and
 * was mutated in 100+ places. The shape is unchanged so existing call sites
 * keep working; what's new is intentional `set()` + `subscribe()` for code
 * that wants change notifications instead of manual re-render calls.
 *
 * Usage:
 *   const state = Store.state;        // direct read/write (back-compat)
 *   Store.set({ currentView: 'bank' }); // notifies subscribers
 *   Store.subscribe(s => render(s));    // returns an unsubscribe fn
 *
 * No dependencies — must load before every feature module.
 */
const Store = (() => {
  const state = {
    currentView: 'translate',
    translationDirection: 'en-' + (localStorage.getItem('dd_learning_lang') || 'de'),
    currentTranslation: null,
    currentEnglish: '',
    currentAlternatives: [],
    currentAltIndex: -1,       // -1 = showing primary translation
    currentCEFR: null,
    currentProvider: 'MyMemory',
    levelVariations: null,
    levelVariationsOpen: false,
    verbConjugations: null,
    verbConjugationsOpen: false,
    wordBankFilter: 'all',
    wordBankSearch: '',
    exerciseMode: null,
    exerciseQuestions: [],
    exerciseIndex: 0,
    exerciseScore: 0,
    flashcardFlipped: false,
  };

  const subscribers = new Set();

  /** Shallow-merge a patch into state and notify subscribers. */
  function set(patch) {
    if (patch && typeof patch === 'object') {
      Object.assign(state, patch);
    }
    notify();
  }

  /** Notify all subscribers with the current state. */
  function notify() {
    subscribers.forEach(fn => {
      try { fn(state); } catch (e) { console.error('[Store] subscriber error:', e); }
    });
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  function subscribe(fn) {
    if (typeof fn === 'function') subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  return { state, set, subscribe, notify };
})();
