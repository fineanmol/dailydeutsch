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
const { jwtVerify, createRemoteJWKSet } = require('jose');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));   // serves index.html + js/ + css/

// ── Firebase ID-token verification (no service account needed) ────
// Verifies the token signature against Google's public keys and checks
// issuer/audience against the project. Identifies the user so we can
// meter the free AI trial per-uid and rate-limit abuse.
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'my-german-builder';
const _jwks = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
));

async function verifyIdToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, _jwks, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    // sub is the Firebase uid
    return payload.sub ? { uid: payload.sub, ...payload } : null;
  } catch (e) {
    console.warn('[auth] token verify failed:', e.message);
    return null;
  }
}

// ── In-memory trial + rate limiting (per-uid / per-ip) ────────────
// Note: in-memory state resets on serverless cold start. For a single
// always-on instance it works; for multi-instance/serverless, back this
// with a shared store (Redis / Firestore). The free trial cap is a soft
// abuse guard, not a billing-critical boundary.
const TRIAL_LIMIT      = Number(process.env.TRIAL_LIMIT || 3);
const RATE_WINDOW_MS   = 60 * 1000;
const RATE_MAX_PER_MIN = Number(process.env.RATE_MAX_PER_MIN || 20);

const _trialUsed = new Map();   // uid -> count (lifetime, this instance)
const _rate      = new Map();   // key -> { count, resetAt }

function rateLimited(key) {
  const now = Date.now();
  const rec = _rate.get(key);
  if (!rec || now > rec.resetAt) {
    _rate.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX_PER_MIN;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();
}

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
  const { text, provider: clientProvider, from = 'en', to = 'de', deeplKey: clientDeeplKey, googleKey: clientGoogleKey } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });
  if (rateLimited(`translate:${clientIp(req)}`)) {
    return res.status(429).json({ error: 'Too many translation requests — please slow down.' });
  }

  const fromLang = from.toLowerCase();
  const toLang   = to.toLowerCase();

  const serverDeeplKey = process.env.DEEPL_KEY || '';

  // Prefer a real user-supplied DeepL key; otherwise fall back to the
  // server's own key. (No access-code scheme — that exposed a shared key.)
  let activeDeeplKey = '';
  const clientKeyTrimmed = (clientDeeplKey || '').trim();
  if (clientKeyTrimmed && (clientKeyTrimmed.includes('-') || clientKeyTrimmed.length > 20)) {
    activeDeeplKey = clientKeyTrimmed;
  } else if (serverDeeplKey) {
    activeDeeplKey = serverDeeplKey;
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
  const activeGoogleKey = (clientGoogleKey && clientGoogleKey.trim()) || googleKey;
  if (!result && (pref === 'auto' || pref === 'google') && activeGoogleKey) {
    try {
      const r = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${activeGoogleKey.trim()}`,
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

// ── Gemini proxy (free trial — server holds the key) ──────────
// Auth: requires a valid Firebase ID token. Meters a per-user free
// trial and rate-limits. No client-side key or access code involved.
app.post('/api/gemini', async (req, res) => {
  const { prompt, responseJson = false } = req.body;

  const serverGeminiKey = process.env.GEMINI_KEY || process.env.GOOGLE_KEY || '';
  if (!serverGeminiKey) {
    return res.status(503).json({ error: 'AI is temporarily unavailable (server key not configured).' });
  }
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  // Identify the caller.
  const user = await verifyIdToken(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'Please sign in to use the free AI trial.' });
  }

  // Rate limit (per-uid).
  if (rateLimited(`gemini:${user.uid}`)) {
    return res.status(429).json({ error: 'Too many requests — slow down a moment and try again.' });
  }

  // Meter the free trial per-uid.
  const used = _trialUsed.get(user.uid) || 0;
  if (used >= TRIAL_LIMIT) {
    return res.status(429).json({
      error: 'TRIAL_EXHAUSTED',
      detail: `You've used all ${TRIAL_LIMIT} free AI trials. Add your own Gemini key in Settings for unlimited use.`,
    });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${serverGeminiKey.trim()}`;
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
    // Count the trial only on a successful generation.
    _trialUsed.set(user.uid, used + 1);
    res.set('X-Trial-Remaining', String(Math.max(0, TRIAL_LIMIT - (used + 1))));
    res.json(data);
  } catch (e) {
    console.error('Gemini proxy failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  const d = process.env.DEEPL_KEY  ? '✅ DeepL'                     : '❌ DeepL (no key)';
  const g = process.env.GOOGLE_KEY ? '✅ Google'                   : '❌ Google (no key)';
  const gemini = (process.env.GEMINI_KEY || process.env.GOOGLE_KEY) ? '✅ Gemini (token-auth trial)' : '❌ Gemini (no key)';
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
