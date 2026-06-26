/**
 * language.js — Modular Language Configuration & Multi-Language Support
 *
 * Configures available learning languages (German, Spanish, French, Italian, Turkish, Chinese, Arabic)
 * and dynamically updates UI labels/placeholders based on the user's choice,
 * making the platform fully extensible like Duolingo.
 */

const LanguageSupport = (() => {

  const LANGUAGES = {
    de: { name: 'German', flag: '🇩🇪', code: 'de-DE', label: 'Deutsch' },
    es: { name: 'Spanish', flag: '🇪🇸', code: 'es-ES', label: 'Español' },
    fr: { name: 'French', flag: '🇫🇷', code: 'fr-FR', label: 'Français' },
    it: { name: 'Italian', flag: '🇮🇹', code: 'it-IT', label: 'Italiano' },
    tr: { name: 'Turkish', flag: '🇹🇷', code: 'tr-TR', label: 'Türkçe' },
    zh: { name: 'Chinese', flag: '🇨🇳', code: 'zh-CN', label: '中文' },
    ar: { name: 'Arabic', flag: '🇸🇦', code: 'ar-SA', label: 'العربية' }
  };

  function getLanguages() {
    return LANGUAGES;
  }

  function getCurrent() {
    const code = localStorage.getItem('dd_learning_lang') || 'de';
    return LANGUAGES[code] || LANGUAGES.de;
  }

  function getLangCode() {
    return localStorage.getItem('dd_learning_lang') || 'de';
  }

  function setLanguage(code) {
    if (!LANGUAGES[code]) return;
    localStorage.setItem('dd_learning_lang', code);
    
    // Update UI elements dynamically
    updateUIElements();
    
    // Trigger profile sync to update the leaderboard details with the new language flags
    if (typeof Auth !== 'undefined' && !Auth.isGuest()) {
      if (typeof Leaderboard !== 'undefined') {
        const stats = (typeof WordBank !== 'undefined') ? WordBank.getStats() : null;
        Leaderboard.syncProfile(Auth.getUid(), stats);
      }
      if (typeof App !== 'undefined' && App.syncSettingsToFirebase) {
        App.syncSettingsToFirebase();
      }
    }
  }

  function updateUIElements() {
    const lang = getCurrent();
    const langCode = getLangCode();

    // 1. Update settings CEFR goal labels
    const cefrLabel = document.querySelector('label[for="settings-page-cefr-goal"]');
    if (cefrLabel) {
      cefrLabel.textContent = `Target ${lang.name} Level (CEFR)`;
    }

    const currentLevelLabel = document.querySelector('label[for="settings-page-current-level"]');
    if (currentLevelLabel) {
      currentLevelLabel.textContent = `Self-Assessed ${lang.name} Level`;
    }

    // 2. Update Swap Button
    const swapLabel = document.getElementById('swap-btn-label');
    if (swapLabel) {
      const isEnToLang = !localStorage.getItem('dd_swap_direction');
      swapLabel.textContent = isEnToLang ? `English ⇄ ${lang.name}` : `${lang.name} ⇄ English`;
    }

    // 3. Update subtitle on translate page
    const subtitle = document.getElementById('translator-subtitle');
    if (subtitle) {
      subtitle.textContent = `Type English, get ${lang.name}. Save words you use daily`;
    }

    // 4. Update result panel labels
    const resultLabel = document.getElementById('result-lang-label');
    if (resultLabel) {
      resultLabel.textContent = `${lang.name} Translation`;
    }
    const pronLabel = document.getElementById('pron-lang-label');
    if (pronLabel) {
      pronLabel.textContent = `${lang.name} Pronunciation`;
    }
    const auditorLabel = document.getElementById('auditor-lang-label');
    if (auditorLabel) {
      auditorLabel.textContent = `${lang.name} Sentence Auditor`;
    }

    // 5. Update settings dropdown if initialized
    const pgLang = document.getElementById('settings-page-learning-lang');
    if (pgLang) pgLang.value = langCode;

    // 6. Update Conjugator search input
    const conjugatorTitle = document.querySelector('#view-translate p.section-subtitle');
    if (conjugatorTitle && conjugatorTitle.textContent.includes('verb')) {
      conjugatorTitle.textContent = `Type any ${lang.name} verb to instantly see all its conjugated forms across tenses`;
    }
    const conjugatorInput = document.getElementById('conjugator-search-input');
    if (conjugatorInput) {
      conjugatorInput.placeholder = `Enter ${lang.name} verb (e.g., helper verb, dictionary form)...`;
    }

    // 7. Update active view text labels
    const activeView = localStorage.getItem('dd_current_view');
    if (activeView === 'translate' && typeof App !== 'undefined' && App.clearResult) {
      App.clearResult();
    }

    // 8. Update exercise picker descriptions
    const mcDesc = document.getElementById('ex-mode-mc-desc');
    if (mcDesc) {
      mcDesc.textContent = `Pick the correct ${lang.name} word from 4 options. Includes component words from your saved phrases.`;
    }
    const fitbDesc = document.getElementById('ex-mode-fitb-desc');
    if (fitbDesc) {
      fitbDesc.textContent = `Complete new ${lang.name} sentences using your vocabulary. Never the same phrase twice.`;
    }
    const auditorDesc = document.getElementById('ex-mode-auditor-desc');
    if (auditorDesc) {
      auditorDesc.textContent = `Write a ${lang.name} sentence and get live correction feedback, grammar scans, and detailed explanations.`;
    }

    // 9. Update Sentence Auditor instructions & input placeholder
    const auditorInstructions = document.getElementById('auditor-instructions');
    if (auditorInstructions) {
      auditorInstructions.textContent = `Type any ${lang.name} sentence below. The AI will scan it for grammar, spelling, verb placement, case endings, and present a structured explanation.`;
    }
    const auditorInput = document.getElementById('auditor-input');
    if (auditorInput) {
      const placeholders = {
        de: 'e.g., Ich gehen gestern nach Hause (I went home yesterday)',
        es: 'e.g., Yo tener hambre (I am hungry)',
        fr: 'e.g., Je va à la plage (I am going to the beach)',
        it: 'e.g., Io avere caldo (I am hot)',
        tr: 'e.g., Ben gitmek eve (I am going home)',
        zh: 'e.g., 我是喜欢你 (I am like you)',
        ar: 'e.g., أنا يذهب إلى المدرسة (I goes to school)'
      };
      auditorInput.placeholder = placeholders[langCode] || `e.g., Write a sentence in ${lang.name}...`;
    }

    // 10. Update leaderboard subtitle
    const leaderboardSubtitle = document.getElementById('leaderboard-subtitle');
    if (leaderboardSubtitle) {
      leaderboardSubtitle.textContent = `Compete with active ${lang.name} learners this week!`;
    }

    // 11. Update AI story description
    const storyDesc = document.getElementById('ai-story-description');
    if (storyDesc) {
      storyDesc.textContent = `Generate a custom ${lang.name} story utilizing words you've learned. Requires a Gemini API Key.`;
    }

    // 12. Refresh insights level progress if loaded
    if (typeof Insights !== 'undefined' && typeof WordBank !== 'undefined') {
      const stats = WordBank.getStats();
      Insights.renderLevelProgress(stats);
    }
  }

  return {
    getLanguages,
    getCurrent,
    getLangCode,
    setLanguage,
    updateUIElements
  };

})();
