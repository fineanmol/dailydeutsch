/**
 * features/settings.js — Settings page, API-key config, sync & data tools.
 *
 * Carved out of the former app.js monolith (audit P4). Owns the settings page
 * form (goals, preferences, theme), the translation/Gemini API-key status
 * badges, the localStorage↔Firestore settings sync, the Gemini key test, the
 * Firebase env preview, and the import/export/clear data tools.
 *
 * Persistence stays in js/db.js (DB.*), key storage in js/gemini.js
 * (GeminiClient.*), and translation settings in js/translator.js
 * (Translator.*) — this is the settings UI/controller layer.
 *
 * Wiring: App calls SettingsUI.init(ctx) once. applyTheme /
 * updateSettingsStatusBadges / syncSettingsToFirebase are also invoked by
 * App's bootstrap and auth-change flow via the App facade delegates.
 *
 * Depends on: store.js, translator.js, gemini.js, db.js, auth.js,
 *             wordbank.js, ui.js, plus insights.js / leaderboard.js /
 *             profile.js / analytics.js / language.js (all optional).
 */
const SettingsUI = (() => {

  // ── Injected shared context (set in init) ─────────────────────
  let state, showToast, isAIEnabled, updateGeminiStatusUI,
      updateProviderIndicator, updateNavStats, renderRecentTranslations,
      navigateTo;

  function init(ctx) {
    state = ctx.state;
    showToast = ctx.showToast;
    isAIEnabled = ctx.isAIEnabled;
    updateGeminiStatusUI = ctx.updateGeminiStatusUI;
    updateProviderIndicator = ctx.updateProviderIndicator;
    updateNavStats = ctx.updateNavStats;
    renderRecentTranslations = ctx.renderRecentTranslations;
    navigateTo = ctx.navigateTo;
    setupSettings();
  }

  function setupSettings() {
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      navigateTo('settings');
    });
  }

  // ── API-key / provider status badges ─────────────────────────
  function updateSettingsStatusBadges(serverStatus) {
    // Get locally saved keys
    const s = Translator.loadSettings();
    const deeplKey = s.deeplKey || '';
    const googleKey = s.googleKey || '';
    const geminiKey = GeminiClient.getKey() || '';
    const useCustomGemini = localStorage.getItem('dd_use_custom_gemini') !== '0';
    const useCustomDeepl = localStorage.getItem('dd_use_custom_deepl') !== '0';

    const deeplEl   = document.getElementById('deepl-status');
    const googleEl  = document.getElementById('google-status');
    const apiBadge  = document.getElementById('translation-api-badge');
    const geminiBadge = document.getElementById('gemini-status-badge');
    const fbBadge   = document.getElementById('firebase-badge');

    /** Helper: set a .settings-api-status element */
    function setStatus(el, text, state) {
      if (!el) return;
      el.className = 'settings-api-status';
      el.textContent = text;
      if (state) el.classList.add(state); // 'active' | 'warning' | 'danger'
    }

    /** Helper: set a .settings-api-badge pill element */
    function setBadge(el, text, state) {
      if (!el) return;
      el.className = 'settings-api-badge';
      el.textContent = text;
      if (state) el.classList.add(`badge--${state}`); // 'active' | 'warning' | 'danger' | 'disabled'
    }

    // 1. DeepL
    if (useCustomDeepl) {
      if (deeplKey) {
        if (deeplKey.includes('-') || deeplKey.length > 20) {
          setStatus(deeplEl, 'Key Active', 'active');
        } else {
          setStatus(deeplEl, 'Invalid Key', 'danger');
        }
      } else {
        const hasServer = serverStatus && serverStatus.hasDeeplKey;
        setStatus(deeplEl, hasServer ? 'Active (Server)' : '—', hasServer ? 'active' : null);
      }
    } else {
      const hasServer = serverStatus && serverStatus.hasDeeplKey;
      if (deeplKey) {
        setStatus(deeplEl, 'Disabled (Custom Key Off)', null);
      } else if (hasServer) {
        setStatus(deeplEl, 'Disabled (Server Key Off)', null);
      } else {
        setStatus(deeplEl, '—', null);
      }
    }

    // 2. Google Translate
    if (googleKey) {
      if (googleKey.startsWith('AIzaSy') || googleKey.length > 10) {
        setStatus(googleEl, 'Key Active', 'active');
      } else {
        setStatus(googleEl, 'Invalid Key', 'danger');
      }
    } else {
      const hasServer = serverStatus && serverStatus.hasGoogleKey;
      setStatus(googleEl, hasServer ? 'Active (Server)' : '—', hasServer ? 'active' : null);
    }

    // 3. Gemini — your own key unlocks unlimited; otherwise the free trial
    //    runs through the server proxy.
    if (geminiKey && useCustomGemini) {
      if (geminiKey.startsWith('AIzaSy') || geminiKey.length > 10) {
        setBadge(geminiBadge, 'Key Active', 'active');
      } else {
        setBadge(geminiBadge, 'Invalid Key', 'danger');
      }
    } else {
      if (!useCustomGemini && geminiKey) {
        setBadge(geminiBadge, 'Disabled (Key Off)', 'disabled');
      } else {
        setBadge(geminiBadge, 'Free Trial', 'disabled');
      }
    }

    // 4. Translation API provider badge (navbar)
    if (apiBadge) {
      apiBadge.textContent = Translator.getActiveProviderName() || 'MyMemory';
    }

    // 5. Firebase
    if (serverStatus && serverStatus.hasFirebase) {
      setBadge(fbBadge, 'Connected', 'active');
    } else {
      setBadge(fbBadge, 'Not connected', 'disabled');
    }
  }

  // ── Settings Page ────────────────────────────────────────────
  async function initBackendPage() {
    updateGeminiStatusUI();

    // Populate goals & preferences
    const cefrGoal = localStorage.getItem('dd_cefr_goal') || 'B1';
    const dailyGoal = localStorage.getItem('dd_daily_word_goal') || '5';
    const speechRate = localStorage.getItem('dd_speech_rate') || '1.0';
    const theme = localStorage.getItem('dd_theme') || 'system';
    const nativeLang = localStorage.getItem('dd_native_lang') || 'en';

    const pgCefr = document.getElementById('settings-page-cefr-goal');
    const pgDaily = document.getElementById('settings-page-daily-word-goal');
    const pgSpeech = document.getElementById('settings-page-speech-rate');
    const pgTheme = document.getElementById('settings-page-theme');
    const pgNative = document.getElementById('settings-page-native-lang');

    if (pgCefr) pgCefr.value = cefrGoal;
    if (pgDaily) pgDaily.value = dailyGoal;
    if (pgSpeech) pgSpeech.value = speechRate;
    if (pgTheme) pgTheme.value = theme;
    if (pgNative) pgNative.value = nativeLang;

    // Load DeepL key
    const s = Translator.loadSettings();
    const pgDeepl = document.getElementById('pg-deepl-key');
    if (pgDeepl) pgDeepl.value = s.deeplKey || '';

    // Load key checkbox states
    const useCustomGemini = localStorage.getItem('dd_use_custom_gemini') !== '0';
    const useCustomDeepl = localStorage.getItem('dd_use_custom_deepl') !== '0';
    const pgUseGemini = document.getElementById('settings-page-use-custom-gemini');
    const pgUseDeepl = document.getElementById('settings-page-use-custom-deepl');
    if (pgUseGemini) pgUseGemini.checked = useCustomGemini;
    if (pgUseDeepl) pgUseDeepl.checked = useCustomDeepl;

    const pgLang = document.getElementById('settings-page-learning-lang');
    if (pgLang) pgLang.value = localStorage.getItem('dd_learning_lang') || 'de';

    if (typeof UserProfile !== 'undefined') {
      UserProfile.initForm();
    }

    // Show server API status if available
    let serverStatus = null;
    try {
      serverStatus = await Translator.fetchServerStatus();
    } catch (e) {
      console.warn('Could not fetch server configuration status', e);
    }
    updateSettingsStatusBadges(serverStatus);
  }

  function saveGoalsSettings() {
    const cefr = document.getElementById('settings-page-cefr-goal')?.value || 'B1';
    const daily = document.getElementById('settings-page-daily-word-goal')?.value || '5';
    const nativeLang = document.getElementById('settings-page-native-lang')?.value || 'en';

    localStorage.setItem('dd_cefr_goal', cefr);
    localStorage.setItem('dd_daily_word_goal', daily);
    localStorage.setItem('dd_current_level', cefr);
    localStorage.setItem('dd_native_lang', nativeLang);

    showToast('Learning and language goals saved!', 'success');

    // Re-render Insights if currently open
    if (typeof Insights !== 'undefined' && state.currentView === 'insights') {
      Insights.render(WordBank.getStats());
    }
    syncSettingsToFirebase();
  }

  function savePreferencesSettings() {
    const speech = document.getElementById('settings-page-speech-rate')?.value || '1.0';
    const theme = document.getElementById('settings-page-theme')?.value || 'system';
    localStorage.setItem('dd_speech_rate', speech);
    applyTheme(theme);
    showToast('Preferences saved successfully!', 'success');
    syncSettingsToFirebase();
  }

  function applyTheme(theme) {
    localStorage.setItem('dd_theme', theme);
    const darkMedia = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && darkMedia);

    document.documentElement.classList.toggle('dark-theme', isDark);
    document.body.classList.toggle('dark-theme', isDark);
    document.body.classList.toggle('light-theme', !isDark);
  }

  function syncSettingsToFirebase() {
    if (typeof Auth === 'undefined' || Auth.isGuest()) return;
    const s = Translator.loadSettings();
    const settings = {
      provider: s.provider || 'auto',
      deeplKey: s.deeplKey || '',
      googleKey: s.googleKey || '',
      geminiKey: GeminiClient.getKey() || '',
      aiEnabled: isAIEnabled() ? '1' : '0',
      cefrGoal: localStorage.getItem('dd_cefr_goal') || 'B1',
      dailyWordGoal: localStorage.getItem('dd_daily_word_goal') || '5',
      speechRate: localStorage.getItem('dd_speech_rate') || '1.0',
      theme: localStorage.getItem('dd_theme') || 'system',
      nativeLang: localStorage.getItem('dd_native_lang') || 'en',
      currentLevel: localStorage.getItem('dd_current_level') || 'A1',
      learningReason: localStorage.getItem('dd_learning_reason') || 'hobby',
      learningFocus: localStorage.getItem('dd_learning_focus') || 'vocab',
      learningLang: localStorage.getItem('dd_learning_lang') || 'de',
    };
    DB.saveUserSettings(settings);

    if (typeof Leaderboard !== 'undefined') {
      Leaderboard.syncProfile(Auth.getUid(), WordBank.getStats());
    }
  }

  function savePageSettings() {
    const deeplKey = document.getElementById('pg-deepl-key')?.value?.trim() || '';
    const settings = {
      provider: 'auto',
      deeplKey: deeplKey,
      googleKey: '',
    };
    Translator.saveSettings(settings);

    // Save key checkbox states
    const pgUseGemini = document.getElementById('settings-page-use-custom-gemini');
    const pgUseDeepl = document.getElementById('settings-page-use-custom-deepl');
    localStorage.setItem('dd_use_custom_gemini', pgUseGemini && pgUseGemini.checked ? '1' : '0');
    localStorage.setItem('dd_use_custom_deepl', pgUseDeepl && pgUseDeepl.checked ? '1' : '0');

    // Save AI Enabled state
    const enableAI = document.getElementById('settings-page-enable-ai')?.value || '1';
    localStorage.setItem('dd_ai_enabled', enableAI);

    // Save Gemini Key
    const geminiKey = document.getElementById('setting-gemini-key')?.value?.trim() || '';
    GeminiClient.saveKey(geminiKey);
    updateGeminiStatusUI();

    if (typeof Analytics !== 'undefined') {
      Analytics.logEvent('settings_updated', {
        has_gemini_key: !!geminiKey,
        has_deepl_key: !!deeplKey
      });
    }

    updateProviderIndicator();
    updateSettingsStatusBadges(Translator.serverStatus);
    showToast('Integrations & API configurations saved!', 'success');
    syncSettingsToFirebase();
  }

  async function testGeminiKey() {
    const el = document.getElementById('setting-gemini-key');
    const btn = document.getElementById('test-gemini-btn');
    if (!el || !btn) return;

    const key = el.value.trim();
    if (!key) {
      showToast('Please enter a Gemini API Key to test.', 'info');
      return;
    }

    // Save key to test
    const oldKey = GeminiClient.getKey();
    GeminiClient.saveKey(key);

    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = '⚡ Testing...';

    try {
      const response = await GeminiClient.callGemini('Say the word OK', false);
      if (response && response.toUpperCase().includes('OK')) {
        showToast('Gemini API connection successful!', 'success');
        updateSettingsStatusBadges(Translator.serverStatus);
      } else {
        throw new Error('Unexpected response format.');
      }
    } catch (e) {
      console.error(e);
      showToast(`Connection failed: ${e.message}`, 'error');
      // Revert to old key if testing fails
      GeminiClient.saveKey(oldKey);
      updateSettingsStatusBadges(Translator.serverStatus);
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
      updateGeminiStatusUI();
    }
  }

  function updateFirebasePreview() {
    const fields = {
      'fb-api-key': 'FIREBASE_API_KEY',
      'fb-auth-domain': 'FIREBASE_AUTH_DOMAIN',
      'fb-project-id': 'FIREBASE_PROJECT_ID',
      'fb-storage-bucket': 'FIREBASE_STORAGE_BUCKET',
      'fb-sender-id': 'FIREBASE_MESSAGING_SENDER_ID',
      'fb-app-id': 'FIREBASE_APP_ID',
    };
    const lines = Object.entries(fields).map(([id, key]) => {
      const val = document.getElementById(id)?.value?.trim() || '';
      return `${key}=${val}`;
    }).join('\n');
    const preview = document.getElementById('firebase-env-preview');
    if (preview) preview.textContent = lines;
  }

  // ── Data tools ───────────────────────────────────────────────
  function exportWordBank() {
    const data = { words: WordBank.getAllWords(), history: WordBank.getHistory(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daily-deutsch-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    showToast('Word bank exported as JSON', 'success');
  }

  function exportCSV() {
    const words = WordBank.getAllWords();
    const rows = [['English','German','Category','Frequency','Added'].join(',')];
    words.forEach(w => rows.push([`"${w.english}"`,`"${w.german}"`,w.category,w.frequency,new Date(w.addedAt).toLocaleDateString('en-GB')].join(',')));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daily-deutsch-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast('Word bank exported as CSV', 'success');
  }

  function importWordBank(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.words && Array.isArray(data.words)) {
          data.words.forEach(w => WordBank.addOrUpdateWord(w));
          updateNavStats();
          showToast(`Imported ${data.words.length} words`, 'success');
        } else {
          showToast('Invalid file format', 'error');
        }
      } catch {
        showToast('Could not parse JSON file', 'error');
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (!confirm('This will delete ALL your saved words and history. This cannot be undone. Continue?')) return;
    localStorage.clear();
    updateNavStats();
    renderRecentTranslations();
    showToast('All data cleared', 'error');
  }

  return {
    init,
    initBackendPage,
    updateSettingsStatusBadges,
    saveGoalsSettings, savePreferencesSettings, savePageSettings,
    applyTheme, syncSettingsToFirebase,
    testGeminiKey, updateFirebasePreview,
    exportWordBank, exportCSV, importWordBank, clearAllData,
  };
})();
