/**
 * gemini.js — Gemini AI Client Module
 *
 * Standalone module: no DOM dependencies at load time.
 * Dependencies: none (uses fetch + localStorage).
 *
 * Usage: GeminiClient.callGemini(prompt, responseJson?)
 */

const GeminiClient = (() => {
  const STORAGE_KEY = "mw_gemini_key";
  const MODEL_ID = "gemini-2.5-flash-lite";
  const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
  const PROXY_PATH = "/api/gemini";

  // Mirror of the server's per-user trial allowance, parsed from the
  // X-Trial-Remaining response header on the last proxy call. null = unknown.
  let _lastTrialRemaining = null;
  function getLastTrialRemaining() { return _lastTrialRemaining; }

  // NOTE: No API key is shipped to the browser. The free "trial" runs entirely
  // through the server proxy (/api/gemini), which holds the real key in an env
  // var and meters usage per authenticated user. A user may optionally supply
  // their own key in Settings — that key is used for direct browser→Gemini
  // calls and never leaves their device.

  // ── Key Storage ───────────────────────────────────────────────

  function getKey() {
    return localStorage.getItem(STORAGE_KEY) || "";
  }

  function saveKey(key) {
    const trimmed = (key || "").trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // ── JSON Cleaning ─────────────────────────────────────────────

  function cleanJsonString(str) {
    let clean = str.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
    }
    return clean.trim();
  }

  // ── Core Call ─────────────────────────────────────────────────

  /**
   * Call Gemini. Two routes:
   *   • User-supplied key  → direct browser→Gemini request (key stays on device)
   *   • No key (free tier) → server proxy /api/gemini, which holds the real key
   *                          and meters the trial per authenticated user.
   *
   * @param {string}  prompt
   * @param {boolean} responseJson  - If true, parse response as JSON.
   * @param {string}  [overrideKey] - Optional user key for a direct call.
   * @returns {Promise<string|object>}
   */
  async function callGemini(prompt, responseJson = false, overrideKey = null) {
    const key = overrideKey !== null ? overrideKey : getKey();
    const isFileProtocol = window.location.protocol === "file:";

    // With a user key we can call Gemini directly (and offline-from-server too).
    // Without a key we must go through the proxy; that requires a server.
    if (!key && isFileProtocol) {
      throw new Error(
        "Free AI trial needs the app server. Add your own Gemini key in Settings to use AI here.",
      );
    }

    const requestFn = key
      ? () => _directRequest(prompt, responseJson, key)
      : () => _proxyRequest(prompt, responseJson);

    return _callWithRetry(requestFn, responseJson);
  }

  // ── Internal: Proxy (free trial — server holds the key) ───────

  async function _proxyRequest(prompt, responseJson) {
    const headers = { "Content-Type": "application/json" };

    // Attach the Firebase ID token so the server can identify the user,
    // meter the trial per-uid, and rate-limit. Falls back gracefully if
    // auth isn't ready (server still enforces its own limits).
    let idToken = null;
    if (typeof Auth !== "undefined" && Auth.getIdToken) {
      try { idToken = await Auth.getIdToken(); } catch { /* ignore */ }
    }
    if (idToken) headers["Authorization"] = `Bearer ${idToken}`;

    const r = await fetch(PROXY_PATH, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, responseJson }),
    });

    const contentType = r.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      throw new Error(
        "Free AI trial needs the app server. Please run the project locally (http://localhost:3000) or add your own Gemini key in Settings."
      );
    }

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      // Surface the trial-exhausted signal so callers can show the upgrade modal.
      if (r.status === 429 && (err?.error === "TRIAL_EXHAUSTED")) {
        _lastTrialRemaining = 0;
        const e = new Error(err?.detail || "TRIAL_EXHAUSTED");
        e.code = "TRIAL_EXHAUSTED";
        throw e;
      }
      throw new Error(err?.error || `HTTP ${r.status}`);
    }
    const remHeader = r.headers.get("X-Trial-Remaining");
    if (remHeader != null) _lastTrialRemaining = Number(remHeader);
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini");
    return text;
  }

  // ── Internal: Direct ──────────────────────────────────────────

  async function _directRequest(prompt, responseJson, key) {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
    };
    if (responseJson) {
      body.generationConfig = { responseMimeType: "application/json" };
    }

    const url = `${API_BASE}/${MODEL_ID}:generateContent?key=${key}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(
        `Gemini API Error: ${err?.error?.message || `HTTP ${r.status}`}`,
      );
    }
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini");
    return text;
  }

  // ── Internal: Retry ───────────────────────────────────────────

  async function _callWithRetry(requestFn, responseJson) {
    let lastError = null;
    let delay = 1000;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const text = await requestFn();
        if (responseJson) {
          try {
            return JSON.parse(cleanJsonString(text));
          } catch (e) {
            console.error(
              "[GeminiClient] Failed to parse JSON response:",
              text,
            );
            throw e;
          }
        }
        return text;
      } catch (err) {
        lastError = err;
        console.warn(
          `[GeminiClient] Attempt ${attempt + 1} failed: ${err.message}`,
        );
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
    }
    throw lastError;
  }

  // ── Public API ────────────────────────────────────────────────

  return {
    MODEL_ID,
    getKey,
    saveKey,
    cleanJsonString,
    callGemini,
    getLastTrialRemaining,
  };
})();
