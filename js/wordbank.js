/**
 * wordbank.js — Word Bank logic
 * All storage is delegated to DB (Firestore via db.js).
 * API is synchronous from the caller's perspective;
 * writes are fire-and-forget to Firestore.
 */

const WordBank = (() => {

  // Called by app.js when auth state resolves
  function init(uid, onWordsChange) {
    return DB.init(uid, onWordsChange);
  }

  // ── Word CRUD ─────────────────────────────────────────────────
  function addOrUpdateWord({ english, german, category, partOfSpeech }) {
    const words = DB.getWords();
    const today = new Date().toISOString().split('T')[0];
    const existing = words.find(w => w.english.toLowerCase() === english.toLowerCase());

    if (existing) {
      const updated = {
        ...existing,
        frequency: existing.frequency + 1,
        lastUsed: today,
        german, category, partOfSpeech,
      };
      DB.saveWord(updated);
      if (typeof Analytics !== 'undefined') {
        Analytics.logEvent('word_saved', {
          english,
          german,
          category,
          part_of_speech: partOfSpeech,
          is_new: false
        });
      }
      return { word: updated, isNew: false };
    } else {
      const word = {
        id: Date.now().toString(),
        english, german, category, partOfSpeech,
        frequency: 1,
        savedAt: today,
        lastUsed: today,
        correctAnswers: 0,
        attempts: 0,
        srsRepetitions: 0,
        srsInterval: 0,
        srsEaseFactor: 2.5,
        srsNextReview: today,
      };
      DB.saveWord(word);

      const stats = DB.getStats();
      stats.totalSaved = (stats.totalSaved || 0) + 1;
      DB.saveStats(stats);

      if (typeof Analytics !== 'undefined') {
        Analytics.logEvent('word_saved', {
          english,
          german,
          category,
          part_of_speech: partOfSpeech,
          is_new: true
        });
      }

      awardXP(20);

      return { word, isNew: true };
    }
  }

  function deleteWord(id) {
    const word = DB.getWords().find(w => w.id === id);
    DB.deleteWord(id);
    if (typeof Analytics !== 'undefined') {
      Analytics.logEvent('word_deleted', {
        english: word ? word.english : '',
        german: word ? word.german : '',
        category: word ? word.category : ''
      });
    }
  }
  function getAllWords()     { return DB.getWords(); }
  function getWordCount()   { return DB.getWords().length; }

  function getRootWordId(id) {
    if (!id) return '';
    if (id.startsWith('ctx_')) return id.replace('ctx_', '');
    if (id.startsWith('comp_')) {
      const parts = id.split('_');
      return parts[1] || '';
    }
    return id;
  }

  function recordExerciseResult(wordId, isCorrect) {
    const rootId = getRootWordId(wordId);
    const word = DB.getWords().find(w => w.id === rootId);
    if (!word) return;

    const attempts = (word.attempts || 0) + 1;
    const correctAnswers = (word.correctAnswers || 0) + (isCorrect ? 1 : 0);

    // Spaced Repetition (SM-2 simplified algorithm)
    let repetitions = word.srsRepetitions || 0;
    let interval = word.srsInterval || 0;
    let easeFactor = word.srsEaseFactor || 2.5;

    if (isCorrect) {
      if (repetitions === 0) {
        interval = 1; // 1 day
      } else if (repetitions === 1) {
        interval = 4; // 4 days
      } else {
        interval = Math.ceil(interval * easeFactor);
      }
      repetitions++;
      easeFactor = Math.min(3.0, easeFactor + 0.15);
      awardXP(15);
    } else {
      repetitions = 0;
      interval = 1; // reset to 1 day
      easeFactor = Math.max(1.3, easeFactor - 0.2);
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);
    const nextReviewStr = nextDate.toISOString().split('T')[0];

    DB.saveWord({
      ...word,
      attempts,
      correctAnswers,
      srsRepetitions: repetitions,
      srsInterval: interval,
      srsEaseFactor: easeFactor,
      srsNextReview: nextReviewStr,
      lastReviewed: new Date().toISOString().split('T')[0]
    });
  }

  // ── History ───────────────────────────────────────────────────
  function addToHistory({ english, german, category }) {
    DB.addHistory({ english, german, category, at: Date.now() });

    if (typeof Analytics !== 'undefined') {
      Analytics.logEvent('word_translated', {
        english,
        german,
        category,
        provider: typeof Translator !== 'undefined' ? Translator.getActiveProviderName() : 'auto'
      });
    }

    // Update stats
    const stats  = DB.getStats();
    const today  = new Date().toISOString().split('T')[0];
    stats.totalTranslations = (stats.totalTranslations || 0) + 1;
    if (!stats.datesUsed) stats.datesUsed = [];
    if (!stats.datesUsed.includes(today)) stats.datesUsed.push(today);

    let streakIncreased = false;
    if (stats.lastUsedDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      stats.streak = (stats.lastUsedDate === yStr) ? (stats.streak || 0) + 1 : 1;
      stats.lastUsedDate = today;
      streakIncreased = true;
    }
    DB.saveStats(stats);

    // Award translation XP
    awardXP(10);

    // Streak bonus XP
    if (streakIncreased) {
      awardXP(50);
      const newStreak = DB.getStats().streak || 1;
      if (typeof Analytics !== 'undefined') {
        Analytics.logEvent('streak_milestone', { streak_days: newStreak });
      }
      // Show streak celebration modal (only when streak is > 1 day, i.e., actually a multi-day streak)
      if (typeof App !== 'undefined' && App.showStreakCelebration) {
        // Slight delay so the save completes and the UI is ready
        setTimeout(() => App.showStreakCelebration(newStreak), 800);
      }
    }
  }

  function getHistory() { return DB.getHistory(); }

  // ── Gamification ──────────────────────────────────────────────
  function awardXP(amount) {
    const stats = DB.getStats();
    const oldXp = stats.xp || 0;
    const newXp = oldXp + amount;
    stats.xp = newXp;

    const oldLevel = Math.floor(Math.sqrt(oldXp / 100)) + 1;
    const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;

    DB.saveStats(stats);

    if (newLevel > oldLevel) {
      if (typeof Analytics !== 'undefined') {
        Analytics.logEvent('level_up', { level: newLevel });
      }
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast(`🎉 Level Up! You reached Level ${newLevel}!`, 'success');
      }
    }

    checkBadges();
  }

  function checkBadges() {
    const stats = DB.getStats();
    if (!stats.badges) stats.badges = {};

    const wordsCount = DB.getWords().length;
    const streak = stats.streak || 0;
    const xp = stats.xp || 0;
    const level = Math.floor(Math.sqrt(xp / 100)) + 1;

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentHour = now.getHours();

    let badgeUnlocked = false;
    const unlockBadge = (badgeId, badgeName) => {
      if (!stats.badges[badgeId]) {
        stats.badges[badgeId] = todayStr;
        badgeUnlocked = true;
        if (typeof Analytics !== 'undefined') {
          Analytics.logEvent('badge_unlocked', { badge_id: badgeId, badge_name: badgeName });
        }
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast(`🏆 Badge Unlocked: ${badgeName}!`, 'success');
        }
      }
    };

    if (wordsCount >= 1) unlockBadge('first_word', 'Erster Schritt');
    if (wordsCount >= 25) unlockBadge('vocab_master', 'Wortschatz-Meister');
    if (wordsCount >= 100) unlockBadge('german_king', 'Deutsch-König');
    if (streak >= 3) unlockBadge('streak_3', 'Drei-Tage-Streak');
    if (streak >= 7) unlockBadge('streak_7', 'Sieben-Tage-Streak');
    if (level >= 5) unlockBadge('level_5', 'Aufschnitt');

    if (currentHour >= 5 && currentHour < 10) {
      unlockBadge('early_bird', 'Frühaufsteher');
    }
    if (currentHour >= 22 || currentHour < 4) {
      unlockBadge('night_owl', 'Nachteule');
    }

    if (badgeUnlocked) {
      DB.saveStats(stats);
    }
  }

  function unlockExerciseBadges(score, total) {
    const stats = DB.getStats();
    if (!stats.badges) stats.badges = {};

    let badgeUnlocked = false;
    const unlockBadge = (badgeId, badgeName) => {
      if (!stats.badges[badgeId]) {
        stats.badges[badgeId] = new Date().toISOString().split('T')[0];
        badgeUnlocked = true;
        if (typeof Analytics !== 'undefined') {
          Analytics.logEvent('badge_unlocked', { badge_id: badgeId, badge_name: badgeName });
        }
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast(`🏆 Badge Unlocked: ${badgeName}!`, 'success');
        }
      }
    };

    unlockBadge('practice_starter', 'Übungs-Starter');

    if (total >= 4 && score === total) {
      unlockBadge('perfectionist', 'Perfektionist');
    }

    if (badgeUnlocked) {
      DB.saveStats(stats);
    }
  }

  // ── Stats & Insights ──────────────────────────────────────────
  function getStats() {
    const stats = DB.getStats();
    const words = DB.getWords();
    const xp = stats.xp || 0;
    const level = Math.floor(Math.sqrt(xp / 100)) + 1;
    return {
      ...stats,
      level,
      totalWords:  words.length,
      categories:  _getCategoryBreakdown(words),
      topWords:    _getTopWords(words),
    };
  }

  function _getCategoryBreakdown(words) {
    const counts = {};
    words.forEach(w => { counts[w.category] = (counts[w.category] || 0) + w.frequency; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }

  function _getTopWords(words) {
    return [...words].sort((a, b) => b.frequency - a.frequency).slice(0, 10);
  }

  return {
    init,
    addOrUpdateWord, deleteWord, getAllWords, getWordCount,
    recordExerciseResult,
    addToHistory, getHistory,
    getStats,
    awardXP,
    checkBadges,
    unlockExerciseBadges,
  };

})();
