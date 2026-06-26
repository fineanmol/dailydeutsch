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

  /** Access codes that route through server-side proxy */
  const ALLOWED_CODES = ["fineanmol", "admin"];

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

  function isAllowedCode(key) {
    return ALLOWED_CODES.includes((key || "").trim().toLowerCase());
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
   * @param {string}  prompt
   * @param {boolean} responseJson  - If true, parse response as JSON.
   * @param {string}  [overrideKey] - Optional override key.
   * @returns {Promise<string|object>}
   */
  async function callGemini(prompt, responseJson = false, overrideKey = null) {
    const key = overrideKey || getKey();
    if (!key) throw new Error("Gemini API Key is missing. Add it in Settings.");

    const useProxy = isAllowedCode(key) && window.location.protocol !== "file:";
    const requestFn = useProxy
      ? () => _proxyRequest(prompt, responseJson, key)
      : () => _directRequest(prompt, responseJson, key);

    return _callWithRetry(requestFn, responseJson);
  }

  // ── Internal: Proxy ───────────────────────────────────────────

  async function _proxyRequest(prompt, responseJson, code) {
    const r = await fetch(PROXY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, responseJson, geminiCode: code }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error || `HTTP ${r.status}`);
    }
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
    ALLOWED_CODES,
    getKey,
    saveKey,
    isAllowedCode,
    cleanJsonString,
    callGemini,
  };
})();
