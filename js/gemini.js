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
  const TRIAL_LIMIT = 5;          // lifetime free AI calls per signed-in account

  // How many trial calls remain for the current account, derived from
  // Firestore (trialUsage/{uid}.count). null = unknown until first read.
  let _lastTrialRemaining = null;
  function getLastTrialRemaining() { return _lastTrialRemaining; }

  // NOTE: No API key is shipped in this file. There are two routes:
  //   • The user's OWN key (Settings) → direct browser→Gemini, never leaves device.
  //   • The free trial → the shared key lives in a protected Firestore doc
  //     (config/trial), readable only while the account is under its lifetime
  //     quota. Usage is metered in trialUsage/{uid} with Firestore rules that
  //     only allow the counter to increase by 1 (no client resets), so clearing
  //     localStorage cannot restore trials. This is the no-backend,
  //     Firebase-free-tier design — no Cloud Functions / paid services needed.
  let _cachedTrialKey = null;     // in-memory only; never persisted

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
   *   • No key (free trial) → consume one trial unit (Firestore-metered), fetch
   *                           the shared trial key from Firestore, call directly.
   *
   * @param {string}  prompt
   * @param {boolean} responseJson  - If true, parse response as JSON.
   * @param {string}  [overrideKey] - Optional user key for a direct call.
   * @returns {Promise<string|object>}
   */
  async function callGemini(prompt, responseJson = false, overrideKey = null) {
    const key = overrideKey !== null ? overrideKey : getKey();

    if (key) {
      // User's own key — unlimited, no trial accounting.
      return _callWithRetry(() => _directRequest(prompt, responseJson, key), responseJson);
    }

    // Free trial. Consume a unit FIRST (atomic, rules-guarded), then fetch the
    // shared key and call. Consuming first means a user can't read the key
    // without it counting against their quota.
    const trialKey = await _consumeTrialAndGetKey();
    return _callWithRetry(() => _directRequest(prompt, responseJson, trialKey), responseJson);
  }

  // ── Internal: Free trial via Firestore ────────────────────────
  // Increments trialUsage/{uid}.count (rules enforce +1, max TRIAL_LIMIT),
  // then reads the shared key from config/trial (rules allow the read only
  // while the account is within quota). Throws TRIAL_EXHAUSTED when spent.
  async function _consumeTrialAndGetKey() {
    if (typeof firebase === "undefined" || !firebase.firestore) {
      throw new Error("AI features need an internet connection. Please try again online.");
    }
    const uid = (typeof Auth !== "undefined" && Auth.getUid) ? Auth.getUid() : null;
    if (!uid) {
      const e = new Error("Please sign in to use the free AI trial.");
      e.code = "NOT_SIGNED_IN";
      throw e;
    }

    const db = firebase.firestore();
    const usageRef = db.doc(`trialUsage/${uid}`);

    // Atomically reserve one trial unit. The transaction (and the matching
    // Firestore rules) guarantee count only ever goes up by 1 and never past
    // the cap — so clearing localStorage / re-creating docs can't cheat it.
    let usedAfter;
    try {
      usedAfter = await db.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef);
        const current = snap.exists ? (snap.data().count || 0) : 0;
        if (current >= TRIAL_LIMIT) {
          const e = new Error("TRIAL_EXHAUSTED");
          e.code = "TRIAL_EXHAUSTED";
          throw e;
        }
        const next = current + 1;
        tx.set(usageRef, { count: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        return next;
      });
    } catch (err) {
      if (err && err.code === "TRIAL_EXHAUSTED") {
        _lastTrialRemaining = 0;
        throw err;
      }
      throw err;
    }

    _lastTrialRemaining = Math.max(0, TRIAL_LIMIT - usedAfter);

    // Fetch the shared key (cached in memory for the session after first read).
    if (!_cachedTrialKey) {
      try {
        const cfg = await db.doc("config/trial").get();
        _cachedTrialKey = cfg.exists ? (cfg.data().key || "") : "";
      } catch (e) {
        throw new Error("The free AI trial is temporarily unavailable. Add your own Gemini key in Settings to continue.");
      }
    }
    if (!_cachedTrialKey) {
      throw new Error("The free AI trial isn't configured yet. Add your own Gemini key in Settings to use AI features.");
    }
    return _cachedTrialKey;
  }

  // Read current trial usage without consuming it — used to sync UI badges
  // on load. Returns remaining count, or null if unknown/not signed in.
  async function refreshTrialRemaining() {
    if (getKey()) { _lastTrialRemaining = Infinity; return Infinity; }
    if (typeof firebase === "undefined" || !firebase.firestore) return null;
    const uid = (typeof Auth !== "undefined" && Auth.getUid) ? Auth.getUid() : null;
    if (!uid) return null;
    try {
      const snap = await firebase.firestore().doc(`trialUsage/${uid}`).get();
      const used = snap.exists ? (snap.data().count || 0) : 0;
      _lastTrialRemaining = Math.max(0, TRIAL_LIMIT - used);
      return _lastTrialRemaining;
    } catch {
      return null;
    }
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
    TRIAL_LIMIT,
    getKey,
    saveKey,
    cleanJsonString,
    callGemini,
    getLastTrialRemaining,
    refreshTrialRemaining,
  };
})();
