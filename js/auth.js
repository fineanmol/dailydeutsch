/**
 * auth.js — Firebase Authentication
 * Handles: Google login, Anonymous/guest login, sign-out, guest→Google upgrade
 */

const Auth = (() => {

  let _user = null;
  const _callbacks = [];

  // ── Init ─────────────────────────────────────────────────────
  // Sets up onAuthStateChanged. Returns a Promise that resolves
  // with the initial user (or null) on first auth state resolution.
  function init() {
    return new Promise(resolve => {
      let resolved = false;
      firebase.auth().onAuthStateChanged(user => {
        _user = user;
        _callbacks.forEach(cb => cb(user));
        if (!resolved) { resolved = true; resolve(user); }
      });
    });
  }

  // ── Sign-in methods ───────────────────────────────────────────
  function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return firebase.auth().signInWithPopup(provider);
  }

  function signInAsGuest() {
    return firebase.auth().signInAnonymously();
  }

  function signOut() {
    return firebase.auth().signOut();
  }

  // ── Guest → Google upgrade ────────────────────────────────────
  // Links the anonymous account to a Google credential.
  // If Google account already exists, falls back to normal sign-in.
  async function upgradeGuestToGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await firebase.auth().currentUser.linkWithPopup(provider);
      return result;
    } catch (e) {
      if (e.code === 'auth/credential-already-in-use') {
        const cred = firebase.auth.GoogleAuthProvider.credentialFromError(e);
        return firebase.auth().signInWithCredential(cred);
      }
      throw e;
    }
  }

  // ── Auth state change listener ────────────────────────────────
  function onAuthChange(cb) {
    _callbacks.push(cb);
  }

  // ── Accessors ─────────────────────────────────────────────────
  function getUser()        { return _user; }
  function getUid()         { return _user ? _user.uid : null; }
  function isGuest()        { return !!((_user && _user.isAnonymous)); }
  function isLoggedIn()     { return !!_user; }
  function getDisplayName() { return (_user && _user.displayName) ? _user.displayName : (isGuest() ? 'Guest' : 'User'); }
  function getPhotoURL()    { return (_user && _user.photoURL) ? _user.photoURL : null; }
  function getEmail()       { return (_user && _user.email) ? _user.email : null; }

  // Returns a fresh Firebase ID token for the current user, or null.
  // Used to authenticate calls to the server AI proxy.
  function getIdToken() {
    if (!_user) return Promise.resolve(null);
    return _user.getIdToken().catch(() => null);
  }

  return {
    init,
    signInWithGoogle,
    signInAsGuest,
    signOut,
    upgradeGuestToGoogle,
    onAuthChange,
    getUser, getUid, isGuest, isLoggedIn,
    getDisplayName, getPhotoURL, getEmail, getIdToken,
  };

})();
