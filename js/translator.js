/**
 * translator.js — Translation engine
 *
 * When served via the Node backend (http://), calls /api/translate
 * so API keys stay server-side.  When opened as file:// (dev fallback),
 * calls MyMemory directly from the browser.
 */

const Translator = (() => {

  const SETTINGS_KEY = 'mw_api_settings';

  // Detect if running behind the Node backend
  const IS_SERVER = window.location.protocol !== 'file:';

  // Simple in-memory translation caches to avoid duplicate network requests
  const translationCache = new Map();
  const levelVariationsCache = new Map();

  // ── Settings (client-side overrides for browser-stored keys) ──
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {
        provider: 'auto',
        deeplKey: '',
        googleKey: '',
      };
    } catch {
      return { provider: 'auto', deeplKey: '', googleKey: '' };
    }
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  // ── Active provider label ──────────────────────────────────────
  let _serverStatus = null;
  let _serverStatusPromise = null;

  function fetchServerStatus() {
    if (!IS_SERVER) {
      _serverStatus = null;
      return Promise.resolve(null);
    }
    if (_serverStatusPromise) return _serverStatusPromise;

    _serverStatusPromise = (async () => {
      try {
        const r = await fetch('/api/config-status');
        if (!r.ok) {
          _serverStatus = null;
          return null;
        }
        // Verify response is JSON (static servers like Firebase Hosting return HTML on rewrites)
        const contentType = r.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          _serverStatus = null;
          return null;
        }
        _serverStatus = await r.json();
        return _serverStatus;
      } catch (e) {
        _serverStatus = null;
        return null;
      }
    })();

    return _serverStatusPromise;
  }

  function getActiveProviderName() {
    const s = loadSettings();
    const useCustomDeepl = localStorage.getItem('dd_use_custom_deepl') !== '0';
    
    // 1. Explicit provider selections
    if (s.provider === 'deepl' && s.deeplKey && useCustomDeepl) return 'DeepL';
    if (s.provider === 'google' && s.googleKey) return 'Google';
    if (s.provider === 'mymemory') return 'MyMemory';
    
    // 2. Auto / default behavior
    if (s.provider === 'auto' || s.provider === 'deepl') {
      if (s.deeplKey && useCustomDeepl) return 'DeepL';
      // If we don't have a custom key, check if the server has a key and we didn't disable DeepL
      if (useCustomDeepl && _serverStatus && _serverStatus.hasDeeplKey) return 'DeepL';
    }
    
    if (s.provider === 'auto' || s.provider === 'google') {
      if (s.googleKey) return 'Google';
    }
    
    return 'MyMemory';
  }

  // ── Translate via backend (/api/translate) ────────────────────
  async function translateViaServer(text, from = 'en', to = 'de') {
    const settings = loadSettings();
    const useCustomDeepl = localStorage.getItem('dd_use_custom_deepl') !== '0';
    
    // Determine the provider to send to the server
    let providerToSend = settings.provider;
    if (providerToSend === 'auto' || providerToSend === 'deepl') {
      if (!useCustomDeepl) {
        // If DeepL is disabled by the user, force server to use mymemory (or google if they have a key)
        providerToSend = settings.googleKey ? 'google' : 'mymemory';
      }
    }
    
    const deeplKeyToSend = useCustomDeepl ? settings.deeplKey : '';
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, provider: providerToSend, from, to, deeplKey: deeplKeyToSend, googleKey: settings.googleKey }),
    });
    if (!r.ok) throw new Error(`Server ${r.status}`);
    const contentType = r.headers.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('Server returned HTML instead of JSON (app server is not running).');
    }
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    return data;   // { text, provider, alternatives? }
  }

  // ── Synonyms via backend ──────────────────────────────────────
  async function synonymsViaServer(text, from = 'en', to = 'de') {
    try {
      const r = await fetch('/api/synonyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from, to }),
      });
      const d = await r.json();
      return d.alternatives || [];
    } catch { return []; }
  }

  // ── Direct MyMemory (file:// fallback) ────────────────────────
  async function translateMyMemoryDirect(text, from = 'en', to = 'de') {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${from}|${to}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`MyMemory ${r.status}`);
    const d = await r.json();
    if (d.responseStatus !== 200) throw new Error(d.responseDetails || 'Failed');

    const main = (d.responseData?.translatedText || '').trim();
    const alternatives = [];
    const seen = new Set([main.toLowerCase()]);
    for (const m of (d.matches || [])) {
      const t = (m.translation || '').trim();
      if (t && !seen.has(t.toLowerCase()) && !t.toUpperCase().startsWith('MYMEMORY') && !t.toUpperCase().startsWith('PLEASE')) {
        seen.add(t.toLowerCase());
        alternatives.push({ text: t, quality: Number(m.quality) || 0 });
        if (alternatives.length >= 10) break;
      }
    }
    alternatives.sort((a, b) => b.quality - a.quality);
    return { text: main, alternatives, provider: 'MyMemory' };
  }

  // ── Main translate ────────────────────────────────────────────
  async function translate(text, from = 'en', to = 'de') {
    if (!text?.trim()) return null;
    const cleanText = text.trim();
    const cacheKey = `${from}-${to}:${cleanText}`;

    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    const status = await fetchServerStatus();
    let result;

    if (IS_SERVER && status) {
      // Ask the backend (keeps API keys safe)
      const main = await translateViaServer(cleanText, from, to);
      // Fetch synonyms separately if main didn't include them
      if (!main.alternatives || main.alternatives.length === 0) {
        main.alternatives = await synonymsViaServer(cleanText, from, to);
      }
      // Filter out the main translation from alternatives
      if (main.alternatives) {
        main.alternatives = main.alternatives.filter(
          a => a.text.toLowerCase() !== main.text.toLowerCase()
        );
      }
      result = main;
    } else {
      // file:// fallback or static hosting fallback — call MyMemory directly from browser
      result = await translateMyMemoryDirect(cleanText, from, to);
    }

    if (result) {
      translationCache.set(cacheKey, result);
    }
    return result;
  }

  // ── Level Variations ──────────────────────────────────────────
  // Uses MyMemory matches scored by complexity to show A1–B2 styles
  async function translateAllLevels(text, primaryTranslation) {
    if (!text?.trim()) return null;
    const cleanText = text.trim();
    const cacheKey = `${cleanText}||${primaryTranslation}`;
    if (levelVariationsCache.has(cacheKey)) {
      return levelVariationsCache.get(cacheKey);
    }

    try {
      let alternatives = [];

      const status = await fetchServerStatus();

      if (IS_SERVER && status) {
        alternatives = await synonymsViaServer(text);
      } else {
        const mm = await translateMyMemoryDirect(text);
        alternatives = mm.alternatives || [];
      }

      const all = [
        { text: primaryTranslation },
        ...alternatives,
      ].filter(a => a.text && a.text.length > 0);

      // Deduplicate
      const seen = new Set();
      const unique = [];
      for (const item of all) {
        const k = item.text.toLowerCase().trim();
        if (!seen.has(k)) { seen.add(k); unique.push(item); }
      }

      // Score by complexity: word count + avg word length = CEFR proxy
      const scored = unique.map(item => {
        const words = item.text.trim().split(/\s+/);
        const avgLen = words.reduce((s, w) => s + w.replace(/[^a-zA-ZäöüÄÖÜß]/g, '').length, 0) / words.length;
        return { ...item, score: words.length * 0.5 + avgLen * 0.5 };
      }).sort((a, b) => a.score - b.score);

      const n = scored.length;
      const pick = f => scored[Math.min(Math.floor(n * f), n - 1)];

      const meta = {
        A1: { note: 'Very basic: short, everyday words',          style: 'Simple everyday vocabulary' },
        A2: { note: 'Elementary: common phrases & simple grammar', style: 'Elementary phrasing' },
        B1: { note: 'Intermediate: natural, standard expression',  style: 'Natural conversational' },
        B2: { note: 'Upper-intermediate: precise word choice',     style: 'More formal / precise' },
      };

      let variationsResult;
      if (n >= 4) {
        variationsResult = {
          A1: { ...pick(0),    ...meta.A1 },
          A2: { ...pick(0.30), ...meta.A2 },
          B1: { ...pick(0.60), ...meta.B1 },
          B2: { ...pick(0.95), ...meta.B2 },
        };
      } else if (n === 3) {
        variationsResult = {
          A1: { ...scored[0], ...meta.A1 },
          A2: { ...scored[1], ...meta.A2 },
          B1: { ...scored[2], ...meta.B1 },
          B2: { ...scored[2], ...meta.B2, note: 'Same as B1 — limited variants found' },
        };
      } else if (n === 2) {
        variationsResult = {
          A1: { ...scored[0], ...meta.A1 },
          A2: { ...scored[0], ...meta.A2 },
          B1: { ...scored[1], ...meta.B1 },
          B2: { ...scored[1], ...meta.B2 },
        };
      } else {
        const lvl = typeof CEFR !== 'undefined' ? CEFR.getLevel(scored[0]?.text || '') : 'B1';
        variationsResult = {
          A1: { ...scored[0], ...meta.A1, note: `Word is ${lvl} level — limited variants` },
          A2: { ...scored[0], ...meta.A2, note: `Word is ${lvl} level — limited variants` },
          B1: { ...scored[0], ...meta.B1, note: `Word is ${lvl} level — limited variants` },
          B2: { ...scored[0], ...meta.B2, note: `Word is ${lvl} level — limited variants` },
        };
      }

      levelVariationsCache.set(cacheKey, variationsResult);
      return variationsResult;
    } catch (e) {
      console.error('Level variations failed:', e);
      return null;
    }
  }

  // ── Firebase config from server ───────────────────────────────
  async function getFirebaseConfig() {
    if (!IS_SERVER) return null;
    try {
      const r = await fetch('/api/firebase-config');
      return await r.json();
    } catch { return null; }
  }

  // Initialise: fetch server status on load
  fetchServerStatus();

  return {
    translate,
    translateAllLevels,
    loadSettings,
    saveSettings,
    getActiveProviderName,
    fetchServerStatus,
    getFirebaseConfig,
    get isServer() { return IS_SERVER; },
    get serverStatus() { return _serverStatus; },
  };

})();
