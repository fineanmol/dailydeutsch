/**
 * features/translate.js — Translator + Word Bank view.
 *
 * Carved out of the former app.js monolith (audit P3). Owns the translate
 * surface (input wiring, debounced translation, result rendering, synonym
 * chips, CEFR level variations, history) and the Word Bank view (grid render,
 * delete, practice shortcut). These share the same "capture vocabulary"
 * concern and helpers (formatGermanWord, renderRecentTranslations).
 *
 * Translation provider logic stays in js/translator.js (Translator.*); this is
 * the view/controller layer. The German→English path defers AI analysis to
 * AIFeatures via ctx.analyzeGermanSentence; the verb-conjugation reset defers
 * to ctx.hideVerbConjugations.
 *
 * Wiring: App calls TranslateFeature.init(ctx) once (which sets up the
 * translator + word bank listeners). renderWordBank / renderRecentTranslations
 * are also invoked by App's auth/router hooks via the App facade delegates.
 *
 * Depends on: store.js, translator.js, wordbank.js, categories.js, cefr.js,
 *             db.js, ui.js, language.js (optional), analytics.js (optional).
 */
const TranslateFeature = (() => {

  // ── Injected shared context (set in init) ─────────────────────
  let state, escHtml, escAttr, capitalise, formatDate, formatTimeAgo, showToast,
      formatGermanWord, getGeminiKey, isAIEnabled, callGemini, getLearningLangName,
      navigateTo, updateNavStats, updateProviderIndicator, analyzeGermanSentence,
      hideVerbConjugations, startExercise;

  function init(ctx) {
    state = ctx.state;
    escHtml = ctx.escHtml;
    escAttr = ctx.escAttr;
    capitalise = ctx.capitalise;
    formatDate = ctx.formatDate;
    formatTimeAgo = ctx.formatTimeAgo;
    showToast = ctx.showToast;
    formatGermanWord = ctx.formatGermanWord;
    getGeminiKey = ctx.getGeminiKey;
    isAIEnabled = ctx.isAIEnabled;
    callGemini = ctx.callGemini;
    getLearningLangName = ctx.getLearningLangName;
    navigateTo = ctx.navigateTo;
    updateNavStats = ctx.updateNavStats;
    updateProviderIndicator = ctx.updateProviderIndicator;
    analyzeGermanSentence = ctx.analyzeGermanSentence;
    hideVerbConjugations = ctx.hideVerbConjugations;
    startExercise = ctx.startExercise;
    setupTranslator();
    setupWordBank();
  }

  // ── Translator ───────────────────────────────────────────────
  function setupTranslator() {
    const input = document.getElementById('translate-input');
    const translateBtn = document.getElementById('translate-btn');
    const saveBtn = document.getElementById('save-word-btn');
    const charCount = document.getElementById('char-count');
    const swapBtn = document.getElementById('swap-languages-btn');

    swapBtn?.addEventListener('click', () => {
      const learningLang = typeof LanguageSupport !== 'undefined' ? LanguageSupport.getLangCode() : 'de';
      const targetDir = 'en-' + learningLang;
      const isEnToTarget = state.translationDirection === targetDir;
      state.translationDirection = isEnToTarget ? (learningLang + '-en') : targetDir;
      localStorage.setItem('dd_swap_direction', isEnToTarget ? '1' : '');

      const subtitle = document.getElementById('translator-subtitle');
      const swapLabel = document.getElementById('swap-btn-label');
      const sourceLabel = document.getElementById('source-lang-label');
      const targetLabel = document.getElementById('target-lang-label');

      const isEnToTargetNow = state.translationDirection.startsWith('en-');
      const currentLang = typeof LanguageSupport !== 'undefined' ? LanguageSupport.getCurrent() : { name: 'German', flag: '🇩🇪' };
      const currentFlag = currentLang.flag;
      const currentName = currentLang.name;

      if (subtitle) {
        subtitle.textContent = isEnToTargetNow
          ? `Type English, get ${currentName}. Save words you use daily`
          : `Type ${currentName}, get English. Check your level and writing`;
      }

      if (swapLabel) {
        swapLabel.textContent = isEnToTargetNow ? `English ⇄ ${currentName}` : `${currentName} ⇄ English`;
      }

      if (sourceLabel) {
        sourceLabel.innerHTML = isEnToTargetNow
          ? '<span class="lang-flag">🇬🇧</span> English'
          : `<span class="lang-flag">${currentFlag}</span> ${currentName}`;
      }

      if (targetLabel) {
        targetLabel.innerHTML = isEnToTargetNow
          ? `<span class="lang-flag">${currentFlag}</span> ${currentName}`
          : '<span class="lang-flag">🇬🇧</span> English';
      }

      if (input) {
        input.placeholder = isEnToTargetNow
          ? 'Type or paste English text here…'
          : `Type or paste ${currentName} text here…`;

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

          // PM activation funnel: first successful translation on this device.
          if (typeof Analytics !== 'undefined') {
            Analytics.logEventOnce('first_translation', { provider: result.provider });
          }

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
        // PM: translation error rate / provider failures / offline.
        if (typeof Analytics !== 'undefined') {
          Analytics.logEvent('translate_failed', {
            offline: (typeof navigator !== 'undefined' && navigator.onLine === false),
            reason: (err && err.message || 'unknown').slice(0, 120),
          });
        }
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
    // Brand CEFR palette — single source of truth in js/cefr.js (CEFR.COLORS).
    const levelColors = (typeof CEFR !== 'undefined' && CEFR.COLORS) || {};
    const levelDesc = {
      A1: 'Beginner: simple, direct everyday words',
      A2: 'Elementary: basic grammar, common phrases',
      B1: 'Intermediate: natural, standard phrasing',
      B2: 'Upper-Intermediate: more precise vocabulary',
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
    showToast(`${level} (${info.title}): ${descriptions[level] || ''}`, 'info');
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
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
    const headline = offline ? "⚠ You're offline" : '⚠ Translation failed';
    const msg = (!offline && detail) ? `: ${escHtml(detail)}` : '';
    const hint = offline
      ? 'Reconnect to the internet and try again. Saved words are still available.'
      : (Translator.isServer
          ? 'The translation service returned an error. Please try again in a moment.'
          : 'Open as <strong>http://localhost:3000</strong> (not as a file) to fix CORS issues.');
    resultArea.innerHTML = `
      <div class="result-text result-empty">
        <span style="color:var(--accent-red)">${headline}${msg}</span>
        <div style="margin-top:8px;font-size:0.8rem;color:var(--text-muted)">${hint}</div>
        <button class="btn btn-secondary" style="margin-top:12px;" onclick="App.retryTranslate()">↻ Try again</button>
      </div>`;
  }

  // Re-run the current translation (used by the error-state "Try again" button).
  function retryTranslate() {
    const input = document.getElementById('translate-input');
    if (input && input.value.trim()) {
      doTranslate(true);
    }
  }

  async function fetchAndAttachWordMetadata(wordId, german, english) {
    if (!isAIEnabled() || !getGeminiKey()) return;
    try {
      const prompt = `You are a ${getLearningLangName()} language assistant. Provide grammatical metadata for the ${getLearningLangName()} word "${german}" (meaning "${english}" in English).
      Return a JSON object with these EXACT keys:
      {
        "plural": "plural form with article if it is a noun (e.g. for German 'die Tische', for Spanish 'los libros'), otherwise null",
        "conjugations": "key verb forms if it is a verb (e.g. 'geht, ging, ist gegangen' or 'habla, habló, hablado'), otherwise null",
        "exampleDe": "a short, simple, natural ${getLearningLangName()} example sentence using the word",
        "exampleEn": "the English translation of the ${getLearningLangName()} example sentence"
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
    else showToast(`"${word.german}" (used ${word.frequency}× now)`, 'info');

    // PM activation funnel: first word saved = real intent to learn (aha moment).
    if (isNew && typeof Analytics !== 'undefined') {
      Analytics.logEventOnce('first_word_saved', { category });
    }

    if (isNew && isAIEnabled() && getGeminiKey()) {
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

  // Apply an AI "better phrasing" suggestion back into the translator input.
  function applyBetterPhrasing(text) {
    const input = document.getElementById('translate-input');
    if (input) {
      if (typeof Analytics !== 'undefined') {
        Analytics.logEvent('ai_better_phrasing_applied');
      }
      input.value = text;
      const charCount = document.getElementById('char-count');
      if (charCount) charCount.textContent = `${text.length} / 500`;
      doTranslate(true);
      showToast('Applied improved phrasing! ✨', 'success');
    }
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
            ${accuracy !== null ? `<span class="badge" style="background:rgba(121,206,184,0.1);color:var(--mint)">✓ ${accuracy}%</span>` : ''}
          </div>
          ${aiMetaHtml}
          <div class="word-card-footer">
            <div class="frequency-bar"><div class="freq-dots">${dots}</div><span>${w.frequency}× used</span></div>
            <span style="font-size:0.75rem;color:var(--text-muted)">${formatDate(w.lastUsed)}</span>
          </div>
        </div>`;
    }).join('');

    if (window.Motion) {
      const { animate, stagger } = window.Motion;
      animate(
        container.querySelectorAll('.word-card'),
        { opacity: [0, 1], y: [15, 0] },
        { delay: stagger(0.02), duration: 0.35, easing: [0.16, 1, 0.3, 1] }
      );
    }
  }

  function deleteWord(id) {
    WordBank.deleteWord(id);
    const el = document.getElementById(`word-${id}`);
    if (el) {
      if (window.Motion) {
        window.Motion.animate(el, { scale: 0.85, opacity: 0, y: 10 }, { duration: 0.25 }).then(() => {
          renderWordBank();
        });
      } else {
        el.style.transition = 'all 0.3s ease';
        el.style.transform = 'scale(0.9)';
        el.style.opacity = '0';
        setTimeout(() => renderWordBank(), 300);
      }
    }
    updateNavStats();
    showToast('Word deleted', 'error');
  }

  function practiceWord() { navigateTo('exercises'); setTimeout(() => startExercise('flashcard'), 100); }

  return {
    init,
    clearResult, retryTranslate,
    selectSynonym, resetToOriginal,
    toggleLevelVariations, useLevelVariant, showCEFRInfo,
    renderRecentTranslations, loadFromHistory,
    saveCurrentWord, applyBetterPhrasing,
    renderWordBank, deleteWord, practiceWord,
  };
})();
