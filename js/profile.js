/**
 * profile.js — Standalone User Profile & Customization Module
 *
 * Implements a highly modular design to manage user profile customizations
 * (native language, current self-assessed level, learning purpose, and focus area)
 * and triggers profile synchronization to Firestore.
 */

const UserProfile = (() => {

  // Default values
  const DEFAULTS = {
    nativeLang: 'en',
    currentLevel: 'A1',
    learningReason: 'hobby',
    learningFocus: 'vocab'
  };

  /**
   * Loads profile data from localStorage.
   */
  function load() {
    return {
      nativeLang: localStorage.getItem('dd_native_lang') || DEFAULTS.nativeLang,
      currentLevel: localStorage.getItem('dd_current_level') || DEFAULTS.currentLevel,
      learningReason: localStorage.getItem('dd_learning_reason') || DEFAULTS.learningReason,
      learningFocus: localStorage.getItem('dd_learning_focus') || DEFAULTS.learningFocus
    };
  }

  /**
   * Initializes profile form fields inside the settings page.
   */
  function initForm() {
    const data = load();
    const pgNative = document.getElementById('settings-page-native-lang');
    if (pgNative) pgNative.value = data.nativeLang;
  }

  /**
   * Saves profile fields from the UI inputs and triggers Firestore sync.
   * Note: Merged into App.saveGoalsSettings but kept for compatibility.
   */
  function saveFromForm() {
    const nativeLang = document.getElementById('settings-page-native-lang')?.value || DEFAULTS.nativeLang;
    const currentLevel = localStorage.getItem('dd_current_level') || DEFAULTS.currentLevel;

    localStorage.setItem('dd_native_lang', nativeLang);
    localStorage.setItem('dd_current_level', currentLevel);
    localStorage.setItem('dd_learning_reason', DEFAULTS.learningReason);
    localStorage.setItem('dd_learning_focus', DEFAULTS.learningFocus);

    if (typeof UI !== 'undefined' && UI.showToast) {
      UI.showToast('Profile customizations saved!', 'success');
    } else if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Profile customizations saved!', 'success');
    }

    // Trigger profile sync if Auth is ready
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

  return {
    load,
    initForm,
    saveFromForm
  };

})();
