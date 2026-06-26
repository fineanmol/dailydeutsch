/**
 * app.js — Main application orchestrator
 *
 * Dependencies (must load before this file):
 *   gemini.js  → GeminiClient   (AI calls, key storage)
 *   ui.js      → UI             (toast, modal, escHtml, utils)
 *   translator.js, wordbank.js, exercises.js, insights.js, db.js, auth.js
 *
 * Features: Translation, Word Bank, Exercises, Insights, Settings,
 *           Synonyms, CEFR Badges, Level Variations, Verb Conjugations
 */

const App = (() => {

  // Starter vocabulary used when the word bank is empty now lives in
  // features/exercises.js (ExerciseEngine.STARTER_WORDS).

  // Determine Environment Mode immediately on script run
  const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  document.body.classList.toggle('prod-mode', isProd);
  document.body.classList.toggle('dev-mode', !isProd);

  function getLearningLangName() {
    return (typeof LanguageSupport !== 'undefined') ? LanguageSupport.getCurrent().name : 'German';
  }

  // ── Text-to-Speech Pronunciation ──────────────────────────────
  function speakText(text, lang = 'de-DE') {
    if (!text || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;

    // Apply speech rate preference
    const rateStr = localStorage.getItem('dd_speech_rate') || '1.0';
    utterance.rate = parseFloat(rateStr);

    const voices = window.speechSynthesis.getVoices();
    const prefix = lang.split('-')[0];
    const matchVoice = voices.find(voice => voice.lang.startsWith(prefix) || voice.lang === lang);
    if (matchVoice) utterance.voice = matchVoice;
    window.speechSynthesis.speak(utterance);
  }

  function speakGerman(text) {
    const langToTtsCode = {
      de: 'de-DE',
      es: 'es-ES',
      fr: 'fr-FR',
      it: 'it-IT',
      tr: 'tr-TR',
      zh: 'zh-CN',
      ar: 'ar-SA'
    };
    const learningLang = localStorage.getItem('dd_learning_lang') || 'de';
    const code = langToTtsCode[learningLang] || 'de-DE';
    speakText(text, code);
  }

  // Pre-load voices cache
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
  }

  // ── Noun Gender Highlighting ─────────────────────────────────
  function formatGermanWord(text) {
    if (!text) return '';
    const learningLang = localStorage.getItem('dd_learning_lang') || 'de';
    const trimmed = text.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1) {
      const first = parts[0].toLowerCase();
      if (learningLang === 'de') {
        if (first === 'der') return `<span class="article-masc">der</span> ${escHtml(parts.slice(1).join(' '))}`;
        if (first === 'die') return `<span class="article-fem">die</span> ${escHtml(parts.slice(1).join(' '))}`;
        if (first === 'das') return `<span class="article-neu">das</span> ${escHtml(parts.slice(1).join(' '))}`;
      } else if (learningLang === 'fr') {
        if (first === 'le') return `<span class="article-masc">le</span> ${escHtml(parts.slice(1).join(' '))}`;
        if (first === 'la') return `<span class="article-fem">la</span> ${escHtml(parts.slice(1).join(' '))}`;
      } else if (learningLang === 'es') {
        if (first === 'el') return `<span class="article-masc">el</span> ${escHtml(parts.slice(1).join(' '))}`;
        if (first === 'la') return `<span class="article-fem">la</span> ${escHtml(parts.slice(1).join(' '))}`;
      } else if (learningLang === 'it') {
        if (['il', 'lo'].includes(first)) return `<span class="article-masc">${first}</span> ${escHtml(parts.slice(1).join(' '))}`;
        if (first === 'la') return `<span class="article-fem">la</span> ${escHtml(parts.slice(1).join(' '))}`;
      }
    }
    return escHtml(text);
  }

  // ── Gemini AI — delegating to GeminiClient module ───────────
  //    All Gemini logic lives in js/gemini.js (GeminiClient).
  //    These wrappers keep the existing call sites in this file working.

  const getGeminiKey    = () => {
    if (localStorage.getItem('dd_use_custom_gemini') === '0') return '';
    return GeminiClient.getKey();
  };
  const saveGeminiKey   = (k) => GeminiClient.saveKey(k);
  const cleanJsonString = (s) => GeminiClient.cleanJsonString(s);
  const isAIEnabled     = () => localStorage.getItem('dd_ai_enabled') !== '0';

  // ── Trial AI System ───────────────────────────────────────────
  // The free trial is metered in FIRESTORE (trialUsage/{uid}.count), guarded
  // by security rules so it can't be reset client-side. No key ships in JS —
  // the shared trial key lives in a protected Firestore doc. The values below
  // are a UI mirror, synced from GeminiClient (which reads Firestore).
  const TRIAL_LIMIT = GeminiClient.TRIAL_LIMIT;   // keep in lock-step with the client
  let _trialRemainingMirror = null;   // null = unknown until first Firestore read

  function getTrialUsedCount() {
    if (getGeminiKey()) return 0;
    if (_trialRemainingMirror == null) return 0;
    return Math.max(0, TRIAL_LIMIT - _trialRemainingMirror);
  }

  function getTrialRemaining() {
    if (getGeminiKey()) return Infinity;
    return _trialRemainingMirror == null ? TRIAL_LIMIT : _trialRemainingMirror;
  }

  function setTrialRemaining(n) {
    if (typeof n === 'number' && !Number.isNaN(n)) {
      _trialRemainingMirror = Math.max(0, n);
      updateTrialBadges();
    }
  }

  function hasTrialRemaining() {
    if (getGeminiKey()) return true;
    return getTrialRemaining() > 0;
  }

  function updateTrialBadges() {
    const aiEnabled = isAIEnabled();

    // Toggle visibility of AI cards/entry points
    const auditorCard = document.getElementById('mode-auditor');
    if (auditorCard) {
      auditorCard.classList.toggle('hidden', !aiEnabled);
    }
    const storyCard = document.getElementById('insights-ai-story-card');
    if (storyCard) {
      storyCard.classList.toggle('hidden', !aiEnabled);
    }

    const count = getTrialUsedCount();
    const remaining = Math.max(0, TRIAL_LIMIT - count);
    const hasKey = !!getGeminiKey();
    
    const badgeText = hasKey ? "" : `(${remaining} left)`;
    document.querySelectorAll('.trial-badge').forEach(badge => {
      badge.textContent = badgeText;
      badge.style.display = (hasKey || remaining === 0 || !aiEnabled) ? 'none' : 'inline-block';
    });

    const storyDesc = document.getElementById('ai-story-description');
    if (storyDesc) {
      if (hasKey) {
        storyDesc.innerHTML = 'Generate a custom German story utilizing words from your Word Bank.';
      } else if (remaining > 0) {
        storyDesc.innerHTML = `Generate a custom German story utilizing words from your Word Bank. <span style="color: var(--primary); font-weight:600;">(${remaining} free AI trials left)</span>`;
      } else {
        storyDesc.innerHTML = 'Connect a free Gemini API Key in Settings to generate custom stories, or upgrade to Pro.';
      }
    }

    const warning = document.getElementById('auditor-key-warning');
    const sandbox = document.getElementById('auditor-sandbox');
    if (warning) {
      warning.classList.toggle('hidden', hasKey || remaining > 0 || !aiEnabled);
    }
    if (sandbox) {
      sandbox.classList.toggle('hidden', hasKey || !aiEnabled);
    }
  }

  function showProInterestModal() {
    const email = (typeof Auth !== 'undefined') ? (Auth.getEmail() || '') : '';
    const modalHtml = `
      <div class="pro-modal-content" style="text-align: left; line-height: 1.5; font-size: 0.95rem;">
        <p style="margin: 0 0 1.25rem 0; color: var(--text-secondary);">
          You've used all <strong>${TRIAL_LIMIT}</strong> free trial uses of our AI teacher tools.
        </p>
        <p style="margin: 0 0 1.25rem 0; font-weight: 500; color: var(--text-primary);">
          Would you be interested in a <strong>Daily Deutsch Pro</strong> plan with unlimited AI scans, personalized grammar explanations, and context reading stories?
        </p>
        <div style="background: rgba(14, 190, 255, 0.05); border: 1px solid rgba(14, 190, 255, 0.15); border-radius: 8px; padding: 12px; margin-bottom: 1.5rem; font-size: 0.88rem; color: var(--text-secondary);">
          🎯 <strong>Pro features include:</strong>
          <ul style="margin: 6px 0 0 0; padding-left: 18px; line-height: 1.4;">
            <li>Unlimited AI Grammar Auditing</li>
            <li>Custom contextual AI Reading Stories</li>
            <li>In-exercise AI Grammar Explanations</li>
            <li>Priority translator server bandwidth</li>
          </ul>
        </div>
        
        <div style="margin-bottom: 1.25rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; color: var(--text-primary);">Your Email Address</label>
          <input type="email" id="waitlist-email" class="input" style="width: 100%; box-sizing: border-box;" value="${escHtml(email)}" placeholder="you@example.com" />
        </div>
        
        <div style="margin-bottom: 1.5rem; display: flex; align-items: flex-start; gap: 8px;">
          <input type="checkbox" id="waitlist-notify" checked style="margin-top: 3px;" />
          <label for="waitlist-notify" style="font-size: 0.82rem; color: var(--text-secondary); cursor: pointer; user-select: none;">
            Yes, notify me when Pro launches (estimate: €3/month).
          </label>
        </div>
        
        <div style="display: flex; gap: 10px; flex-direction: column;">
          <button class="btn btn-primary w-full" id="waitlist-submit" onclick="App.submitProInterest()" style="justify-content: center; display: flex; padding: 12px;">
            Yes, I'm interested! 🚀
          </button>
          <button class="btn btn-ghost w-full" onclick="App.closeModal()" style="justify-content: center; display: flex;">
            Not right now
          </button>
        </div>
        
        <p style="font-size: 0.78rem; text-align: center; color: var(--text-muted); margin-top: 1rem; margin-bottom: 0;">
          Or connect your own free Gemini API Key in Settings to get unlimited usage for free!
        </p>
      </div>
    `;
    
    showModal("Upgrade to Daily Deutsch Pro", modalHtml);
  }

  async function submitProInterest() {
    const emailInput = document.getElementById('waitlist-email');
    const notifyCheck = document.getElementById('waitlist-notify');
    const submitBtn = document.getElementById('waitlist-submit');
    if (!emailInput) return;
    
    const email = emailInput.value.trim();
    if (!email) {
      showToast('Please enter a valid email address!', 'error');
      return;
    }
    
    const interested = notifyCheck ? notifyCheck.checked : true;
    
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }
    
    try {
      const uid = (typeof Auth !== 'undefined') ? Auth.getUid() : null;
      const displayName = (typeof Auth !== 'undefined') ? Auth.getDisplayName() : 'Guest';
      
      if (uid) {
        await firebase.firestore()
          .collection('waitlist')
          .doc(uid)
          .set({
            email,
            interested,
            uid,
            displayName,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            trialUsed: getTrialUsedCount(),
            platform: 'web'
          });
      } else {
        await firebase.firestore()
          .collection('waitlist')
          .add({
            email,
            interested,
            displayName: 'Anonymous Guest',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            trialUsed: getTrialUsedCount(),
            platform: 'web'
          });
      }
      
      showToast('Thank you! Interest registered.', 'success');
      
      const overlay = document.getElementById('ai-modal-overlay');
      if (overlay) overlay.remove();
      
      showModal("Thank You! 🎉", `
        <div style="text-align: center; line-height: 1.5; padding: 10px;">
          <p style="margin-bottom: 1.25rem;">Thank you for your interest. <strong>${escHtml(email)}</strong>. We will let you know as soon as the Pro options are available!</p>
          <p style="margin-bottom: 1.5rem; color: var(--text-muted); font-size: 0.88rem;">In the meantime, you can easily connect your own free API key under Settings to unlock unlimited AI features right away.</p>
          <button class="btn btn-primary w-full" onclick="App.closeModal()">Close</button>
        </div>
      `);
    } catch (e) {
      console.error('[App] waitlist error:', e);
      showToast(`Error submitting waitlist: ${e.message}`, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Yes, I'm interested! 🚀";
      }
    }
  }

  async function callGemini(prompt, json = false) {
    if (!isAIEnabled()) {
      throw new Error("AI features are disabled in Settings.");
    }
    const customKey = getGeminiKey();
    // User's own key → direct call, unlimited, no trial accounting.
    if (customKey) {
      return GeminiClient.callGemini(prompt, json, customKey);
    }

    // Free trial → Firestore-metered (trialUsage/{uid}). GeminiClient
    // consumes one unit atomically and throws TRIAL_EXHAUSTED when spent.
    if (!hasTrialRemaining()) {
      showProInterestModal();
      throw new Error("TRIAL_EXHAUSTED");
    }

    try {
      const res = await GeminiClient.callGemini(prompt, json);
      // Sync the UI badge from the authoritative remaining count (Firestore).
      setTrialRemaining(GeminiClient.getLastTrialRemaining());
      return res;
    } catch (err) {
      if (err && err.code === "TRIAL_EXHAUSTED") {
        setTrialRemaining(0);
        showProInterestModal();
        throw new Error("TRIAL_EXHAUSTED");
      }
      if (err && err.code === "NOT_SIGNED_IN") {
        showToast('Please sign in to use the free AI trial.', 'info');
        throw err;
      }
      console.error("[App] Trial callGemini error:", err);
      if (err.message && (err.message.toLowerCase().includes("key not valid") || err.message.toLowerCase().includes("api key not valid"))) {
        throw new Error("The shared AI trial key has expired. Please add your own free Gemini API Key under Settings to unlock scans.");
      }
      throw err;
    }
  }

  function saveGeminiKeyFromUI() {
    const el = document.getElementById('setting-gemini-key');
    if (!el) return;
    const key = el.value.trim();
    GeminiClient.saveKey(key);
    updateGeminiStatusUI();
    if (key) {
      showToast('Gemini key saved. AI features enabled.', 'success');
    } else {
      showToast('Gemini key removed. AI features disabled.', 'info');
    }
  }

  function updateGeminiStatusUI() {
    const key = GeminiClient.getKey();
    const input = document.getElementById('setting-gemini-key');
    if (input) input.value = key;
    updateSettingsStatusBadges(Translator.serverStatus);
    updateTrialBadges();
  }

  // updateSettingsStatusBadges → delegated to SettingsUI (features/settings.js)
  const updateSettingsStatusBadges = (st) => SettingsUI.updateSettingsStatusBadges(st);

  // ── State ────────────────────────────────────────────────────
  // The single source of truth now lives in core/store.js (Store.state).
  // We alias it locally as `state` so the ~100 existing read/write sites in
  // this file keep working unchanged; exercise modes still attach their
  // runtime fields (waAnswer, matchTiles, …) directly to it as before.
  const state = Store.state;

  // ── Auth state flag ───────────────────────────────────────────
  let _appInitialized = false;

  // ── Shared context for feature modules ────────────────────────
  //  Built once and handed to each extracted feature module's init() so they
  //  can reach App's shared helpers without a circular load-time dependency
  //  (everything here is resolved at call time, after all defs exist).
  function buildContext() {
    return {
      state,
      escHtml, escAttr, capitalise, formatDate, formatTimeAgo,
      showToast, showModal, closeModal,
      formatGermanWord, speakGerman, speakText,
      getLearningLangName,
      getGeminiKey, isAIEnabled, callGemini,
      navigateTo,
      hasTrialRemaining, showProInterestModal,
      explainMistake, analyzeGermanSentence, hideVerbConjugations, toggleVerbConjugations,
      updateNavStats, updateProviderIndicator, updateGeminiStatusUI,
      renderRecentTranslations,
      startSentenceAuditor, stopSentenceAuditor,
      startExercise,
      handleCollabMatchClick,
      resetAppInitialized: () => { _appInitialized = false; },
    };
  }

  // ── Init (called once after first auth resolution) ─────────────
  function init() {
    // Apply saved theme
    applyTheme(localStorage.getItem('dd_theme') || 'system');

    // Sync environment classes
    const isProdEnv = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    document.body.classList.toggle('prod-mode', isProdEnv);
    document.body.classList.toggle('dev-mode', !isProdEnv);

    const ctx = buildContext();

    setupNavigation();
    if (typeof LanguageSupport !== 'undefined') {
      LanguageSupport.updateUIElements();
    }
    AIFeatures.init(ctx);
    TranslateFeature.init(ctx);
    ExerciseEngine.init(ctx);
    SettingsUI.init(ctx);
    AuthUI.init(ctx);
    updateNavStats();
    updateProviderIndicator();
    updateGeminiStatusUI();
    navigateTo('translate');
  }

  // ── Navigation ───────────────────────────────────────────────
  //  Navigation lives in core/router.js. App registers the view-specific
  //  side effects as hooks and exposes navigateTo() as a thin delegate so all
  //  existing call sites (and inline onclick="App.navigateTo(...)") keep working.
  function setupNavigation() {
    Router.init({
      onEnter: {
        bank: () => renderWordBank(),
        insights: () => Insights.render(WordBank.getStats()),
        exercises: () => { stopExercise(); stopSentenceAuditor(); },
        settings: () => initBackendPage(),
      },
      onLeave: {
        insights: () => { if (typeof Insights !== 'undefined' && Insights.cleanup) Insights.cleanup(); },
      },
      always: () => updateTrialBadges(),
    });
  }

  function navigateTo(viewId) {
    Router.navigateTo(viewId);
  }

  function updateNavStats() {
    const count = WordBank.getWordCount();
    const el = document.getElementById('nav-word-count');
    if (el) el.textContent = count;
    const stats = WordBank.getStats();
    const streakEl = document.getElementById('nav-streak-display');
    if (streakEl) streakEl.textContent = `${stats.streak || 0}d`;
  }

  function updateProviderIndicator() {
    const el = document.getElementById('provider-indicator');
    if (!el) return;
    const name = Translator.getActiveProviderName();
    const icons = { DeepL: '🔷', Google: '🔍', MyMemory: '🌐' };
    el.textContent = `${icons[name] || '🌐'} ${name}`;
  }

  // ── Translator + Word Bank — extracted to features/translate.js ──
  //   The translate surface and the word-bank view live in TranslateFeature.
  //   Thin delegates keep the App facade and internal call sites working.
  const renderRecentTranslations = () => TranslateFeature.renderRecentTranslations();
  const renderWordBank        = () => TranslateFeature.renderWordBank();
  const clearResult           = () => TranslateFeature.clearResult();
  const retryTranslate        = () => TranslateFeature.retryTranslate();
  const selectSynonym         = (i) => TranslateFeature.selectSynonym(i);
  const resetToOriginal       = () => TranslateFeature.resetToOriginal();
  const toggleLevelVariations = () => TranslateFeature.toggleLevelVariations();
  const useLevelVariant       = (t, l) => TranslateFeature.useLevelVariant(t, l);
  const showCEFRInfo          = () => TranslateFeature.showCEFRInfo();
  const loadFromHistory       = (en, de) => TranslateFeature.loadFromHistory(en, de);
  const saveCurrentWord       = () => TranslateFeature.saveCurrentWord();
  const applyBetterPhrasing   = (t) => TranslateFeature.applyBetterPhrasing(t);
  const deleteWord            = (id) => TranslateFeature.deleteWord(id);
  const practiceWord          = (id) => TranslateFeature.practiceWord(id);

  // ── Exercises — extracted to features/exercises.js (ExerciseEngine) ──
  //   Picker, feedback bar, and all six modes (flashcard, MC, FITB,
  //   arrangement, match) live in ExerciseEngine. Thin delegates are exposed
  //   on the App facade so inline onclick="App.xxx()" handlers keep working.
  const renderExercisePicker = () => ExerciseEngine.renderExercisePicker();
  const startExercise        = (mode) => ExerciseEngine.startExercise(mode);
  const stopExercise         = () => ExerciseEngine.stopExercise();
  const flipCard             = () => ExerciseEngine.flipCard();
  const flashcardAnswer      = (c) => ExerciseEngine.flashcardAnswer(c);
  const answerMC             = (s, c, id) => ExerciseEngine.answerMC(s, c, id);
  const checkFITB            = (a, id) => ExerciseEngine.checkFITB(a, id);
  const startWordArrangement = () => ExerciseEngine.startWordArrangement();
  const waAddTile            = (i) => ExerciseEngine.waAddTile(i);
  const waReset              = () => ExerciseEngine.waReset();
  const waCheck              = () => ExerciseEngine.waCheck();
  const startMatch           = () => ExerciseEngine.startMatch();
  const matchSelectTile      = (i) => ExerciseEngine.matchSelectTile(i);
  const nextQuestion         = () => ExerciseEngine.nextQuestion();

  // ── AI features — extracted to features/ai.js (AIFeatures) ────
  //   Explainer, story, sentence auditor, writing assistant and the verb
  //   conjugator live in AIFeatures. Thin delegates keep the App facade and
  //   internal call sites (doTranslate → analyzeGermanSentence, clearResult →
  //   hideVerbConjugations, …) working unchanged.
  const explainMistake        = (c0, c, w) => AIFeatures.explainMistake(c0, c, w);
  const generateAIStory       = () => AIFeatures.generateAIStory();
  const runStoryDemo          = () => AIFeatures.runStoryDemo();
  const startSentenceAuditor  = () => AIFeatures.startSentenceAuditor();
  const stopSentenceAuditor   = () => AIFeatures.stopSentenceAuditor();
  const runAuditorDemo        = (s) => AIFeatures.runAuditorDemo(s);
  const toggleAuditorSandbox  = () => AIFeatures.toggleAuditorSandbox();
  const auditSentence         = () => AIFeatures.auditSentence();
  const analyzeGermanSentence = (t) => AIFeatures.analyzeGermanSentence(t);
  const toggleVerbConjugations = () => AIFeatures.toggleVerbConjugations();
  const hideVerbConjugations  = () => AIFeatures.hideVerbConjugations();
  const conjugateSuggestedVerb = (v) => AIFeatures.conjugateSuggestedVerb(v);

  // ── Settings — extracted to features/settings.js (SettingsUI) ──
  //   The settings page form, API-key status badges, Firestore settings sync,
  //   key test, and import/export/clear tools live in SettingsUI. Delegates
  //   keep the App facade and bootstrap call sites working.
  const initBackendPage        = () => SettingsUI.initBackendPage();
  const applyTheme             = (t) => SettingsUI.applyTheme(t);
  const syncSettingsToFirebase = () => SettingsUI.syncSettingsToFirebase();
  const saveGoalsSettings      = () => SettingsUI.saveGoalsSettings();
  const savePreferencesSettings = () => SettingsUI.savePreferencesSettings();
  const savePageSettings       = () => SettingsUI.savePageSettings();
  const testGeminiKey          = () => SettingsUI.testGeminiKey();
  const updateFirebasePreview  = () => SettingsUI.updateFirebasePreview();
  const exportWordBank         = () => SettingsUI.exportWordBank();
  const exportCSV              = () => SettingsUI.exportCSV();
  const importWordBank         = (e) => SettingsUI.importWordBank(e);
  const clearAllData           = () => SettingsUI.clearAllData();

  // ── Auth UI — extracted to features/auth-ui.js (AuthUI) ───────
  //   Profile chrome, login/guest/upgrade actions, user menu, login screen,
  //   and the streak modal live in AuthUI. handleAuthChange (the auth-state
  //   orchestration) stays here and delegates UI to these.
  const showLoginScreen        = () => AuthUI.showLoginScreen();
  const showApp                = () => AuthUI.showApp();
  const updateUserProfile      = (u) => AuthUI.updateUserProfile(u);
  const loginWithGoogle        = () => AuthUI.loginWithGoogle();
  const loginAsGuest           = () => AuthUI.loginAsGuest();
  const signOut                = () => AuthUI.signOut();
  const upgradeToGoogle        = () => AuthUI.upgradeToGoogle();
  const toggleUserMenu         = () => AuthUI.toggleUserMenu();
  const closeUserMenu          = () => AuthUI.closeUserMenu();
  const showStreakCelebration  = (n) => AuthUI.showStreakCelebration(n);
  const closeStreakModal       = () => AuthUI.closeStreakModal();

  // ── UI Utilities — delegating to UI module ───────────────────
  //    All pure UI helpers live in js/ui.js (UI).
  //    These wrappers keep existing call sites unchanged.

  const showToast     = (msg, type) => UI.showToast(msg, type);

  // ── Collab Match Invite ───────────────────────────────────────
  function handleCollabMatchClick() {
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    if (typeof Analytics !== 'undefined') {
      Analytics.logEvent('collab_match_invite_created', { room_id: roomId });
    }
    const inviteUrl = `https://dailydeutsch.web.app/?collab=${roomId}`;
    const shareText = `🤝 Challenge me to a German vocab duel on Daily Deutsch! Room: ${roomId}\n${inviteUrl}`;

    if (navigator.share) {
      navigator.share({
        title: 'Collab Match: Daily Deutsch',
        text: shareText,
        url: inviteUrl,
      }).catch(() => {});
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(inviteUrl).then(() => {
        showToast(`Invite link copied! Share it with a friend 🤝`, 'success');
      }).catch(() => {
        showToast(`Room code: ${roomId}. Share this with a friend!`, 'info');
      });
    }
  }
  const escHtml       = (s) => UI.escHtml(s);
  const escAttr       = (s) => UI.escAttr(s);
  const capitalise    = (s) => UI.capitalise(s);
  const formatDate    = (d) => UI.formatDate(d);
  const formatTimeAgo = (ts) => UI.formatTimeAgo(ts);

  // ══════════════════════════════════════════════════════════════
  //  AUTH FLOW
  // ══════════════════════════════════════════════════════════════

  // Called on every Firebase auth state change (login / logout)
  async function handleAuthChange(user) {
    if (user) {
      // Init storage with uid (Firestore if available, localStorage fallback)
      await WordBank.init(user.uid, () => {
        // Re-render views when Firestore pushes updates
        if (state.currentView === 'bank')      renderWordBank();
        if (state.currentView === 'insights')   Insights.render(WordBank.getStats());
        if (state.currentView === 'exercises')  renderExercisePicker();
        updateNavStats();
      });

      // Sync user API keys and preferences from Firestore
      if (!Auth.isGuest()) {
        try {
          const remoteSettings = await DB.getUserSettings();
          if (remoteSettings) {
            // Restore settings to localStorage
            const apiSettings = {
              provider: remoteSettings.provider || 'auto',
              deeplKey: remoteSettings.deeplKey || '',
              googleKey: remoteSettings.googleKey || '',
            };
            Translator.saveSettings(apiSettings);
            GeminiClient.saveKey(remoteSettings.geminiKey || '');

            if (remoteSettings.cefrGoal) localStorage.setItem('dd_cefr_goal', remoteSettings.cefrGoal);
            if (remoteSettings.aiEnabled) localStorage.setItem('dd_ai_enabled', remoteSettings.aiEnabled);
            if (remoteSettings.dailyWordGoal) localStorage.setItem('dd_daily_word_goal', remoteSettings.dailyWordGoal);
            if (remoteSettings.speechRate) localStorage.setItem('dd_speech_rate', remoteSettings.speechRate);
            if (remoteSettings.theme) {
              localStorage.setItem('dd_theme', remoteSettings.theme);
              applyTheme(remoteSettings.theme);
            }
            if (remoteSettings.nativeLang) localStorage.setItem('dd_native_lang', remoteSettings.nativeLang);
            if (remoteSettings.currentLevel) localStorage.setItem('dd_current_level', remoteSettings.currentLevel);
            if (remoteSettings.learningReason) localStorage.setItem('dd_learning_reason', remoteSettings.learningReason);
            if (remoteSettings.learningFocus) localStorage.setItem('dd_learning_focus', remoteSettings.learningFocus);
            if (remoteSettings.learningLang) {
              localStorage.setItem('dd_learning_lang', remoteSettings.learningLang);
              if (typeof LanguageSupport !== 'undefined') {
                LanguageSupport.updateUIElements();
              }
            }

            // Sync drawer inputs
            const drawerProvider = document.getElementById('setting-provider');
            const drawerDeepl = document.getElementById('setting-deepl-key');
            const drawerGoogle = document.getElementById('setting-google-key');
            if (drawerProvider) drawerProvider.value = apiSettings.provider;
            if (drawerDeepl) drawerDeepl.value = apiSettings.deeplKey;
            if (drawerGoogle) drawerGoogle.value = apiSettings.googleKey;

            updateProviderIndicator();
            updateSettingsStatusBadges(Translator.serverStatus);
            updateTrialBadges();
          } else {
            // First time login: push local keys to remote Firestore
            syncSettingsToFirebase();
          }
        } catch (e) {
          console.error('[Settings Sync] Failed to restore settings:', e);
        }
      }

      if (typeof Leaderboard !== 'undefined') {
        Leaderboard.syncProfile(user.uid, WordBank.getStats());
      }

      // Boot the app UI only on first auth
      if (!_appInitialized) {
        init();
        _appInitialized = true;
      } else {
        // Subsequent auth changes: re-render data views
        updateNavStats();
        if (state.currentView === 'bank')      renderWordBank();
        if (state.currentView === 'insights')   Insights.render(WordBank.getStats());
        if (state.currentView === 'exercises')  renderExercisePicker();
      }

      showApp();
      updateUserProfile(user);

      // Sync the free-trial remaining count from Firestore so badges are
      // accurate on load (no-op if the user has their own key).
      if (GeminiClient.refreshTrialRemaining) {
        GeminiClient.refreshTrialRemaining()
          .then(rem => { if (rem != null) setTrialRemaining(rem); })
          .catch(() => {});
      }

      // Resolve the paid-tier translator entitlement (shared Google key) so
      // the provider chain knows whether to use Google or fall back to
      // MyMemory, and refresh the navbar provider indicator once known.
      if (Translator.refreshTranslateEntitlement) {
        Translator.refreshTranslateEntitlement()
          .then(() => updateProviderIndicator())
          .catch(() => {});
      }
    } else {
      // Signed out
      DB.cleanup();
      if (Translator.setTranslateEntitled) Translator.setTranslateEntitled(false);
      showLoginScreen();
    }

    // Fade out and remove the app initialization loader overlay
    const loader = document.getElementById('app-init-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 400);
    }
  }

  // ── AI Explanation Modal & Navigation ─────────────────────────
  function showModal(title, contentHtml) {
    closeModal();
    const previouslyFocused = document.activeElement;
    const modal = document.createElement('div');
    modal.id = 'dd-custom-modal';
    modal.className = 'dd-modal-overlay';
    modal.innerHTML = `
      <div class="dd-modal-card" role="dialog" aria-modal="true" aria-label="${escHtml(title)}">
        <div class="dd-modal-header">
          <h2 class="dd-modal-title">${escHtml(title)}</h2>
          <button class="dd-modal-close" aria-label="Close" data-modal-close>✕</button>
        </div>
        <div class="dd-modal-body">
          ${contentHtml}
        </div>
      </div>`;

    const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])';

    function onKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key !== 'Tab') return;
      const f = Array.from(modal.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    modal._cleanup = () => {
      document.removeEventListener('keydown', onKeydown, true);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    modal.querySelector('[data-modal-close]').addEventListener('click', closeModal);
    document.addEventListener('keydown', onKeydown, true);

    // Move focus into the dialog.
    const initial = modal.querySelector(FOCUSABLE) || modal.querySelector('[data-modal-close]');
    if (initial) initial.focus();
  }

  function closeModal() {
    const modal = document.getElementById('dd-custom-modal');
    if (!modal) return;
    if (typeof modal._cleanup === 'function') modal._cleanup();
    modal.remove();
  }

  return {
    init, navigateTo, clearResult,
    flipCard, flashcardAnswer, answerMC, checkFITB, stopExercise,
    deleteWord, practiceWord, loadFromHistory,
    selectSynonym, resetToOriginal,
    toggleLevelVariations, useLevelVariant,
    showCEFRInfo, showToast, closeModal, retryTranslate,
    // Backend settings page
    savePageSettings, updateFirebasePreview,
    saveGoalsSettings, savePreferencesSettings,
    exportWordBank, exportCSV, importWordBank, clearAllData,
    // Auth
    handleAuthChange,
    loginWithGoogle, loginAsGuest, signOut, upgradeToGoogle,
    toggleUserMenu,
    speakGerman, speakText,
    // AI Explanation
    explainMistake,
    nextQuestion,
    // AI Story
    generateAIStory, runStoryDemo,
    submitProInterest,
    saveGeminiKeyFromUI,
    updateGeminiStatusUI,
    testGeminiKey,
    applyBetterPhrasing,
    analyzeGermanSentence,
    toggleVerbConjugations,
    conjugateSuggestedVerb,
    // New exercise types
    startWordArrangement, waAddTile, waReset, waCheck,
    startMatch, matchSelectTile,
    auditSentence, stopSentenceAuditor, runAuditorDemo, toggleAuditorSandbox,
    // Streak modal
    showStreakCelebration, closeStreakModal,
    // Collab Match
    handleCollabMatchClick,
  };

})();
