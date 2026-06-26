/**
 * leaderboard.js — Standalone User Profile Sync & Live Leaderboard Module
 *
 * Implements a highly modular design to decouple leaderboard synchronization
 * and real-time subscription queries from insights.js and app.js.
 */

const Leaderboard = (() => {

  let _unsubLeaderboard = null;

  /**
   * Synchronizes the logged-in user's public details to the profiles collection.
   * @param {string} uid - Firebase user ID
   * @param {object} stats - User stats (xp, streak)
   */
  function syncProfile(uid, stats) {
    if (!uid || typeof firebase === 'undefined') return;
    
    // Check if the current user is anonymous/guest
    const currentUser = firebase.auth().currentUser;
    const isGuest = currentUser ? currentUser.isAnonymous : true;
    
    let guestName = 'Guest User';
    if (isGuest) {
      guestName = localStorage.getItem('dd_guest_name');
      if (!guestName) {
        const adjectives = ['Active', 'Bright', 'Clever', 'Eager', 'Quick', 'Smart', 'Happy', 'Alpine', 'Noble', 'Wandering'];
        const nouns = ['Learner', 'Speaker', 'Ninja', 'Scholar', 'Explorer', 'Pioneer', 'Profi', 'Master', 'Champion', 'Owl'];
        const randomNum = Math.floor(Math.random() * 900) + 100;
        const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const randNoun = nouns[Math.floor(Math.random() * nouns.length)];
        guestName = `${randAdj}${randNoun}_${randomNum}`;
        localStorage.setItem('dd_guest_name', guestName);
      }
    }
    
    const displayName = isGuest ? guestName : (currentUser?.displayName || 'User');
    const photoURL = isGuest ? '' : (currentUser?.photoURL || '');
    
    const xp = stats?.xp || 0;
    const level = Math.floor(Math.sqrt(xp / 100)) + 1;
    const streak = stats?.streak || 0;
    const cefrGoal = localStorage.getItem('dd_cefr_goal') || 'B1';
    const dailyWordGoal = localStorage.getItem('dd_daily_word_goal') || '5';
    const nativeLang = localStorage.getItem('dd_native_lang') || 'en';
    const currentLevel = localStorage.getItem('dd_current_level') || 'A1';
    const learningReason = localStorage.getItem('dd_learning_reason') || 'hobby';
    const learningFocus = localStorage.getItem('dd_learning_focus') || 'vocab';
    
    const profile = {
      uid,
      name: displayName,
      avatar: photoURL,
      xp,
      level,
      streak,
      cefrGoal,
      dailyWordGoal,
      nativeLang,
      currentLevel,
      learningReason,
      learningFocus,
      isGuest,
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    };

    firebase.firestore()
      .doc(`profiles/${uid}`)
      .set(profile, { merge: true })
      .catch(e => console.error('[Leaderboard] syncProfile failed:', e.message));
  }

  /**
   * Subscribes to real-time updates of the top 10 players sorted by XP.
   * @param {function} onUpdateCallback - Triggered with the array of players on changes
   * @returns {function} - Unsubscribe function
   */
  function subscribe(onUpdateCallback) {
    if (typeof firebase === 'undefined') return () => {};
    if (_unsubLeaderboard) { _unsubLeaderboard(); _unsubLeaderboard = null; }

    const db = firebase.firestore();
    _unsubLeaderboard = db.collection('profiles')
      .orderBy('xp', 'desc')
      .limit(10)
      .onSnapshot(snap => {
        const players = snap.docs.map(doc => doc.data());
        onUpdateCallback(players);
      }, err => {
        console.error('[Leaderboard] subscribe failed:', err);
      });

    return _unsubLeaderboard;
  }

  /**
   * Disconnects the active Firestore subscription query.
   */
  function unsubscribe() {
    if (_unsubLeaderboard) {
      _unsubLeaderboard();
      _unsubLeaderboard = null;
    }
  }

  return { syncProfile, subscribe, unsubscribe };

})();
