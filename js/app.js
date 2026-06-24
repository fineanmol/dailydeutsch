/**
 * app.js — Main application controller
 * Features: Translation, Word Bank, Exercises, Insights, Settings,
 *           Synonyms, CEFR Badges, Level Variations
 */

const App = (() => {

  // Determine Environment Mode immediately on script run
  const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  document.body.classList.toggle('prod-mode', isProd);
  document.body.classList.toggle('dev-mode', !isProd);

  // ── Text-to-Speech Pronunciation ──────────────────────────────
  function speakText(text, lang = 'de-DE') {
    if (!text || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voices = window.speechSynthesis.getVoices();
    const prefix = lang.split('-')[0];
    const matchVoice = voices.find(voice => voice.lang.startsWith(prefix) || voice.lang === lang);
    if (matchVoice) utterance.voice = matchVoice;
    window.speechSynthesis.speak(utterance);
  }

  function speakGerman(text) {
    speakText(text, 'de-DE');
  }

  // Pre-load voices cache
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
  }

  // ── Noun Gender Highlighting ─────────────────────────────────
  function formatGermanWord(text) {
    if (!text) return '';
    const trimmed = text.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1) {
      const first = parts[0].toLowerCase();
      if (first === 'der') {
        return `<span class="article-masc">der</span> ${escHtml(parts.slice(1).join(' '))}`;
      } else if (first === 'die') {
        return `<span class="article-fem">die</span> ${escHtml(parts.slice(1).join(' '))}`;
      } else if (first === 'das') {
        return `<span class="article-neu">das</span> ${escHtml(parts.slice(1).join(' '))}`;
      }
    }
    return escHtml(text);
  }

  // ── Gemini AI Helper (Client-Side Free Tier) ──────────────────
  function getGeminiKey() {
    return localStorage.getItem('mw_gemini_key') || '';
  }

  function saveGeminiKey(key) {
    localStorage.setItem('mw_gemini_key', key.trim());
  }

  function saveGeminiKeyFromUI() {
    const el = document.getElementById('setting-gemini-key');
    if (!el) return;
    const key = el.value.trim();
    saveGeminiKey(key);
    updateGeminiStatusUI();
    if (key) {
      showToast('Gemini API Key saved! AI features enabled. 🤖', 'success');
    } else {
      showToast('Gemini API Key removed. AI features disabled.', 'info');
    }
  }

  function updateGeminiStatusUI() {
    const key = getGeminiKey();
    const badge = document.getElementById('gemini-status-badge');
    const input = document.getElementById('setting-gemini-key');
    if (input) input.value = key;
    if (badge) {
      if (key) {
        badge.textContent = 'Active 🤖';
        badge.style.background = '#47cf73';
        badge.style.color = '#fff';
      } else {
        badge.textContent = 'Disabled';
        badge.style.background = 'rgba(0,0,0,0.06)';
        badge.style.color = 'var(--text-muted)';
      }
    }
  }

  function cleanJsonString(str) {
    let clean = str.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
    }
    return clean.trim();
  }

  async function callGemini(prompt, responseJson = false) {
    const key = getGeminiKey();
    if (!key) throw new Error('Gemini API Key is missing. Add it in Settings.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`;
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
      throw new Error(`Gemini API Error: ${msg}`);
    }

    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');

    if (responseJson) {
      try {
        return JSON.parse(cleanJsonString(text));
      } catch (e) {
        console.error('Failed to parse Gemini response as JSON:', text);
        throw e;
      }
    }
    return text;
  }

  // ── State ────────────────────────────────────────────────────
  let state = {
    currentView: 'translate',
    translationDirection: 'en-de', // 'en-de' or 'de-en'
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

  // ── Auth state flag ───────────────────────────────────────────
  let _appInitialized = false;

  // ── Init (called once after first auth resolution) ─────────────
  function init() {
    // Sync environment classes
    const isProdEnv = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    document.body.classList.toggle('prod-mode', isProdEnv);
    document.body.classList.toggle('dev-mode', !isProdEnv);

    setupNavigation();
    setupTranslator();
    setupWordBank();
    setupExercises();
    setupSettings();
    updateNavStats();
    updateProviderIndicator();
    updateGeminiStatusUI();
    navigateTo('translate');
  }

  // ── Navigation ───────────────────────────────────────────────
  function setupNavigation() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.tab));
    });
  }

  function navigateTo(viewId) {
    state.currentView = viewId;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
    const view = document.getElementById(`view-${viewId}`);
    if (view) view.classList.add('active');
    document.querySelectorAll(`[data-tab="${viewId}"]`).forEach(b => b.classList.add('active'));
    if (viewId === 'bank') renderWordBank();
    if (viewId === 'insights') Insights.render(WordBank.getStats());
    if (viewId === 'exercises') renderExercisePicker();
    if (viewId === 'settings') initBackendPage();
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

  // ── Settings ─────────────────────────────────────────────────
  function setupSettings() {
    document.getElementById('settings-btn')?.addEventListener('click', openSettings);
    document.getElementById('settings-close')?.addEventListener('click', closeSettings);
    document.getElementById('settings-overlay')?.addEventListener('click', closeSettings);
    document.getElementById('settings-save')?.addEventListener('click', saveSettingsFromForm);
    document.getElementById('settings-reset')?.addEventListener('click', resetSettings);

    // Load existing settings into form
    const s = Translator.loadSettings();
    const providerInput = document.getElementById('setting-provider');
    const deeplInput = document.getElementById('setting-deepl-key');
    const googleInput = document.getElementById('setting-google-key');
    if (providerInput) providerInput.value = s.provider || 'auto';
    if (deeplInput) deeplInput.value = s.deeplKey || '';
    if (googleInput) googleInput.value = s.googleKey || '';
  }

  function openSettings() {
    const isProdEnv = document.body.classList.contains('prod-mode');
    if (isProdEnv) {
      navigateTo('settings');
    } else {
      document.getElementById('settings-drawer')?.classList.add('open');
      document.getElementById('settings-overlay')?.classList.add('open');
    }
  }

  function closeSettings() {
    document.getElementById('settings-drawer')?.classList.remove('open');
    document.getElementById('settings-overlay')?.classList.remove('open');
  }

  function saveSettingsFromForm() {
    const settings = {
      provider: document.getElementById('setting-provider')?.value || 'auto',
      deeplKey: document.getElementById('setting-deepl-key')?.value?.trim() || '',
      googleKey: document.getElementById('setting-google-key')?.value?.trim() || '',
    };
    Translator.saveSettings(settings);
    closeSettings();
    updateProviderIndicator();
    showToast(`Settings saved — using ${Translator.getActiveProviderName()}`, 'success');
  }

  function resetSettings() {
    Translator.saveSettings({ provider: 'auto', deeplKey: '', googleKey: '' });
    document.getElementById('setting-provider').value = 'auto';
    document.getElementById('setting-deepl-key').value = '';
    document.getElementById('setting-google-key').value = '';
    updateProviderIndicator();
    showToast('Reset to MyMemory (free)', 'info');
  }

  // ── Translator ───────────────────────────────────────────────
  function setupTranslator() {
    const input = document.getElementById('translate-input');
    const translateBtn = document.getElementById('translate-btn');
    const saveBtn = document.getElementById('save-word-btn');
    const charCount = document.getElementById('char-count');
    const swapBtn = document.getElementById('swap-languages-btn');

    swapBtn?.addEventListener('click', () => {
      state.translationDirection = state.translationDirection === 'en-de' ? 'de-en' : 'en-de';
      
      const subtitle = document.getElementById('translator-subtitle');
      const swapLabel = document.getElementById('swap-btn-label');
      const sourceLabel = document.getElementById('source-lang-label');
      const targetLabel = document.getElementById('target-lang-label');
      
      const isEnDe = state.translationDirection === 'en-de';
      
      if (subtitle) {
        subtitle.textContent = isEnDe 
          ? 'Type English, get German — save words you use daily' 
          : 'Type German, get English — check your level and writing';
      }
      
      if (swapLabel) {
        swapLabel.textContent = isEnDe ? 'English ⇄ German' : 'German ⇄ English';
      }
      
      if (sourceLabel) {
        sourceLabel.innerHTML = isEnDe 
          ? '<span class="lang-flag">🇬🇧</span> English' 
          : '<span class="lang-flag">🇩🇪</span> German';
      }
      
      if (targetLabel) {
        targetLabel.innerHTML = isEnDe 
          ? '<span class="lang-flag">🇩🇪</span> German' 
          : '<span class="lang-flag">🇬🇧</span> English';
      }
      
      if (input) {
        input.placeholder = isEnDe 
          ? 'Type or paste English text here…' 
          : 'Type or paste German text here…';
          
        const resultDisplay = document.getElementById('translation-display');
        const currentResultText = resultDisplay ? resultDisplay.textContent.trim() : '';
        const currentInputText = input.value.trim();
        
        if (currentInputText && currentResultText && !currentResultText.startsWith('Translation will appear') && !currentResultText.includes('failed')) {
          input.value = currentResultText;
          if (charCount) charCount.textContent = `${currentResultText.length} / 500`;
          doTranslate(true);
        } else {
          clearResult();
        }
      }
    });

    input?.addEventListener('input', () => {
      const len = input.value.length;
      if (charCount) charCount.textContent = `${len} / 500`;
      if (len === 0) { clearResult(); return; }
      doTranslate(false);
    });

    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doTranslate(true);
      }
    });

    translateBtn?.addEventListener('click', () => doTranslate(true));
    saveBtn?.addEventListener('click', saveCurrentWord);

    renderRecentTranslations();
  }

  let translateDebounceTimer = null;

  async function doTranslate(immediate = false) {
    const input = document.getElementById('translate-input');
    const text = input?.value?.trim();
    if (!text) return;

    clearTimeout(translateDebounceTimer);
    
    let delay = 750; // fallback default
    if (immediate) {
      delay = 0;
    } else {
      const hasSpaces = /\s+/.test(text);
      const endsWithPunctuation = /[.!?]$/.test(text);

      if (hasSpaces) {
        if (endsWithPunctuation) {
          // Finished a sentence with standard punctuation, translate after a short pause
          delay = 1000;
        } else {
          // Mid-sentence or typing a phrase with spaces, wait longer
          // so it won't count as a translation in mid sentence
          delay = 3000;
        }
      } else {
        // Just typing a single word, translate after a moderate pause
        delay = 1500;
      }
    }

    translateDebounceTimer = setTimeout(async () => {
      setResultLoading(true);

      // Reset level variations
      state.levelVariations = null;
      state.levelVariationsOpen = false;
      hideLevelVariations();

      // Reset verb conjugations
      hideVerbConjugations();

      try {
        const isEnDe = state.translationDirection === 'en-de';
        const fromLang = isEnDe ? 'en' : 'de';
        const toLang = isEnDe ? 'de' : 'en';

        const result = await Translator.translate(text, fromLang, toLang);
        if (result && result.text) {
          state.currentEnglish = isEnDe ? text : result.text;
          state.currentTranslation = isEnDe ? result.text : text;
          state.currentAlternatives = result.alternatives || [];
          state.currentAltIndex = -1;
          state.currentProvider = result.provider;

          const category = Categories.detectCategory(state.currentEnglish);
          const pos = Categories.detectPartOfSpeech(state.currentEnglish);
          const cefrLevel = typeof CEFR !== 'undefined' ? CEFR.getLevel(state.currentTranslation) : 'B1';
          state.currentCEFR = cefrLevel;

          setResultLoading(false); // clear spinner before rendering result
          displayResult(text, result.text, result.alternatives, cefrLevel, result.provider, category, pos);

          WordBank.addToHistory({ english: state.currentEnglish, german: state.currentTranslation, category });
          renderRecentTranslations();
          updateNavStats();
          updateProviderIndicator();

          if (isEnDe) {
            // Fetch level variations in background
            fetchLevelVariations(text, result.text);
            document.getElementById('ai-writing-assistant')?.classList.add('hidden');
          } else {
            // German to English: Analyze German sentence with Gemini!
            analyzeGermanSentence(text);
          }
        } else {
          console.error('Translation returned empty result:', result);
          setResultError('Empty response from translation service');
        }
      } catch (err) {
        console.error('Translation error:', err);
        setResultError(err.message);
      } finally {
        setResultLoading(false);
      }
    }, delay);
  }

  async function fetchLevelVariations(text, primaryTranslation) {
    const variations = await Translator.translateAllLevels(text, primaryTranslation);
    state.levelVariations = variations;
    const btn = document.getElementById('level-variations-btn');
    if (btn && variations) {
      btn.classList.remove('hidden');
    }
  }

  function displayResult(english, german, alternatives, cefrLevel, provider, category, pos) {
    const resultArea = document.getElementById('result-area');
    const wordMeta = document.getElementById('word-meta');
    const saveBar = document.getElementById('save-action-bar');

    const catInfo = Categories.getCategoryInfo(category);
    const cefrInfo = CEFR.getLevelInfo(cefrLevel);
    const providerIcon = { DeepL: '🔷', Google: '🔍', MyMemory: '🌐' }[provider] || '🌐';

    // Main translation text
    const targetLangCode = state.translationDirection === 'en-de' ? 'de-DE' : 'en-US';
    resultArea.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:var(--space-sm); flex-wrap:wrap;">
        <div id="translation-display" class="result-text translation-animated" style="margin:0">${formatGermanWord(german)}</div>
        <button class="btn btn-ghost btn-icon speaker-btn" onclick="App.speakText(document.getElementById('translation-display').textContent, '${targetLangCode}')" title="Hear pronunciation" style="font-size:1.4rem; padding:6px; height:auto; width:auto; border-radius:50%;">
          🔊
        </button>
      </div>`;

    // Meta badges: category + pos + CEFR + provider
    wordMeta.innerHTML = `
      <span class="badge badge-${category}">${catInfo.emoji} ${catInfo.label}</span>
      <span class="badge" style="background:rgba(0,0,0,0.06);color:var(--text-muted);">
        ${capitalise(pos || 'word')}
      </span>
      <span class="badge cefr-badge" id="cefr-badge"
        style="background:${cefrInfo.bg};color:${cefrInfo.color};border:1px solid ${cefrInfo.color}44;cursor:pointer;"
        title="${cefrInfo.title}" onclick="App.showCEFRInfo()">
        ${cefrLevel} · ${cefrInfo.title}
      </span>
      <span class="badge" style="background:rgba(0,0,0,0.05);color:var(--text-muted);font-size:0.7rem;">
        ${providerIcon} ${provider}
      </span>`;
    wordMeta.classList.remove('hidden');

    // Synonym chips
    renderSynonymChips(alternatives, german);

    // Level variations button (hidden until fetched)
    const lvlBtn = document.getElementById('level-variations-btn');
    if (lvlBtn) lvlBtn.classList.add('hidden');

    // Verb conjugation button
    const conjBtn = document.getElementById('verb-conjugations-btn');
    if (conjBtn) {
      if (pos === 'verb') {
        conjBtn.classList.remove('hidden');
      } else {
        conjBtn.classList.add('hidden');
      }
    }

    saveBar.classList.remove('hidden');
  }

  function renderSynonymChips(alternatives, primary) {
    const row = document.getElementById('synonym-row');
    if (!row) return;

    if (!alternatives || alternatives.length === 0) {
      row.classList.add('hidden');
      return;
    }

    // Show up to 5 synonym chips
    const chips = alternatives.slice(0, 5).map((alt, i) => `
      <button class="synonym-chip" id="syn-chip-${i}"
        onclick="App.selectSynonym(${i})"
        title="Use this alternative">${escHtml(alt.text)}</button>
    `).join('');

    row.innerHTML = `
      <div class="synonym-label">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Alternatives
      </div>
      <div class="synonym-chips">${chips}</div>
      <button class="btn btn-ghost btn-sm synonym-reset ${state.currentAltIndex === -1 ? 'hidden' : ''}"
        id="synonym-reset-btn" onclick="App.resetToOriginal()" title="Back to main translation">
        ↩ Original
      </button>`;

    row.classList.remove('hidden');
  }

  function selectSynonym(index) {
    const alt = state.currentAlternatives[index];
    if (!alt) return;

    state.currentAltIndex = index;
    state.currentTranslation = alt.text;

    // Update display text with animation
    const display = document.getElementById('translation-display');
    if (display) {
      display.style.opacity = '0';
      display.style.transform = 'translateY(4px)';
      setTimeout(() => {
        display.textContent = alt.text;
        display.style.opacity = '1';
        display.style.transform = 'translateY(0)';
      }, 150);
    }

    // Update CEFR for new word
    const newCEFR = CEFR.getLevel(alt.text);
    state.currentCEFR = newCEFR;
    const cefrInfo = CEFR.getLevelInfo(newCEFR);
    const badge = document.getElementById('cefr-badge');
    if (badge) {
      badge.textContent = `${newCEFR} · ${cefrInfo.title}`;
      badge.style.background = cefrInfo.bg;
      badge.style.color = cefrInfo.color;
      badge.style.borderColor = cefrInfo.color + '33';
    }

    // Highlight selected chip
    document.querySelectorAll('.synonym-chip').forEach((c, i) => {
      c.classList.toggle('active', i === index);
    });

    // Show reset button
    const resetBtn = document.getElementById('synonym-reset-btn');
    if (resetBtn) resetBtn.classList.remove('hidden');
  }

  function resetToOriginal() {
    if (!state.currentEnglish) return;
    const original = state.currentAlternatives[-1]; // primary
    state.currentAltIndex = -1;

    // We stored the original in the wordbank/history lookup
    // Re-display original by re-running display
    const display = document.getElementById('translation-display');
    // Find the original — it was stored before alternatives replaced it
    // Use the history to find it
    const history = WordBank.getHistory();
    const entry = history.find(h => h.english.toLowerCase() === state.currentEnglish.toLowerCase());
    const originalText = entry ? entry.german : document.getElementById('translation-display')?.textContent;

    if (display && originalText) {
      display.style.opacity = '0';
      setTimeout(() => {
        display.textContent = originalText;
        state.currentTranslation = originalText;
        display.style.opacity = '1';
      }, 150);
    }

    document.querySelectorAll('.synonym-chip').forEach(c => c.classList.remove('active'));
    const resetBtn = document.getElementById('synonym-reset-btn');
    if (resetBtn) resetBtn.classList.add('hidden');

    // Restore CEFR
    const newCEFR = CEFR.getLevel(state.currentTranslation);
    const cefrInfo = CEFR.getLevelInfo(newCEFR);
    const badge = document.getElementById('cefr-badge');
    if (badge) {
      badge.textContent = `${newCEFR} · ${cefrInfo.title}`;
      badge.style.background = cefrInfo.bg;
      badge.style.color = cefrInfo.color;
    }
  }

  // ── Level Variations ─────────────────────────────────────────
  function toggleLevelVariations() {
    state.levelVariationsOpen = !state.levelVariationsOpen;
    const panel = document.getElementById('level-variations-panel');
    const btn = document.getElementById('level-variations-btn');

    if (state.levelVariationsOpen) {
      panel?.classList.remove('hidden');
      if (btn) btn.textContent = '▲ Hide level variations';
      renderLevelVariations();
    } else {
      panel?.classList.add('hidden');
      if (btn) btn.textContent = '▼ See this at every CEFR level';
    }
  }

  function hideLevelVariations() {
    const panel = document.getElementById('level-variations-panel');
    const btn = document.getElementById('level-variations-btn');
    panel?.classList.add('hidden');
    if (btn) {
      btn.textContent = '▼ See this at every CEFR level';
      btn.classList.add('hidden');
    }
    state.levelVariationsOpen = false;
  }

  function renderLevelVariations() {
    const panel = document.getElementById('level-variations-panel');
    if (!panel || !state.levelVariations) return;

    const v = state.levelVariations;
    const levels = ['A1', 'A2', 'B1', 'B2'];
    const levelColors = {
      A1: { color: '#47cf73', bg: 'rgba(71,207,115,0.1)', border: 'rgba(71,207,115,0.25)' },
      A2: { color: '#0ebeff', bg: 'rgba(14,190,255,0.1)', border: 'rgba(14,190,255,0.25)' },
      B1: { color: '#fcd000', bg: 'rgba(252,208,0,0.1)', border: 'rgba(252,208,0,0.25)' },
      B2: { color: '#ae63e4', bg: 'rgba(174,99,228,0.1)', border: 'rgba(174,99,228,0.25)' },
    };
    const levelDesc = {
      A1: 'Beginner — simple, direct everyday words',
      A2: 'Elementary — basic grammar, common phrases',
      B1: 'Intermediate — natural, standard phrasing',
      B2: 'Upper-Intermediate — more precise vocabulary',
    };

    panel.innerHTML = `
      <div class="level-variations-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 20h20M4 20V10l8-6 8 6v10"/>
        </svg>
        How this would change across CEFR levels
        <span class="lv-note">Based on translation memory complexity analysis</span>
      </div>
      <div class="level-cards-grid">
        ${levels.map(lvl => {
          const data = v[lvl];
          const meta = levelColors[lvl];
          const isCurrent = lvl === state.currentCEFR;
          return data ? `
            <div class="level-card ${isCurrent ? 'level-card-current' : ''}"
              style="border-color:${meta.border};background:${meta.bg}">
              <div class="level-card-badge" style="color:${meta.color};border-color:${meta.border}">
                ${lvl}
                ${isCurrent ? '<span class="lv-current-tag">current</span>' : ''}
              </div>
              <div class="level-card-translation">${escHtml(data.text)}</div>
              <div class="level-card-desc">${levelDesc[lvl]}</div>
              <div class="level-card-note">${escHtml(data.note || data.style || '')}</div>
              <button class="btn btn-ghost btn-sm level-card-use"
                onclick="App.useLevelVariant('${escAttr(data.text)}', '${lvl}')">
                Use this →
              </button>
            </div>` : '';
        }).join('')}
      </div>`;
  }

  function useLevelVariant(text, level) {
    state.currentTranslation = text;

    const display = document.getElementById('translation-display');
    if (display) {
      display.style.opacity = '0';
      setTimeout(() => {
        display.textContent = text;
        display.style.opacity = '1';
      }, 150);
    }

    const cefrInfo = CEFR.getLevelInfo(level);
    const badge = document.getElementById('cefr-badge');
    if (badge) {
      badge.textContent = `${level} · ${cefrInfo.title}`;
      badge.style.background = cefrInfo.bg;
      badge.style.color = cefrInfo.color;
    }

    showToast(`Using ${level} phrasing: "${text}"`, 'info');
    document.querySelectorAll('.synonym-chip').forEach(c => c.classList.remove('active'));
  }

  function showCEFRInfo() {
    const level = state.currentCEFR;
    if (!level) return;
    const info = CEFR.getLevelInfo(level);
    const descriptions = {
      A1: 'You know basic greetings, numbers, and everyday words. Perfect for first-time learners.',
      A2: 'You can understand simple sentences about familiar topics like family, shopping, and local area.',
      B1: 'You can handle most situations while travelling in German-speaking countries. Good conversational ability.',
      B2: 'You can understand complex texts and interact fluently with native speakers.',
      C1: 'You can express yourself fluently, spontaneously, and precisely in complex situations.',
      C2: 'You have near-native mastery. You can understand virtually everything heard or read.',
    };
    showToast(`${level} — ${info.title}: ${descriptions[level] || ''}`, 'info');
  }

  // ── Save / Clear ─────────────────────────────────────────────
  function clearResult() {
    const resultArea = document.getElementById('result-area');
    const wordMeta = document.getElementById('word-meta');
    const saveBar = document.getElementById('save-action-bar');
    const synRow = document.getElementById('synonym-row');
    const lvlBtn = document.getElementById('level-variations-btn');
    const lvlPanel = document.getElementById('level-variations-panel');

    resultArea.innerHTML = `
      <div class="result-text result-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
        <span>Translation will appear here</span>
      </div>`;

    wordMeta?.classList.add('hidden');
    saveBar?.classList.add('hidden');
    synRow?.classList.add('hidden');
    lvlBtn?.classList.add('hidden');
    lvlPanel?.classList.add('hidden');
    document.getElementById('ai-writing-assistant')?.classList.add('hidden');
    hideVerbConjugations();

    state.currentTranslation = null;
    state.currentEnglish = '';
    state.currentAlternatives = [];
    state.levelVariations = null;
  }

  function setResultLoading(loading) {
    const resultArea = document.getElementById('result-area');
    if (!resultArea) return;
    if (loading) {
      resultArea.innerHTML = `
        <div class="result-loading">
          <div class="spinner"></div>
          Translating…
        </div>`;
    } else {
      // Only clear if still showing the spinner (don't overwrite a rendered result)
      if (resultArea.querySelector('.result-loading')) {
        resultArea.innerHTML = `
          <div class="result-text result-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            <span>Translation will appear here</span>
          </div>`;
      }
    }
  }

  function setResultError(detail) {
    const resultArea = document.getElementById('result-area');
    if (!resultArea) return;
    const msg = detail ? `: ${detail}` : '';
    resultArea.innerHTML = `
      <div class="result-text result-empty">
        <span style="color:var(--accent-red)">⚠ Translation failed${msg}</span>
        <div style="margin-top:8px;font-size:0.8rem;color:var(--text-muted)">
          ${Translator.isServer
            ? 'The server returned an error. Check the terminal for details.'
            : 'Open as <strong>http://localhost:3000</strong> (not as a file) to fix CORS issues.'}
        </div>
      </div>`;
  }

  async function fetchAndAttachWordMetadata(wordId, german, english) {
    if (!getGeminiKey()) return;
    try {
      const prompt = `You are a German language assistant. Provide grammatical metadata for the German word "${german}" (meaning "${english}" in English).
      Return a JSON object with these EXACT keys:
      {
        "plural": "plural form with article if it is a noun (e.g. 'die Tische'), otherwise null",
        "conjugations": "key verb forms if it is a verb (e.g. 'geht, ging, ist gegangen'), otherwise null",
        "exampleDe": "a short, simple, natural German example sentence using the word",
        "exampleEn": "the English translation of the German example sentence"
      }`;
      const meta = await callGemini(prompt, true);

      const words = WordBank.getAllWords();
      const word = words.find(w => w.id === wordId);
      if (word) {
        const updated = {
          ...word,
          aiPlural: meta.plural || null,
          aiConjugations: meta.conjugations || null,
          aiExampleDe: meta.exampleDe || null,
          aiExampleEn: meta.exampleEn || null
        };
        DB.saveWord(updated);
        if (state.currentView === 'bank') renderWordBank();
      }
    } catch (e) {
      console.warn('[Gemini metadata fetch failed]', e);
    }
  }

  function saveCurrentWord() {
    if (!state.currentTranslation || !state.currentEnglish) return;
    const category = Categories.detectCategory(state.currentEnglish);
    const pos = Categories.detectPartOfSpeech(state.currentEnglish);
    const { word, isNew } = WordBank.addOrUpdateWord({
      english: state.currentEnglish,
      german: state.currentTranslation,
      category,
      partOfSpeech: pos,
    });
    updateNavStats();
    if (isNew) showToast(`"${word.german}" saved! ✨`, 'success');
    else showToast(`"${word.german}" — used ${word.frequency}× now`, 'info');

    if (isNew && getGeminiKey()) {
      fetchAndAttachWordMetadata(word.id, word.german, word.english);
    }

    const btn = document.getElementById('save-word-btn');
    if (btn) {
      btn.textContent = '✓ Saved!';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = 'Save Word'; btn.disabled = false; }, 2000);
    }
  }

  function renderRecentTranslations() {
    const history = WordBank.getHistory();
    const container = document.getElementById('recent-list');
    if (!container) return;
    if (history.length === 0) {
      container.innerHTML = `<p class="text-muted text-center" style="padding:1rem">No recent translations yet. Start typing above!</p>`;
      return;
    }
    container.innerHTML = history.slice(0, 6).map(h => {
      const catInfo = Categories.getCategoryInfo(h.category);
      return `
        <div class="recent-item" onclick="App.loadFromHistory('${escAttr(h.english)}', '${escAttr(h.german)}')">
          <span class="recent-en">${escHtml(h.english)}</span>
          <span class="recent-arrow">→</span>
          <span class="recent-de">${escHtml(h.german)}</span>
          <span class="badge badge-${h.category}" style="font-size:0.7rem;">${catInfo.emoji}</span>
          <span class="recent-time">${formatTimeAgo(h.at)}</span>
        </div>`;
    }).join('');
  }

  function loadFromHistory(english, german) {
    if (state.translationDirection !== 'en-de') {
      const swapBtn = document.getElementById('swap-languages-btn');
      if (swapBtn) swapBtn.click();
    }
    const input = document.getElementById('translate-input');
    if (input) { input.value = english; }
    const charCount = document.getElementById('char-count');
    if (charCount) charCount.textContent = `${english.length} / 500`;
    state.currentEnglish = english;
    state.currentTranslation = german;
    const category = Categories.detectCategory(english);
    const pos = Categories.detectPartOfSpeech(english);
    const cefrLevel = CEFR.getLevel(german);
    displayResult(english, german, [], cefrLevel, 'MyMemory', category, pos);
  }

  // ── Word Bank ────────────────────────────────────────────────
  function setupWordBank() {
    const searchInput = document.getElementById('bank-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.wordBankSearch = searchInput.value.toLowerCase();
        renderWordBank();
      });
    }
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.wordBankFilter = pill.dataset.filter;
        renderWordBank();
      });
    });
  }

  function renderWordBank() {
    let words = WordBank.getAllWords();
    if (state.wordBankFilter !== 'all') words = words.filter(w => w.category === state.wordBankFilter);
    if (state.wordBankSearch) {
      words = words.filter(w =>
        w.english.toLowerCase().includes(state.wordBankSearch) ||
        w.german.toLowerCase().includes(state.wordBankSearch)
      );
    }
    words.sort((a, b) => b.frequency - a.frequency);

    const container = document.getElementById('word-grid');
    if (!container) return;

    if (words.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-state-icon">📚</div>
          <h3>${state.wordBankSearch ? 'No words found' : 'Your word bank is empty'}</h3>
          <p>${state.wordBankSearch ? 'Try a different search' : 'Translate & save words to fill your bank!'}</p>
        </div>`;
      return;
    }

    container.innerHTML = words.map(w => {
      const catInfo = Categories.getCategoryInfo(w.category);
      const freq = Math.min(w.frequency, 5);
      const dots = Array.from({ length: 5 }, (_, i) =>
        `<div class="freq-dot ${i < freq ? 'active' : ''}"></div>`).join('');
      const accuracy = w.attempts > 0 ? Math.round((w.correctAnswers / w.attempts) * 100) : null;
      const cefrLevel = CEFR.getLevel(w.german);
      const cefrInfo = CEFR.getLevelInfo(cefrLevel);
      const pluralHtml = w.aiPlural ? `<div class="word-card-ai-meta-item plural"><span>Plural:</span> <strong>${formatGermanWord(w.aiPlural)}</strong></div>` : '';
      const conjHtml = w.aiConjugations ? `<div class="word-card-ai-meta-item conjugations"><span>Forms:</span> <strong>${escHtml(w.aiConjugations)}</strong></div>` : '';
      const exampleHtml = w.aiExampleDe ? `
        <div class="word-card-ai-example">
          <div class="example-de">💬 ${escHtml(w.aiExampleDe)}</div>
          <div class="example-en">${escHtml(w.aiExampleEn || '')}</div>
        </div>` : '';
      const aiMetaHtml = (pluralHtml || conjHtml || exampleHtml) ? `
        <div class="word-card-ai-details">
          ${pluralHtml}
          ${conjHtml}
          ${exampleHtml}
        </div>` : '';

      return `
        <div class="word-card" id="word-${w.id}">
          <div class="word-card-header">
            <div>
              <div class="word-card-de">${formatGermanWord(w.german)}</div>
              <div class="word-card-en">${escHtml(w.english)}</div>
            </div>
            <div class="word-card-actions">
              <button class="btn btn-ghost btn-icon btn-sm" onclick="App.speakGerman('${escAttr(w.german)}')" title="Hear pronunciation">🔊</button>
              <button class="btn btn-ghost btn-icon btn-sm" onclick="App.practiceWord('${w.id}')" title="Practice">🎯</button>
              <button class="btn btn-danger btn-icon btn-sm" onclick="App.deleteWord('${w.id}')" title="Delete">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="flex gap-sm" style="flex-wrap:wrap">
            <span class="badge badge-${w.category}">${catInfo.emoji} ${catInfo.label}</span>
            <span class="badge" style="background:${cefrInfo.bg};color:${cefrInfo.color};border:1px solid ${cefrInfo.color}22">
              ${cefrLevel}
            </span>
            ${accuracy !== null ? `<span class="badge" style="background:rgba(71,207,115,0.1);color:#47cf73">✓ ${accuracy}%</span>` : ''}
          </div>
          ${aiMetaHtml}
          <div class="word-card-footer">
            <div class="frequency-bar"><div class="freq-dots">${dots}</div><span>${w.frequency}× used</span></div>
            <span style="font-size:0.75rem;color:var(--text-muted)">${formatDate(w.lastUsed)}</span>
          </div>
        </div>`;
    }).join('');
  }

  function deleteWord(id) {
    WordBank.deleteWord(id);
    const el = document.getElementById(`word-${id}`);
    if (el) {
      el.style.transition = 'all 0.3s ease';
      el.style.transform = 'scale(0.9)';
      el.style.opacity = '0';
      setTimeout(() => renderWordBank(), 300);
    }
    updateNavStats();
    showToast('Word deleted', 'error');
  }

  function practiceWord() { navigateTo('exercises'); setTimeout(() => startExercise('flashcard'), 100); }

  // ── Exercises ────────────────────────────────────────────────
  function renderExercisePicker() {
    const allWords = WordBank.getAllWords();
    const today = new Date().toISOString().split('T')[0];
    const dueWords = allWords.filter(w => !w.srsNextReview || w.srsNextReview <= today);
    const dueCount = dueWords.length;
    const totalCount = allWords.length;

    const countText = dueCount >= 4 
      ? `${dueCount} due for review` 
      : `${totalCount} total words (no reviews due)`;

    ['ex-word-count','ex-mc-count','ex-fitb-count'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = countText;
    });
    const mcStart = document.getElementById('start-mc');
    if (mcStart) mcStart.disabled = totalCount < 4;
  }

  function setupExercises() {
    document.getElementById('start-flashcard')?.addEventListener('click', () => startExercise('flashcard'));
    document.getElementById('start-mc')?.addEventListener('click', () => startExercise('mc'));
    document.getElementById('start-fitb')?.addEventListener('click', () => startExercise('fitb'));
  }

  function startExercise(mode) {
    const allWords = WordBank.getAllWords();
    if (allWords.length === 0) { showToast('Save some words first!', 'error'); return; }

    const today = new Date().toISOString().split('T')[0];
    const dueWords = allWords.filter(w => !w.srsNextReview || w.srsNextReview <= today);
    // Use due words if at least 4 are due, otherwise fall back to all words
    const words = dueWords.length >= 4 ? dueWords : allWords;

    state.exerciseMode = mode;
    state.exerciseIndex = 0;
    state.exerciseScore = 0;
    document.getElementById('exercise-picker').classList.add('hidden');
    document.getElementById('exercise-area').classList.remove('hidden');
    document.getElementById('exercise-result-area').classList.add('hidden');
    if (mode === 'flashcard') { state.exerciseQuestions = Exercises.generateFlashcards(words); renderFlashcard(); }
    else if (mode === 'mc') { state.exerciseQuestions = Exercises.generateMultipleChoice(words); renderMCQuestion(); }
    else if (mode === 'fitb') { state.exerciseQuestions = Exercises.generateFillBlank(words); renderFITBQuestion(); }
  }

  function endExercise() {
    document.getElementById('exercise-area').classList.add('hidden');
    document.getElementById('exercise-result-area').classList.remove('hidden');
    const total = state.exerciseQuestions.length;
    const score = state.exerciseScore;
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    document.getElementById('result-score-pct').textContent = `${pct}%`;
    let msg, emoji;
    if (pct >= 90) { msg = 'Ausgezeichnet! You\'re on fire! 🔥'; emoji = '🏆'; }
    else if (pct >= 70) { msg = 'Sehr gut! Great work!'; emoji = '⭐'; }
    else if (pct >= 50) { msg = 'Gut gemacht! Good effort!'; emoji = '👍'; }
    else { msg = 'Weiter üben! Keep practising!'; emoji = '💪'; }
    document.getElementById('result-emoji').textContent = emoji;
    document.getElementById('result-msg').textContent = msg;
    document.getElementById('result-detail').textContent = `${score} / ${total} correct`;

    WordBank.unlockExerciseBadges(score, total);
  }

  function renderFlashcard() {
    const cards = state.exerciseQuestions;
    const i = state.exerciseIndex;
    if (i >= cards.length) { endExercise(); return; }
    const card = cards[i];
    state.flashcardFlipped = false;
    const cefrLevel = CEFR.getLevel(card.back);
    const cefrInfo = CEFR.getLevelInfo(cefrLevel);

    // Look up base word metadata
    const rootId = WordBank.getRootWordId(card.id);
    const dbWord = WordBank.getAllWords().find(w => w.id === rootId);
    let aiBackHtml = '';
    if (dbWord) {
      const p = dbWord.aiPlural ? `<div style="font-size:0.85rem; margin-top:4px; color:var(--text-secondary);">Plural: <strong style="color:var(--text-primary);">${dbWord.aiPlural}</strong></div>` : '';
      const c = dbWord.aiConjugations ? `<div style="font-size:0.85rem; margin-top:2px; color:var(--text-secondary);">Forms: <strong style="color:var(--text-primary);">${dbWord.aiConjugations}</strong></div>` : '';
      const ex = dbWord.aiExampleDe ? `
        <div style="margin-top:8px; font-style:italic; font-size:0.8rem; padding:6px 10px; background:rgba(0,0,0,0.03); border-radius:6px; border-left:3px solid var(--primary); text-align:left;">
          <div style="color:var(--text-primary);">"${dbWord.aiExampleDe}"</div>
          <div style="color:var(--text-muted); font-size:0.75rem; margin-top:2px;">${dbWord.aiExampleEn || ''}</div>
        </div>` : '';
      if (p || c || ex) {
        aiBackHtml = `<div style="margin-top:10px; border-top:1px solid rgba(0,0,0,0.06); padding-top:6px; text-align:left; width:100%; box-sizing:border-box;">${p}${c}${ex}</div>`;
      }
    }

    const area = document.getElementById('exercise-area');
    area.innerHTML = `
      <div class="flashcard-container">
        <div class="flashcard-progress">
          <div class="progress-bar"><div class="progress-fill" style="width:${(i/cards.length)*100}%"></div></div>
          <span class="progress-label">${i+1} / ${cards.length}</span>
        </div>
        <div class="flashcard-scene" id="flashcard-scene" onclick="App.flipCard()">
          <div class="flashcard-inner" id="flashcard-inner">
            <div class="flashcard-face flashcard-front">
              <span class="flashcard-hint">English — click to reveal</span>
              <div class="flashcard-word">${escHtml(card.front)}</div>
              <span class="flashcard-hint">Tap to flip 👆</span>
            </div>
            <div class="flashcard-face flashcard-back">
              <span class="flashcard-hint">German</span>
              <div style="display:flex; align-items:center; justify-content:center; gap:8px;">
                <div class="flashcard-word" style="margin:0">${formatGermanWord(card.back)}</div>
                <button class="btn btn-ghost btn-icon speaker-btn" onclick="event.stopPropagation(); App.speakGerman('${escAttr(card.back)}')" title="Hear pronunciation" style="font-size:1.2rem; padding:4px; height:auto; width:auto; border-radius:50%;">🔊</button>
              </div>
              <div class="flashcard-category" style="display:flex;gap:0.5rem;align-items:center;margin-top:8px;">
                <span class="badge badge-${card.category}">${Categories.getCategoryInfo(card.category).emoji} ${Categories.getCategoryInfo(card.category).label}</span>
                <span class="badge" style="background:${cefrInfo.bg};color:${cefrInfo.color}">${cefrLevel}</span>
              </div>
              ${aiBackHtml}
            </div>
          </div>
        </div>
        <div class="flashcard-controls" id="fc-controls" style="display:none">
          <button class="btn btn-danger" onclick="App.flashcardAnswer(false)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg> Didn't know
          </button>
          <button class="btn btn-primary" onclick="App.flashcardAnswer(true)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg> Got it!
          </button>
        </div>
        <div style="text-align:center;margin-top:1rem">
          <button class="btn btn-ghost btn-sm" onclick="App.stopExercise()">Stop session</button>
        </div>
      </div>`;
  }

  function flipCard() {
    const inner = document.getElementById('flashcard-inner');
    const controls = document.getElementById('fc-controls');
    if (!inner) return;
    state.flashcardFlipped = !state.flashcardFlipped;
    inner.classList.toggle('flipped', state.flashcardFlipped);
    if (state.flashcardFlipped && controls) {
      controls.style.display = 'flex';
      controls.style.gap = '1rem';
      const cards = state.exerciseQuestions;
      const card = cards[state.exerciseIndex];
      if (card && card.back) {
        speakGerman(card.back);
      }
    }
  }

  function flashcardAnswer(correct) {
    const card = state.exerciseQuestions[state.exerciseIndex];
    WordBank.recordExerciseResult(card.id, correct);
    if (correct) state.exerciseScore++;
    state.exerciseIndex++;
    renderFlashcard();
  }

  function renderMCQuestion() {
    const questions = state.exerciseQuestions;
    const i = state.exerciseIndex;
    if (i >= questions.length) { endExercise(); return; }
    const q = questions[i];
    const area = document.getElementById('exercise-area');
    area.innerHTML = `
      <div class="mc-container">
        <div class="flashcard-progress" style="margin-bottom:1.5rem">
          <div class="progress-bar"><div class="progress-fill" style="width:${(i/questions.length)*100}%"></div></div>
          <span class="progress-label">${i+1} / ${questions.length}</span>
        </div>
        <p style="text-align:center;color:var(--text-muted);font-size:0.85rem;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.08em">
          What is the German word for…
        </p>
        <div class="mc-question">${escHtml(q.question)}</div>
        <div class="mc-options">
          ${q.options.map((opt, oi) => `
            <button class="mc-option" id="mc-opt-${oi}"
              onclick="App.answerMC('${escAttr(opt)}','${escAttr(q.answer)}','${q.id}')">
              ${escHtml(opt)}
            </button>`).join('')}
        </div>
        <div id="mc-feedback" style="margin-top:1.2rem; min-height:40px; text-align:center;"></div>
        <div style="text-align:center;margin-top:1.5rem">
          <button class="btn btn-ghost btn-sm" onclick="App.stopExercise()">Stop session</button>
        </div>
      </div>`;
  }

  function answerMC(selected, correct, wordId) {
    const isCorrect = selected === correct;
    WordBank.recordExerciseResult(wordId, isCorrect);
    speakGerman(correct);
    if (isCorrect) state.exerciseScore++;
    document.querySelectorAll('.mc-option').forEach(btn => {
      btn.disabled = true;
      const t = btn.textContent.trim();
      if (t === correct) btn.classList.add('correct');
      else if (t === selected && !isCorrect) btn.classList.add('wrong');
    });

    if (isCorrect) {
      setTimeout(() => { state.exerciseIndex++; renderMCQuestion(); }, 1200);
    } else {
      const feedback = document.getElementById('mc-feedback');
      if (feedback) {
        const q = state.exerciseQuestions[state.exerciseIndex];
        const explainBtn = getGeminiKey() ? `<button class="btn btn-ghost btn-sm" style="background:rgba(252,208,0,0.1);color:#b89a00;border:1px solid rgba(252,208,0,0.25);" onclick="App.explainMistake('${escAttr(q.question)}', '${escAttr(correct)}', '${escAttr(selected)}')">💡 Explain</button>` : '';
        feedback.innerHTML = `
          <div style="display:flex; gap:12px; justify-content:center; align-items:center; margin-top:10px;">
            ${explainBtn}
            <button class="btn btn-primary btn-sm" onclick="App.nextQuestion()">Next Question ➔</button>
          </div>`;
      }
    }
  }

  function renderFITBQuestion() {
    const questions = state.exerciseQuestions;
    const i = state.exerciseIndex;
    if (i >= questions.length) { endExercise(); return; }
    const q = questions[i];
    const area = document.getElementById('exercise-area');
    area.innerHTML = `
      <div class="fitb-container">
        <div class="flashcard-progress" style="margin-bottom:1.5rem">
          <div class="progress-bar"><div class="progress-fill" style="width:${(i/questions.length)*100}%"></div></div>
          <span class="progress-label">${i+1} / ${questions.length}</span>
        </div>
        <p style="text-align:center;color:var(--text-muted);font-size:0.85rem;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.08em">
          Complete the German sentence
        </p>
        <div class="fitb-sentence">
          ${escHtml(q.sentenceDe).replace('___', `<span class="fitb-blank" id="fitb-filled">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>`)}
        </div>
        <p style="color:var(--text-muted);font-size:0.85rem;text-align:center;margin-bottom:1rem">Hint: "${escHtml(q.english)}"</p>
        <div class="fitb-input-row">
          <input class="input" id="fitb-input" type="text" placeholder="Type the German word…"
            autocomplete="off" autocorrect="off"
            onkeydown="if(event.key==='Enter') App.checkFITB('${escAttr(q.answer)}','${q.id}')">
          <button class="btn btn-primary" onclick="App.checkFITB('${escAttr(q.answer)}','${q.id}')">Check</button>
        </div>
        <div id="fitb-feedback" style="margin-top:1rem;text-align:center;min-height:40px"></div>
        <div style="text-align:center;margin-top:1.5rem">
          <button class="btn btn-ghost btn-sm" onclick="App.stopExercise()">Stop session</button>
        </div>
      </div>`;
    document.getElementById('fitb-input')?.focus();
  }

  function checkFITB(answer, wordId) {
    const input = document.getElementById('fitb-input');
    if (!input) return;
    const userAnswer = input.value.trim();
    if (!userAnswer) return;
    const isCorrect = userAnswer.toLowerCase() === answer.toLowerCase();
    WordBank.recordExerciseResult(wordId, isCorrect);
    speakGerman(answer);
    if (isCorrect) state.exerciseScore++;
    input.disabled = true;
    const checkBtn = document.querySelector('.fitb-input-row button');
    if (checkBtn) checkBtn.disabled = true;
    const filled = document.getElementById('fitb-filled');
    if (filled) filled.textContent = answer;
    const feedback = document.getElementById('fitb-feedback');

    if (isCorrect) {
      feedback.innerHTML = `<span style="color:#47cf73;font-weight:600;font-size:1.1rem">✓ Richtig! Correct! 🎉</span>`;
      setTimeout(() => { state.exerciseIndex++; renderFITBQuestion(); }, 1200);
    } else {
      const q = state.exerciseQuestions[state.exerciseIndex];
      const explainBtn = getGeminiKey() ? `<button class="btn btn-ghost btn-sm" style="background:rgba(252,208,0,0.1);color:#b89a00;border:1px solid rgba(252,208,0,0.25);" onclick="App.explainMistake('${escAttr(q.sentenceDe || q.english)}', '${escAttr(answer)}', '${escAttr(userAnswer)}')">💡 Explain</button>` : '';
      feedback.innerHTML = `
        <div style="color:#ff3c41;font-weight:600;margin-bottom:8px;">✗ Not quite. Answer: <strong style="color:#fcd000">${escHtml(answer)}</strong></div>
        <div style="display:flex; gap:12px; justify-content:center; align-items:center; margin-top:10px;">
          ${explainBtn}
          <button class="btn btn-primary btn-sm" onclick="App.nextQuestion()">Next Question ➔</button>
        </div>`;
    }
  }

  function stopExercise() {
    document.getElementById('exercise-picker').classList.remove('hidden');
    document.getElementById('exercise-area').classList.add('hidden');
    document.getElementById('exercise-result-area').classList.add('hidden');
    renderExercisePicker();
  }

  // ── Backend Settings Page ──────────────────────────────────────
  async function initBackendPage() {
    const isProdEnv = document.body.classList.contains('prod-mode');

    // Update settings header dynamically
    const titleEl = document.getElementById('settings-title');
    const subEl = document.getElementById('settings-subtitle');
    if (titleEl) titleEl.textContent = isProdEnv ? 'Settings' : 'Backend & Settings';
    if (subEl) subEl.textContent = isProdEnv ? 'Manage your account and offline data' : 'Configure API keys, Firebase, and data management';

    updateGeminiStatusUI();

    if (isProdEnv) {
      // In production mode, we don't need to check server health or populate keys
      return;
    }

    const banner = document.getElementById('backend-banner');
    const icon = document.getElementById('backend-status-icon');
    const title = document.getElementById('backend-status-title');
    const sub = document.getElementById('backend-status-sub');

    // Check server health
    try {
      const r = await fetch('/api/health');
      if (r.ok) {
        if (icon) icon.textContent = '✅';
        if (title) title.textContent = 'Server is running at http://localhost:3000';
        if (sub) sub.innerHTML = 'Translation API calls are proxied securely — your keys stay on the server';
        if (banner) banner.style.borderColor = 'rgba(71,207,115,0.35)';
        if (banner) banner.style.background = 'rgba(71,207,115,0.06)';
      }
    } catch {
      if (icon) icon.textContent = '❌';
      if (title) title.textContent = 'Server not detected';
      if (sub) sub.innerHTML = 'Run <code>npm start</code> in the project folder, then open <code>http://localhost:3000</code>';
      if (banner) banner.style.borderColor = 'rgba(255,60,65,0.35)';
      if (banner) banner.style.background = 'rgba(255,60,65,0.06)';
    }

    // Populate settings from localStorage
    const s = Translator.loadSettings();
    const pgProvider = document.getElementById('settings-page-provider');
    const pgDeepl = document.getElementById('pg-deepl-key');
    const pgGoogle = document.getElementById('pg-google-key');
    if (pgProvider) pgProvider.value = s.provider || 'auto';
    if (pgDeepl) pgDeepl.value = s.deeplKey || '';
    if (pgGoogle) pgGoogle.value = s.googleKey || '';

    // Show server API status if available
    const serverStatus = Translator.serverStatus;
    if (serverStatus) {
      const deeplEl = document.getElementById('deepl-status');
      const googleEl = document.getElementById('google-status');
      const apiBadge = document.getElementById('translation-api-badge');
      if (deeplEl) { deeplEl.textContent = serverStatus.hasDeeplKey ? '✅ Active' : '—'; if (serverStatus.hasDeeplKey) deeplEl.classList.add('active'); }
      if (googleEl) { googleEl.textContent = serverStatus.hasGoogleKey ? '✅ Active' : '—'; if (serverStatus.hasGoogleKey) googleEl.classList.add('active'); }
      if (apiBadge) apiBadge.textContent = serverStatus.activeProvider || 'MyMemory';
      const fbBadge = document.getElementById('firebase-badge');
      if (fbBadge) fbBadge.textContent = serverStatus.hasFirebase ? '🔥 Connected' : 'Not connected';
    }
  }

  function savePageSettings() {
    const settings = {
      provider: document.getElementById('settings-page-provider')?.value || 'auto',
      deeplKey: document.getElementById('pg-deepl-key')?.value?.trim() || '',
      googleKey: document.getElementById('pg-google-key')?.value?.trim() || '',
    };
    Translator.saveSettings(settings);
    // Also sync to drawer
    const drawerProvider = document.getElementById('setting-provider');
    const drawerDeepl = document.getElementById('setting-deepl-key');
    const drawerGoogle = document.getElementById('setting-google-key');
    if (drawerProvider) drawerProvider.value = settings.provider;
    if (drawerDeepl) drawerDeepl.value = settings.deeplKey;
    if (drawerGoogle) drawerGoogle.value = settings.googleKey;
    updateProviderIndicator();
    showToast(`Settings saved — using ${Translator.getActiveProviderName()}`, 'success');
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

  function exportWordBank() {
    const data = { words: WordBank.getAllWords(), history: WordBank.getHistory(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mein-woerterbuch-${new Date().toISOString().slice(0,10)}.json`;
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
    a.download = `mein-woerterbuch-${new Date().toISOString().slice(0,10)}.csv`;
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

  // ── Toast ─────────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '❌', info: '💡' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3100);
  }

  // ── Utils ─────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(str) { return String(str).replace(/'/g,"\\'").replace(/"/g,'\\"'); }
  function capitalise(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
  function formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'}); }
  function formatTimeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  }

  // ══════════════════════════════════════════════════════════════
  //  AUTH FLOW
  // ══════════════════════════════════════════════════════════════

  // Called on every Firebase auth state change (login / logout)
  async function handleAuthChange(user) {
    if (user) {
      // Init storage with uid (Firestore if available, localStorage fallback)
      await WordBank.init(user.uid, () => {
        // Re-render views when Firestore pushes updates
        if (state.currentView === 'bank')     renderWordBank();
        if (state.currentView === 'insights') Insights.render(WordBank.getStats());
        updateNavStats();
      });

      // Boot the app UI only on first auth
      if (!_appInitialized) {
        init();
        _appInitialized = true;
      } else {
        // Subsequent auth changes: re-render data views
        updateNavStats();
        if (state.currentView === 'bank')     renderWordBank();
        if (state.currentView === 'insights') Insights.render(WordBank.getStats());
      }

      showApp();
      updateUserProfile(user);
    } else {
      // Signed out
      DB.cleanup();
      showLoginScreen();
    }
  }

  function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
  }

  function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
  }

  // ── Update navbar avatar + dropdown ───────────────────────────
  function updateUserProfile(user) {
    const isGuest  = Auth.isGuest();
    const name     = Auth.getDisplayName();
    const email    = Auth.getEmail();
    const photoURL = Auth.getPhotoURL();
    const initial  = (name || 'G').charAt(0).toUpperCase();

    // Avatar
    const avatarInitial = document.getElementById('nav-avatar-initial');
    const avatarImg     = document.getElementById('nav-avatar-img');
    if (photoURL && !isGuest) {
      avatarImg.src     = photoURL;
      avatarImg.style.display = 'block';
      if (avatarInitial) avatarInitial.style.display = 'none';
    } else {
      avatarImg.style.display = 'none';
      if (avatarInitial) { avatarInitial.style.display = 'block'; avatarInitial.textContent = initial; }
    }

    // Dropdown
    const dropdownName  = document.getElementById('user-dropdown-name');
    const dropdownEmail = document.getElementById('user-dropdown-email');
    const dropdownBadge = document.getElementById('user-dropdown-badge');
    const upgradeBtn    = document.getElementById('upgrade-btn');
    if (dropdownName)  dropdownName.textContent  = isGuest ? 'Guest User' : (name || 'User');
    if (dropdownEmail) dropdownEmail.textContent = isGuest ? 'Not signed in' : (email || '');
    if (dropdownBadge) {
      dropdownBadge.textContent = isGuest ? 'Guest' : 'Google';
      dropdownBadge.className   = 'nav-user-badge' + (isGuest ? ' guest' : '');
    }
    if (upgradeBtn) upgradeBtn.style.display = isGuest ? '' : 'none';

    // Guest banner
    const guestBanner = document.getElementById('guest-banner');
    if (guestBanner) guestBanner.classList.toggle('hidden', !isGuest);

    // Settings drawer account section
    const drawerDesc    = document.getElementById('settings-account-desc');
    const drawerUpgrade = document.getElementById('drawer-upgrade-btn');
    if (drawerDesc)    drawerDesc.textContent = isGuest ? 'Signed in as Guest' : `Signed in as ${name || email || 'User'}`;
    if (drawerUpgrade) drawerUpgrade.style.display = isGuest ? '' : 'none';

    // Settings page account section
    const pageBadge = document.getElementById('settings-page-account-badge');
    const pageAvatarInitial = document.getElementById('settings-page-avatar-initial');
    const pageAvatarImg = document.getElementById('settings-page-avatar-img');
    const pageName = document.getElementById('settings-page-user-name');
    const pageEmail = document.getElementById('settings-page-user-email');
    const pageSyncDesc = document.getElementById('settings-page-sync-desc');
    const pageUpgrade = document.getElementById('settings-page-upgrade-btn');

    if (pageBadge) {
      pageBadge.textContent = isGuest ? 'Guest' : 'Google';
      pageBadge.className = 'settings-api-badge' + (isGuest ? ' guest' : '');
    }
    if (photoURL && !isGuest) {
      if (pageAvatarImg) { pageAvatarImg.src = photoURL; pageAvatarImg.style.display = 'block'; }
      if (pageAvatarInitial) pageAvatarInitial.style.display = 'none';
    } else {
      if (pageAvatarImg) pageAvatarImg.style.display = 'none';
      if (pageAvatarInitial) { pageAvatarInitial.style.display = 'block'; pageAvatarInitial.textContent = initial; }
    }
    if (pageName) pageName.textContent = isGuest ? 'Guest User' : (name || 'User');
    if (pageEmail) pageEmail.textContent = isGuest ? 'Not signed in' : (email || '');
    if (pageSyncDesc) {
      pageSyncDesc.textContent = isGuest
        ? 'Your vocabulary is currently stored locally in this browser. Upgrade to a Google Account to back up your data and sync across devices.'
        : 'All vocabulary and stats are securely backed up and syncing in real-time to the cloud.';
    }
    if (pageUpgrade) pageUpgrade.style.display = isGuest ? '' : 'none';
  }

  // ── Login / logout actions ────────────────────────────────────
  async function loginWithGoogle() {
    _setLoginLoading(true, 'google');
    _setLoginError('');
    try {
      await Auth.signInWithGoogle();
      // handleAuthChange fires automatically
    } catch (e) {
      console.error('[Auth] Google sign-in failed:', e);
      _setLoginError(e.code === 'auth/popup-closed-by-user'
        ? 'Sign-in was cancelled. Please try again.'
        : 'Sign-in failed: ' + (e.message || e.code));
    } finally {
      _setLoginLoading(false, 'google');
    }
  }

  async function loginAsGuest() {
    _setLoginLoading(true, 'guest');
    _setLoginError('');
    try {
      await Auth.signInAsGuest();
    } catch (e) {
      console.error('[Auth] Guest sign-in failed:', e);
      _setLoginError('Could not start guest session. Please check your connection.');
    } finally {
      _setLoginLoading(false, 'guest');
    }
  }

  async function signOut() {
    document.getElementById('user-dropdown').classList.add('hidden');
    try {
      await Auth.signOut();
      _appInitialized = false;
      showToast('Signed out successfully', 'success');
    } catch (e) {
      showToast('Sign-out failed', 'error');
    }
  }

  async function upgradeToGoogle() {
    document.getElementById('user-dropdown').classList.add('hidden');
    showToast('Opening Google sign-in…', 'info');
    try {
      await Auth.upgradeGuestToGoogle();
      showToast('🎉 Linked to Google! Your words are now synced.', 'success');
    } catch (e) {
      console.error('[Auth] Upgrade failed:', e);
      if (e.code !== 'auth/popup-closed-by-user') {
        showToast('Could not link account: ' + (e.message || e.code), 'error');
      }
    }
  }

  function toggleUserMenu() {
    const dd = document.getElementById('user-dropdown');
    if (dd) dd.classList.toggle('hidden');
  }

  // ── Login screen helpers ──────────────────────────────────────
  function _setLoginLoading(loading, type) {
    const googleBtn = document.getElementById('google-signin-btn');
    const guestBtn  = document.getElementById('guest-signin-btn');
    if (!googleBtn || !guestBtn) return;
    googleBtn.disabled = loading;
    guestBtn.disabled  = loading;
    if (loading && type === 'google') {
      googleBtn.innerHTML = '<span class="login-spinner"></span> Signing in…';
    } else if (!loading) {
      googleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Continue with Google`;
    }
  }

  function _setLoginError(msg) {
    const el = document.getElementById('login-error');
    if (!el) return;
    if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
    else      { el.textContent = ''; el.classList.add('hidden'); }
  }

  // ── AI Explanation Modal & Navigation ─────────────────────────
  function showModal(title, contentHtml) {
    document.getElementById('dd-custom-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'dd-custom-modal';
    modal.className = 'dd-modal-overlay';
    modal.innerHTML = `
      <div class="dd-modal-card">
        <div class="dd-modal-header">
          <div class="dd-modal-title">${escHtml(title)}</div>
          <button class="dd-modal-close" onclick="document.getElementById('dd-custom-modal').remove()">✕</button>
        </div>
        <div class="dd-modal-body">
          ${contentHtml}
        </div>
      </div>`;
    document.body.appendChild(modal);
    // Add click handler to close when clicking overlay
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.remove();
    });
  }

  async function explainMistake(context, correct, wrong) {
    showModal('AI Grammar Explanation', '<div style="display:flex; justify-content:center; align-items:center; padding:30px;"><div class="spinner"></div></div>');
    try {
      const prompt = `You are a friendly German language tutor. The user got a question wrong in an exercise.
      Context/Sentence: "${context}"
      Correct Answer: "${correct}"
      User's Incorrect Answer: "${wrong}"
      Explain the grammatical or contextual rule in 2 short, simple sentences. Explain why "${correct}" is correct and why "${wrong}" is incorrect or different. Avoid complex jargon. Write in English.`;

      const explanation = await callGemini(prompt);

      showModal('AI Grammar Explanation', `
        <div style="line-height:1.5; font-size:0.95rem; color:var(--text-primary);">
          <div style="margin-bottom:1rem; padding:10px; background:rgba(255,60,65,0.06); border-radius:6px; font-size:0.85rem; border:1px solid rgba(255,60,65,0.15)">
            <strong>Your answer:</strong> <span style="text-decoration:line-through;color:var(--accent-red);">${escHtml(wrong)}</span><br>
            <strong>Correct answer:</strong> <span style="color:#47cf73;font-weight:600;">${escHtml(correct)}</span>
          </div>
          <p style="margin: 0 0 1.25rem 0;">${escHtml(explanation)}</p>
          <button class="btn btn-primary w-full" onclick="document.getElementById('dd-custom-modal').remove()">Got it!</button>
        </div>`);
    } catch (e) {
      showModal('Explanation Error', `<p style="color:var(--accent-red); margin:0;">${escHtml(e.message)}</p>`);
    }
  }

  async function generateAIStory() {
    const words = WordBank.getAllWords();
    if (words.length < 3) {
      showToast('Save at least 3 words in your word bank first!', 'info');
      return;
    }
    if (!getGeminiKey()) {
      showToast('Add your Gemini API Key in settings to enable this feature!', 'info');
      return;
    }

    const container = document.getElementById('ai-story-container');
    if (container) {
      container.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; padding:30px;"><div class="spinner"></div><span style="margin-left:10px;color:var(--text-muted);">Writing your custom story…</span></div>`;
    }

    const randomWords = [...words].sort(() => 0.5 - Math.random()).slice(0, Math.min(5, words.length));
    const wordListStr = randomWords.map(w => `"${w.german}" (meaning "${w.english}")`).join(', ');

    try {
      const prompt = `You are a German language teacher. Write a very short, simple, engaging story (exactly 3 sentences) in German at an elementary A2-B1 level.
      You MUST naturally use these specific vocabulary words in the story: ${wordListStr}.
      Highlight the target vocabulary words in the German text by surrounding them with asterisks, like *word*.
      Provide a translation of the story in English.
      Return a JSON object with these EXACT keys:
      {
        "storyDe": "The German text of the story (exactly 3 sentences, with target words surrounded by asterisks)",
        "storyEn": "The English translation of the story"
      }`;

      const res = await callGemini(prompt, true);

      let highlightedDe = escHtml(res.storyDe);
      highlightedDe = highlightedDe.replace(/\*([^*]+)\*/g, '<span style="color:var(--primary); font-weight:700;">$1</span>');

      if (container) {
        container.innerHTML = `
          <div class="ai-story-card" style="text-align:left;">
            <p class="ai-story-text-de" style="font-size:1.05rem; line-height:1.6; margin-bottom:1rem; color:var(--text-primary); font-family:'Outfit',sans-serif;">${highlightedDe}</p>
            <button class="btn btn-ghost btn-sm" id="story-translate-btn" onclick="document.getElementById('ai-story-en').classList.toggle('hidden'); this.textContent = this.textContent.includes('Show') ? 'Hide Translation' : 'Show Translation'">Show Translation</button>
            <p class="ai-story-text-en hidden" id="ai-story-en" style="margin-top:0.75rem; color:var(--text-muted); font-size:0.9rem; line-height:1.5;">${escHtml(res.storyEn)}</p>
            <div style="margin-top:1.25rem; font-size:0.75rem; color:var(--text-muted); border-top:1px solid rgba(0,0,0,0.06); padding-top:8px;">
              Featured words: ${randomWords.map(w => `<span class="badge" style="background:rgba(14,190,255,0.08);color:var(--primary);margin-right:4px;">${escHtml(w.german)}</span>`).join('')}
            </div>
            <button class="btn btn-secondary btn-sm" style="margin-top:1rem; width:100%;" onclick="App.generateAIStory()">✏️ Write another story</button>
          </div>`;
      }
    } catch (e) {
      if (container) {
        container.innerHTML = `
          <p style="color:var(--accent-red); margin-bottom:1rem; text-align:center;">Could not write story: ${escHtml(e.message)}</p>
          <div style="text-align:center;"><button class="btn btn-primary btn-sm" onclick="App.generateAIStory()">Try Again</button></div>`;
      }
    }
  }

  function applyBetterPhrasing(text) {
    const input = document.getElementById('translate-input');
    if (input) {
      input.value = text;
      const charCount = document.getElementById('char-count');
      if (charCount) charCount.textContent = `${text.length} / 500`;
      doTranslate(true);
      showToast('Applied improved phrasing! ✨', 'success');
    }
  }

  async function analyzeGermanSentence(germanText) {
    const container = document.getElementById('ai-writing-assistant');
    if (!container) return;

    const geminiKey = getGeminiKey();
    if (!geminiKey) {
      container.innerHTML = `
        <div class="ai-writing-assistant-header">
          <div class="ai-writing-assistant-title">🤖 AI Writing Assistant</div>
        </div>
        <div class="ai-writing-assistant-body">
          <p style="margin-bottom: 8px;">Get instant CEFR levels, grammar feedback, and natural phrasing suggestions for your German text.</p>
          <button class="btn btn-secondary btn-sm" onclick="App.navigateTo('settings')">
            🔑 Configure Gemini API Key →
          </button>
        </div>
      `;
      container.classList.remove('hidden');
      return;
    }

    container.innerHTML = `
      <div class="ai-writing-assistant-header">
        <div class="ai-writing-assistant-title">🤖 AI Writing Assistant</div>
        <div class="spinner" style="width:14px; height:14px; border-width:2px; margin:0;"></div>
      </div>
      <div class="ai-writing-assistant-body" style="color:var(--text-muted)">
        Analyzing sentence complexity, CEFR level, and phrasing…
      </div>
    `;
    container.classList.remove('hidden');

    try {
      const prompt = `Analyze the German sentence "${germanText}".
      Provide an assessment of its CEFR level (A1, A2, B1, B2, C1, or C2) and suggestions for improving it to sound more natural, grammatically correct, or sophisticated.
      Return a JSON object with this EXACT structure:
      {
        "cefrLevel": "A1/A2/B1/B2/C1/C2",
        "cefrTitle": "Beginner / Intermediate / Advanced / etc.",
        "analysis": "A very brief explanation of the sentence structure or grammar.",
        "improvements": [
          {
            "original": "part of the sentence that can be improved (or empty string if none)",
            "improved": "the improved version (or empty string if none)",
            "reason": "explanation of the change (or empty string if none)"
          }
        ],
        "betterVersion": "An improved, more natural or advanced version of the sentence. If the sentence is already perfect and high level, repeat the original sentence.",
        "betterLevel": "The CEFR level of the improved sentence."
      }`;

      const res = await callGemini(prompt, true);
      if (!res || !res.cefrLevel) throw new Error('Invalid response from AI');

      const levelColors = {
        A1: { color: '#47cf73', bg: 'rgba(71,207,115,0.08)', border: 'rgba(71,207,115,0.22)' },
        A2: { color: '#0ebeff', bg: 'rgba(14,190,255,0.08)', border: 'rgba(14,190,255,0.22)' },
        B1: { color: '#fcd000', bg: 'rgba(252,208,0,0.08)', border: 'rgba(252,208,0,0.22)' },
        B2: { color: '#ae63e4', bg: 'rgba(174,99,228,0.08)', border: 'rgba(174,99,228,0.22)' },
        C1: { color: '#ff3c41', bg: 'rgba(255,60,65,0.08)', border: 'rgba(255,60,65,0.22)' },
        C2: { color: '#ff3c41', bg: 'rgba(255,60,65,0.08)', border: 'rgba(255,60,65,0.22)' },
      };

      const meta = levelColors[res.cefrLevel] || { color: '#ae63e4', bg: 'rgba(174,99,228,0.08)', border: 'rgba(174,99,228,0.22)' };

      let improvementsHtml = '';
      if (res.improvements && res.improvements.length > 0 && res.improvements[0].original) {
        improvementsHtml = `
          <div class="ai-writing-assistant-improvements">
            <div class="ai-writing-assistant-improvements-title">Refinements Suggestions</div>
            <div class="ai-writing-assistant-improvements-list">
              ${res.improvements.map(imp => `
                <div class="ai-writing-assistant-improvement-item">
                  <div class="ai-writing-assistant-improvement-orig">“${escHtml(imp.original)}”</div>
                  <div class="ai-writing-assistant-improvement-new">➔ “${escHtml(imp.improved)}”</div>
                  <div class="ai-writing-assistant-improvement-reason">${escHtml(imp.reason)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      const betterHtml = `
        <div class="ai-writing-assistant-better">
          <div class="ai-writing-assistant-better-title">Elevated Version (${res.betterLevel})</div>
          <div class="ai-writing-assistant-better-text">
            <span id="ai-better-display">${escHtml(res.betterVersion)}</span>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-ghost btn-sm btn-icon" onclick="App.speakGerman(document.getElementById('ai-better-display').textContent)" title="Hear pronunciation" style="padding: 2px; width: 28px; height: 28px; border-radius: 50%;">🔊</button>
              <button class="btn btn-ghost btn-sm" onclick="App.applyBetterPhrasing('${escAttr(res.betterVersion)}')" style="padding: 2px 8px; font-size: 0.75rem;">Use this</button>
            </div>
          </div>
          ${res.betterVersion.toLowerCase().trim() !== germanText.toLowerCase().trim() 
            ? `<div class="ai-writing-assistant-better-explain">${escHtml(res.analysis)}</div>` 
            : `<div class="ai-writing-assistant-better-explain">Your sentence is grammatically correct and natural! Great job.</div>`}
        </div>
      `;

      container.innerHTML = `
        <div class="ai-writing-assistant-header">
          <div class="ai-writing-assistant-title">🤖 AI Writing Assistant</div>
          <span class="ai-writing-assistant-cefr-badge" style="color: ${meta.color}; background: ${meta.bg}; border: 1px solid ${meta.border}; text-shadow: none;">
            Level: ${res.cefrLevel}
          </span>
        </div>
        <div class="ai-writing-assistant-body">
          ${betterHtml}
          ${improvementsHtml}
        </div>
      `;
    } catch (e) {
      console.warn('[AI Writing Assistant failed]', e);
      container.innerHTML = `
        <div class="ai-writing-assistant-header">
          <div class="ai-writing-assistant-title">🤖 AI Writing Assistant</div>
        </div>
        <div class="ai-writing-assistant-body" style="color: var(--accent-red)">
          Failed to analyze writing: ${e.message}
        </div>
      `;
    }
  }

  function toggleVerbConjugations() {
    state.verbConjugationsOpen = !state.verbConjugationsOpen;
    const panel = document.getElementById('verb-conjugations-panel');
    const btn = document.getElementById('verb-conjugations-btn');

    if (state.verbConjugationsOpen) {
      panel?.classList.remove('hidden');
      if (btn) btn.textContent = '▲ Hide Verb Conjugations';
      
      if (!state.verbConjugations && state.currentTranslation) {
        const isEnDe = state.translationDirection === 'en-de';
        const germanVerb = isEnDe ? state.currentTranslation : state.currentEnglish;
        fetchVerbConjugations(germanVerb);
      } else if (state.verbConjugations) {
        renderVerbConjugations(state.verbConjugations);
      }
    } else {
      panel?.classList.add('hidden');
      if (btn) btn.textContent = '📊 Show Verb Conjugations';
    }
  }

  function hideVerbConjugations() {
    const panel = document.getElementById('verb-conjugations-panel');
    const btn = document.getElementById('verb-conjugations-btn');
    panel?.classList.add('hidden');
    if (btn) {
      btn.textContent = '📊 Show Verb Conjugations';
      btn.classList.add('hidden');
    }
    state.verbConjugationsOpen = false;
    state.verbConjugations = null;
  }

  async function fetchVerbConjugations(germanVerb) {
    const container = document.getElementById('verb-conjugations-panel');
    if (!container) return;

    const geminiKey = getGeminiKey();
    if (!geminiKey) {
      container.innerHTML = `
        <div class="verb-conjugations-header">
          <div class="verb-conjugations-title">📊 Verb Conjugations</div>
        </div>
        <div style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.45;">
          <p style="margin-bottom: 8px;">View conjugation tables for Present, Past, and Future tenses. Requires a Gemini API Key.</p>
          <button class="btn btn-secondary btn-sm" onclick="App.navigateTo('settings')">
            🔑 Configure Gemini API Key →
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="verb-conjugations-header">
        <div class="verb-conjugations-title">📊 Verb Conjugations</div>
        <div class="spinner" style="width:14px; height:14px; border-width:2px; margin:0;"></div>
      </div>
      <div style="font-size:0.88rem; color:var(--text-muted)">
        Generating conjugation table for "${germanVerb}"…
      </div>
    `;

    try {
      const prompt = `You are a German grammar helper. Conjugate the German verb "${germanVerb}" in the following tenses:
      1. Present (Präsens)
      2. Simple Past (Präteritum)
      3. Present Perfect (Perfekt)
      4. Future (Futur I)
      
      For each tense, provide the conjugated form for the pronouns: ich, du, er/sie/es, wir, ihr, sie/Sie.
      Return a JSON object with this EXACT structure:
      {
        "verb": "${germanVerb}",
        "meaning": "English meaning",
        "conjugations": {
          "present": { "ich": "...", "du": "...", "er_sie_es": "...", "wir": "...", "ihr": "...", "sie_Sie": "..." },
          "past_simple": { "ich": "...", "du": "...", "er_sie_es": "...", "wir": "...", "ihr": "...", "sie_Sie": "..." },
          "past_perfect": { "ich": "...", "du": "...", "er_sie_es": "...", "wir": "...", "ihr": "...", "sie_Sie": "..." },
          "future": { "ich": "...", "du": "...", "er_sie_es": "...", "wir": "...", "ihr": "...", "sie_Sie": "..." }
        }
      }`;

      const res = await callGemini(prompt, true);
      if (!res || !res.conjugations) throw new Error('Invalid response from AI');

      state.verbConjugations = res;
      renderVerbConjugations(res);
    } catch (e) {
      console.warn('[Verb conjugation failed]', e);
      container.innerHTML = `
        <div class="verb-conjugations-header">
          <div class="verb-conjugations-title">📊 Verb Conjugations</div>
        </div>
        <div style="font-size: 0.88rem; color: var(--accent-red)">
          Failed to generate conjugations: ${e.message}
        </div>
      `;
    }
  }

  function renderVerbConjugations(data) {
    const container = document.getElementById('verb-conjugations-panel');
    if (!container || !data) return;

    const c = data.conjugations;
    container.innerHTML = `
      <div class="verb-conjugations-header">
        <div class="verb-conjugations-title">📊 Conjugations for "${data.verb}" (${data.meaning || ''})</div>
      </div>
      <div class="verb-conjugations-table-wrapper">
        <table class="conjugation-table">
          <thead>
            <tr>
              <th>Pronoun</th>
              <th>Present (Präsens)</th>
              <th>Simple Past (Präteritum)</th>
              <th>Perfect (Perfekt)</th>
              <th>Future (Futur I)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="conjugation-pronoun">ich</td>
              <td class="conjugation-verb-form">${escHtml(c.present.ich)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_simple.ich)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_perfect.ich)}</td>
              <td class="conjugation-verb-form">${escHtml(c.future.ich)}</td>
            </tr>
            <tr>
              <td class="conjugation-pronoun">du</td>
              <td class="conjugation-verb-form">${escHtml(c.present.du)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_simple.du)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_perfect.du)}</td>
              <td class="conjugation-verb-form">${escHtml(c.future.du)}</td>
            </tr>
            <tr>
              <td class="conjugation-pronoun">er/sie/es</td>
              <td class="conjugation-verb-form">${escHtml(c.present.er_sie_es)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_simple.er_sie_es)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_perfect.er_sie_es)}</td>
              <td class="conjugation-verb-form">${escHtml(c.future.er_sie_es)}</td>
            </tr>
            <tr>
              <td class="conjugation-pronoun">wir</td>
              <td class="conjugation-verb-form">${escHtml(c.present.wir)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_simple.wir)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_perfect.wir)}</td>
              <td class="conjugation-verb-form">${escHtml(c.future.wir)}</td>
            </tr>
            <tr>
              <td class="conjugation-pronoun">ihr</td>
              <td class="conjugation-verb-form">${escHtml(c.present.ihr)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_simple.ihr)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_perfect.ihr)}</td>
              <td class="conjugation-verb-form">${escHtml(c.future.ihr)}</td>
            </tr>
            <tr>
              <td class="conjugation-pronoun">sie/Sie</td>
              <td class="conjugation-verb-form">${escHtml(c.present.sie_Sie)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_simple.sie_Sie)}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_perfect.sie_Sie)}</td>
              <td class="conjugation-verb-form">${escHtml(c.future.sie_Sie)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function nextQuestion() {
    state.exerciseIndex++;
    if (state.exerciseMode === 'mc') renderMCQuestion();
    else if (state.exerciseMode === 'fitb') renderFITBQuestion();
  }

  return {
    init, navigateTo, clearResult,
    flipCard, flashcardAnswer, answerMC, checkFITB, stopExercise,
    deleteWord, practiceWord, loadFromHistory,
    selectSynonym, resetToOriginal,
    toggleLevelVariations, useLevelVariant,
    showCEFRInfo, showToast,
    // Backend settings page
    savePageSettings, updateFirebasePreview,
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
    generateAIStory,
    saveGeminiKeyFromUI,
    updateGeminiStatusUI,
    applyBetterPhrasing,
    analyzeGermanSentence,
    toggleVerbConjugations,
  };

})();
