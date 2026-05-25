/**
 * db.js — Firestore + localStorage hybrid storage
 * Google & Anonymous users → Firestore (real-time sync)
 * Pre-auth state → localStorage fallback only
 * Migrates any existing localStorage data to Firestore on first login
 */

const DB = (() => {

  // ── In-memory cache ───────────────────────────────────────────
  let _uid       = null;
  let _words     = [];
  let _history   = [];
  let _stats     = null;
  let _unsubWords = null;
  let _onWordsChange = null;

  // Old storage keys (migration source)
  const LS_WORDS    = 'mein_woerterbuch_words';
  const LS_HISTORY  = 'mein_woerterbuch_history';
  const LS_STATS    = 'mein_woerterbuch_stats';
  const LS_MIGRATED = 'dd_migrated_v1';

  function _defaultStats() {
    return { totalTranslations: 0, totalSaved: 0, streak: 0, lastUsedDate: null, datesUsed: [], xp: 0, badges: {} };
  }

  // ── Init ─────────────────────────────────────────────────────
  async function init(uid, onWordsChangeCallback) {
    // Tear down previous session
    if (_unsubWords) { _unsubWords(); _unsubWords = null; }
    _uid = uid;
    _onWordsChange = onWordsChangeCallback;
    _words   = [];
    _history = [];
    _stats   = null;

    if (!uid) {
      _loadFromLocalStorage();
      return;
    }

    // One-time migration of old localStorage data → Firestore
    await _migrateLocalStorageIfNeeded();

    // Real-time subscription for words
    _subscribeToWords();

    // Load history + stats (one-time fetch, not real-time)
    await Promise.all([_loadHistory(), _loadStats()]);
  }

  // ── Firestore real-time word listener ─────────────────────────
  function _subscribeToWords() {
    const db = firebase.firestore();
    _unsubWords = db
      .collection(`users/${_uid}/words`)
      .orderBy('lastUsed', 'desc')
      .onSnapshot(
        snap => {
          _words = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          if (_onWordsChange) _onWordsChange(_words);
        },
        err => console.error('[DB] onSnapshot error:', err)
      );
  }

  async function _loadHistory() {
    try {
      const snap = await firebase.firestore()
        .collection(`users/${_uid}/history`)
        .orderBy('at', 'desc')
        .limit(50)
        .get();
      _history = snap.docs.map(d => d.data());
    } catch (e) {
      console.warn('[DB] loadHistory:', e.message);
      _history = [];
    }
  }

  async function _loadStats() {
    try {
      const doc = await firebase.firestore()
        .doc(`users/${_uid}/meta/stats`)
        .get();
      _stats = doc.exists ? doc.data() : _defaultStats();
    } catch (e) {
      console.warn('[DB] loadStats:', e.message);
      _stats = _defaultStats();
    }
  }

  // ── One-time localStorage → Firestore migration ────────────────
  async function _migrateLocalStorageIfNeeded() {
    if (localStorage.getItem(LS_MIGRATED)) return;

    let oldWords = [], oldHistory = [], oldStats = null;
    try { oldWords   = JSON.parse(localStorage.getItem(LS_WORDS))   || []; } catch {}
    try { oldHistory = JSON.parse(localStorage.getItem(LS_HISTORY)) || []; } catch {}
    try { oldStats   = JSON.parse(localStorage.getItem(LS_STATS)); }         catch {}

    if (oldWords.length === 0 && oldHistory.length === 0) {
      localStorage.setItem(LS_MIGRATED, '1');
      return;
    }

    console.log(`[DB] Migrating ${oldWords.length} words to Firestore…`);
    try {
      const db = firebase.firestore();
      const batch = db.batch();

      oldWords.forEach(w => {
        batch.set(db.doc(`users/${_uid}/words/${w.id}`), w);
      });
      oldHistory.forEach((h, i) => {
        const id = ((h.english || `h${i}`).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40)) + `_${i}`;
        batch.set(db.doc(`users/${_uid}/history/${id}`), h);
      });
      if (oldStats) {
        batch.set(db.doc(`users/${_uid}/meta/stats`), oldStats);
      }

      await batch.commit();
      localStorage.setItem(LS_MIGRATED, '1');
      localStorage.removeItem(LS_WORDS);
      localStorage.removeItem(LS_HISTORY);
      localStorage.removeItem(LS_STATS);
      console.log('[DB] Migration complete ✓');
    } catch (e) {
      console.error('[DB] Migration failed:', e);
    }
  }

  // ── localStorage fallback (pre-auth only) ─────────────────────
  function _loadFromLocalStorage() {
    try { _words   = JSON.parse(localStorage.getItem(LS_WORDS))   || []; } catch { _words = []; }
    try { _history = JSON.parse(localStorage.getItem(LS_HISTORY)) || []; } catch { _history = []; }
    try { _stats   = JSON.parse(localStorage.getItem(LS_STATS)); }         catch {}
    if (!_stats) _stats = _defaultStats();
    if (_onWordsChange) _onWordsChange(_words);
  }

  // ── Words CRUD ────────────────────────────────────────────────
  function getWords() { return _words; }

  function saveWord(word) {
    const idx = _words.findIndex(w => w.id === word.id);
    if (idx >= 0) _words[idx] = word; else _words.unshift(word);

    if (_uid) {
      firebase.firestore()
        .doc(`users/${_uid}/words/${word.id}`)
        .set(word)
        .catch(e => console.error('[DB] saveWord:', e.message));
    } else {
      try { localStorage.setItem(LS_WORDS, JSON.stringify(_words)); } catch {}
    }
  }

  function deleteWord(id) {
    _words = _words.filter(w => w.id !== id);
    if (_uid) {
      firebase.firestore()
        .doc(`users/${_uid}/words/${id}`)
        .delete()
        .catch(e => console.error('[DB] deleteWord:', e.message));
    } else {
      try { localStorage.setItem(LS_WORDS, JSON.stringify(_words)); } catch {}
    }
  }

  // ── History ───────────────────────────────────────────────────
  function getHistory() { return _history; }

  function addHistory(entry) {
    _history = _history.filter(h => h.english.toLowerCase() !== entry.english.toLowerCase());
    _history.unshift(entry);
    _history = _history.slice(0, 50);

    if (_uid) {
      const id = (entry.english.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 44))
               + '_' + String(entry.at).slice(-6);
      firebase.firestore()
        .doc(`users/${_uid}/history/${id}`)
        .set(entry)
        .catch(e => console.error('[DB] addHistory:', e.message));
    } else {
      try { localStorage.setItem(LS_HISTORY, JSON.stringify(_history)); } catch {}
    }
  }

  // ── Stats ─────────────────────────────────────────────────────
  function getStats() { return _stats || _defaultStats(); }

  function saveStats(stats) {
    _stats = stats;
    if (_uid) {
      firebase.firestore()
        .doc(`users/${_uid}/meta/stats`)
        .set(stats)
        .catch(e => console.error('[DB] saveStats:', e.message));
    } else {
      try { localStorage.setItem(LS_STATS, JSON.stringify(stats)); } catch {}
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────
  function cleanup() {
    if (_unsubWords) { _unsubWords(); _unsubWords = null; }
    _uid = null; _words = []; _history = []; _stats = null;
  }

  return { init, cleanup, getWords, saveWord, deleteWord, getHistory, addHistory, getStats, saveStats };

})();
