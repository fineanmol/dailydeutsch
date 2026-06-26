/**
 * features/auth-ui.js — Auth UI: profile chrome, login/guest/upgrade actions,
 * user menu, login screen helpers, and the streak-celebration modal.
 *
 * Carved out of the former app.js monolith (audit P4). This is the *UI* layer
 * for auth — the auth *state orchestration* (handleAuthChange: storage init,
 * settings sync, view re-render, first-boot init) stays in app.js, which is
 * the legitimate bootstrap hub. AuthUI just paints the navbar/dropdown/login
 * screen and runs the sign-in/out/upgrade actions.
 *
 * Auth primitives stay in js/auth.js (Auth.*). signOut resets App's
 * first-boot flag via ctx.resetAppInitialized().
 *
 * Wiring: App calls AuthUI.init(ctx) once. showApp / showLoginScreen /
 * updateUserProfile are also invoked by App.handleAuthChange via the facade
 * delegates.
 *
 * Depends on: auth.js, ui.js (via ctx.showToast), analytics.js (optional).
 */
const AuthUI = (() => {

  // ── Injected shared context (set in init) ─────────────────────
  let showToast, resetAppInitialized;

  function init(ctx) {
    showToast = ctx.showToast;
    resetAppInitialized = ctx.resetAppInitialized;
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
      if (typeof Analytics !== 'undefined') {
        Analytics.logEvent('login', { method: 'google' });
      }
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
      if (typeof Analytics !== 'undefined') {
        Analytics.logEvent('login', { method: 'guest' });
      }
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
      if (typeof Analytics !== 'undefined') {
        Analytics.logEvent('logout');
      }
      if (resetAppInitialized) resetAppInitialized();
      showToast('Signed out successfully', 'success');
    } catch (e) {
      showToast('Sign-out failed', 'error');
    }
  }

  async function upgradeToGoogle() {
    document.getElementById('user-dropdown').classList.add('hidden');
    try {
      await Auth.upgradeGuestToGoogle();
    } catch (e) {
      console.error('[Auth] Upgrade failed:', e);
      if (e.code !== 'auth/popup-closed-by-user') {
        showToast('Could not link account: ' + (e.message || e.code), 'error');
      }
    }
  }

  let _userMenuOutsideHandler = null;
  function toggleUserMenu() {
    const dd = document.getElementById('user-dropdown');
    const avatar = document.getElementById('nav-avatar');
    if (!dd) return;
    const open = dd.classList.toggle('hidden') === false;
    if (avatar) avatar.setAttribute('aria-expanded', String(open));

    // Close on outside click or Escape while open.
    if (open) {
      _userMenuOutsideHandler = (e) => {
        if (e.type === 'keydown' && e.key !== 'Escape') return;
        if (e.type === 'click' && (dd.contains(e.target) || (avatar && avatar.contains(e.target)))) return;
        closeUserMenu();
      };
      setTimeout(() => {
        document.addEventListener('click', _userMenuOutsideHandler, true);
        document.addEventListener('keydown', _userMenuOutsideHandler, true);
      }, 0);
    } else {
      closeUserMenu();
    }
  }

  function closeUserMenu() {
    const dd = document.getElementById('user-dropdown');
    const avatar = document.getElementById('nav-avatar');
    if (dd) dd.classList.add('hidden');
    if (avatar) {
      avatar.setAttribute('aria-expanded', 'false');
      if (document.activeElement && dd && dd.contains(document.activeElement)) avatar.focus();
    }
    if (_userMenuOutsideHandler) {
      document.removeEventListener('click', _userMenuOutsideHandler, true);
      document.removeEventListener('keydown', _userMenuOutsideHandler, true);
      _userMenuOutsideHandler = null;
    }
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

  // ── Streak Celebration Modal ──────────────────────────────────
  function showStreakCelebration(streak) {
    const modal = document.getElementById('streak-modal');
    if (!modal) return;

    // Update content
    const numEl  = document.getElementById('streak-modal-number');
    const subEl  = document.getElementById('streak-modal-sub');
    if (numEl) numEl.textContent = streak;
    if (subEl) {
      const msgs = [
        `Great start! Come back tomorrow to keep your streak going.`,
        `Two days in a row! You're building a real habit. 💪`,
        `${streak} days straight! Your German is improving fast. 🔥`,
        `${streak}-day streak! You're on fire! Don't break it. ⚡`,
        `Unreal! ${streak} days of German practice. Absolute legend. 👑`,
      ];
      const msgIndex = Math.min(streak - 1, msgs.length - 1);
      subEl.textContent = msgs[msgIndex < 0 ? 0 : msgIndex];
    }

    // Spawn confetti dots
    const card = document.getElementById('streak-modal-card');
    if (card) {
      const colors = ['#ff9a3c','#ff5e00','#ffdb00','#5cc3e8','#79ceb8','#ae63e4'];
      for (let i = 0; i < 12; i++) {
        const dot = document.createElement('div');
        dot.className = 'streak-confetti-dot';
        const angle = (i / 12) * 360;
        const dist = 80 + Math.random() * 80;
        dot.style.setProperty('--cx', `${Math.cos(angle * Math.PI / 180) * dist}px`);
        dot.style.setProperty('--cy', `${Math.sin(angle * Math.PI / 180) * dist}px`);
        dot.style.background = colors[i % colors.length];
        dot.style.left = '50%';
        dot.style.top = '30%';
        dot.style.animationDelay = `${Math.random() * 0.3}s`;
        card.appendChild(dot);
        setTimeout(() => dot.remove(), 1500);
      }
    }

    modal.classList.remove('hidden');
    // Auto-close after 6s
    setTimeout(() => closeStreakModal(), 6000);
  }

  function closeStreakModal() {
    const modal = document.getElementById('streak-modal');
    if (modal) modal.classList.add('hidden');
  }

  return {
    init,
    showLoginScreen, showApp, updateUserProfile,
    loginWithGoogle, loginAsGuest, signOut, upgradeToGoogle,
    toggleUserMenu, closeUserMenu,
    showStreakCelebration, closeStreakModal,
  };
})();
