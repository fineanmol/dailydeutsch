/**
 * server.js — Mein Wörterbuch backend
 *
 * Responsibilities:
 *   • Serves the static frontend
 *   • Proxies translation requests (keeps API keys server-side)
 *   • Exposes Firebase config to the frontend (never the admin SDK key)
 *   • Settings persistence via .env / environment variables
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const fetch      = require('node-fetch');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));   // serves index.html + js/ + css/

// ── Health ────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── Config status (safe — no keys exposed) ────────────────────
app.get('/api/config-status', (_req, res) => {
  const deeplKey  = process.env.DEEPL_KEY  || '';
  const googleKey = process.env.GOOGLE_KEY || '';

  let active = 'MyMemory';
  const pref = process.env.TRANSLATION_PROVIDER || 'auto';
  if ((pref === 'auto' || pref === 'deepl')  && deeplKey)  active = 'DeepL';
  else if ((pref === 'auto' || pref === 'google') && googleKey) active = 'Google';

  res.json({
    hasDeeplKey:  !!deeplKey,
    hasGoogleKey: !!googleKey,
    hasFirebase:  !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_API_KEY),
    activeProvider: active,
    provider: pref,
  });
});

// ── Firebase client config (safe to send to browser) ──────────
app.get('/api/firebase-config', (_req, res) => {
  if (!process.env.FIREBASE_API_KEY || !process.env.FIREBASE_PROJECT_ID) {
    return res.json({ configured: false });
  }
  res.json({
    configured: true,
    apiKey:            process.env.FIREBASE_API_KEY,
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId:         process.env.FIREBASE_PROJECT_ID,
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             process.env.FIREBASE_APP_ID              || '',
  });
});

// ── Translation proxy ─────────────────────────────────────────
app.post('/api/translate', async (req, res) => {
  const { text, provider: clientProvider, from = 'en', to = 'de', deeplKey: clientDeeplKey } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

  const fromLang = from.toLowerCase();
  const toLang   = to.toLowerCase();

  const serverDeeplKey = process.env.DEEPL_KEY || '';
  const allowedCodes   = (process.env.DEEPL_CODES || 'fineanmol').split(',').map(c => c.trim().toLowerCase());

  let activeDeeplKey = '';
  if (clientDeeplKey) {
    const trimmed = clientDeeplKey.trim();
    if (allowedCodes.includes(trimmed.toLowerCase())) {
      activeDeeplKey = serverDeeplKey;
    } else if (trimmed.includes('-') || trimmed.length > 20) {
      activeDeeplKey = trimmed;
    }
  }

  const googleKey = process.env.GOOGLE_KEY || '';
  const envPref   = process.env.TRANSLATION_PROVIDER || 'auto';
  // Client preference overrides env
  const pref = clientProvider || envPref;

  let result = null;

  // ── Try DeepL ────────────────────────────────────────────────
  if (!result && (pref === 'auto' || pref === 'deepl') && activeDeeplKey) {
    try {
      const isFree = activeDeeplKey.trim().endsWith(':fx');
      const url = isFree
        ? 'https://api-free.deepl.com/v2/translate'
        : 'https://api.deepl.com/v2/translate';

      const targetLangMapped = toLang === 'en' ? 'EN-US' : toLang.toUpperCase();

      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `DeepL-Auth-Key ${activeDeeplKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: [text], source_lang: fromLang.toUpperCase(), target_lang: targetLangMapped }),
      });
      if (r.ok) {
        const d = await r.json();
        result = { text: d.translations[0].text, provider: 'DeepL' };
      } else {
        console.warn('DeepL returned', r.status);
      }
    } catch (e) { console.warn('DeepL failed:', e.message); }
  }

  // ── Try Google Translate ──────────────────────────────────────
  if (!result && (pref === 'auto' || pref === 'google') && googleKey) {
    try {
      const r = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${googleKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: text, source: fromLang, target: toLang, format: 'text' }),
        }
      );
      if (r.ok) {
        const d = await r.json();
        result = { text: d.data.translations[0].translatedText, provider: 'Google' };
      } else {
        console.warn('Google returned', r.status);
      }
    } catch (e) { console.warn('Google failed:', e.message); }
  }

  // ── Fallback: MyMemory (free) ─────────────────────────────────
  if (!result) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${fromLang}|${toLang}`;
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        if (d.responseStatus === 200) {
          const alternatives = [];
          const seen = new Set([d.responseData.translatedText.toLowerCase()]);
          for (const m of (d.matches || [])) {
            const t = (m.translation || '').trim();
            if (t && !seen.has(t.toLowerCase()) && !t.toUpperCase().startsWith('MYMEMORY') && !t.toUpperCase().startsWith('PLEASE')) {
              seen.add(t.toLowerCase());
              alternatives.push({ text: t, quality: Number(m.quality) || 0 });
              if (alternatives.length >= 10) break;
            }
          }
          alternatives.sort((a, b) => b.quality - a.quality);
          result = { text: d.responseData.translatedText, provider: 'MyMemory', alternatives };
        }
      }
    } catch (e) { console.warn('MyMemory failed:', e.message); }
  }

  if (!result) return res.status(500).json({ error: 'All translation providers failed' });
  res.json(result);
});

// ── Synonyms (always from MyMemory, separate call) ────────────
app.post('/api/synonyms', async (req, res) => {
  const { text, from = 'en', to = 'de' } = req.body;
  if (!text) return res.json({ alternatives: [] });

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${from.toLowerCase()}|${to.toLowerCase()}`;
    const r = await fetch(url);
    const d = await r.json();

    const alternatives = [];
    if (d.matches) {
      const seen = new Set();
      for (const m of d.matches) {
        const t = (m.translation || '').trim();
        if (t && !seen.has(t.toLowerCase()) && !t.toUpperCase().startsWith('MYMEMORY')) {
          seen.add(t.toLowerCase());
          alternatives.push({ text: t, quality: Number(m.quality) || 0 });
          if (alternatives.length >= 10) break;
        }
      }
    }
    res.json({ alternatives });
  } catch (e) {
    res.json({ alternatives: [] });
  }
});

// ── Gemini proxy ──────────────────────────────────────────────
app.post('/api/gemini', async (req, res) => {
  const { prompt, responseJson = false, geminiCode } = req.body;

  const serverGeminiKey = process.env.GEMINI_KEY || process.env.GOOGLE_KEY || '';
  const allowedCodes    = (process.env.DEEPL_CODES || 'fineanmol').split(',').map(c => c.trim().toLowerCase());

  if (!geminiCode || !allowedCodes.includes(geminiCode.trim().toLowerCase())) {
    return res.status(401).json({ error: 'Unauthorized: Invalid access code' });
  }

  if (!serverGeminiKey) {
    return res.status(503).json({ error: 'Service Unavailable: Server Gemini API key not configured' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${serverGeminiKey.trim()}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }]
    };
    if (responseJson) {
      body.generationConfig = {
        responseMimeType: "application/json"
      };
    }

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const errData = await r.json().catch(() => ({}));
      const msg = errData?.error?.message || `HTTP ${r.status}`;
      return res.status(r.status).json({ error: `Gemini API Error: ${msg}` });
    }

    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error('Gemini proxy failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  const d = process.env.DEEPL_KEY  ? '✅ DeepL (code-auth active)' : '❌ DeepL (no key)';
  const g = process.env.GOOGLE_KEY ? '✅ Google'                   : '❌ Google (no key)';
  const gemini = (process.env.GEMINI_KEY || process.env.GOOGLE_KEY) ? '✅ Gemini (code-auth active)' : '❌ Gemini (no key)';
  const f = process.env.FIREBASE_PROJECT_ID ? '✅ Firebase'        : '❌ Firebase (not configured)';
  console.log(`
╔══════════════════════════════════════╗
║   🇩🇪  Mein Wörterbuch  — ready      ║
╠══════════════════════════════════════╣
║  → http://localhost:${PORT}             ║
╠══════════════════════════════════════╣
║  ${d.padEnd(35)}║
║  ${g.padEnd(35)}║
║  ${gemini.padEnd(35)}║
║  ${f.padEnd(35)}║
╚══════════════════════════════════════╝

  💡 Copy .env.example → .env and add your API keys to unlock DeepL / Google / Firebase
`);
});
