/**
 * insights.js — Stats rendering & chart generation
 * Pure-CSS charts (no external chart library needed)
 */

const Insights = (() => {

  // Category colours come from the single source of truth in js/categories.js
  // (Categories.getCategoryInfo) instead of a duplicated map here.
  function categoryColor(id) {
    if (typeof Categories !== 'undefined' && Categories.getCategoryInfo) {
      return Categories.getCategoryInfo(id).color || '#6c757d';
    }
    return '#6c757d';
  }

  const BADGES_CONFIG = [
    { id: 'first_word', name: 'Erster Schritt', desc: 'Saved your first word', emoji: '🌱' },
    { id: 'vocab_master', name: 'Wortschatz-Meister', desc: 'Saved 25 words in word bank', emoji: '📚' },
    { id: 'german_king', name: 'Deutsch-König', desc: 'Saved 100 words in word bank', emoji: '👑' },
    { id: 'practice_starter', name: 'Übungs-Starter', desc: 'Completed your first practice session', emoji: '🎯' },
    { id: 'perfectionist', name: 'Perfektionist', desc: 'Got 100% correct in a practice session (min 4 words)', emoji: '💯' },
    { id: 'streak_3', name: 'Drei-Tage-Streak', desc: 'Maintained a 3-day active streak', emoji: '🔥' },
    { id: 'streak_7', name: 'Sieben-Tage-Streak', desc: 'Maintained a 7-day active streak', emoji: '⚡' },
    { id: 'level_5', name: 'Aufschnitt', desc: 'Reached Learner Level 5', emoji: '🚀' },
    { id: 'early_bird', name: 'Frühaufsteher', desc: 'Translated/practised between 5 AM and 9 AM', emoji: '🌅' },
    { id: 'night_owl', name: 'Nachteule', desc: 'Translated/practised between 10 PM and 4 AM', emoji: '🦉' }
  ];

  let _leaderboardUnsub = null;

  function renderLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;

    container.innerHTML = '<div class="lb-loading">Loading leaderboard...</div>';

    if (_leaderboardUnsub) {
      _leaderboardUnsub();
      _leaderboardUnsub = null;
    }

    if (typeof Leaderboard === 'undefined') {
      container.innerHTML = '<div class="lb-loading">Leaderboard module missing</div>';
      return;
    }

    const currentUid = (typeof Auth !== 'undefined') ? Auth.getUid() : null;

    if (currentUid && typeof WordBank !== 'undefined') {
      Leaderboard.syncProfile(currentUid, WordBank.getStats());
    }

    _leaderboardUnsub = Leaderboard.subscribe(players => {
      if (players.length === 0) {
        container.innerHTML = '<div class="lb-loading">No players yet. Start practicing! 🚀</div>';
        return;
      }

      try {
        function buildAvatar(p, cls) {
          const n = p.name || 'Learner';
          const isUrl = typeof p.avatar === 'string' && (p.avatar.startsWith('http') || p.avatar.includes('googleusercontent') || p.avatar.includes('data:image'));
          if (isUrl) {
            return `<img src="${p.avatar}" alt="${escHtml(n)}" class="lb-avatar-img ${cls}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="lb-avatar-letter ${cls}" style="display:none;">${escHtml(n[0].toUpperCase())}</span>`;
          }
          return `<span class="lb-avatar-letter ${cls}">${escHtml(n[0].toUpperCase())}</span>`;
        }

        const medals = ['🥇','🥈','🥉'];
        const rankLabels = ['1st','2nd','3rd'];
        const medalColors = ['#FFD700','#C0C0C0','#CD7F32'];
        const podium = players.slice(0, 3);
        const rest = players.slice(3);

        // Podium visual order: 2nd | 1st | 3rd
        const podiumOrder = [1, 0, 2].filter(i => podium[i]);

        let html = '';

        if (podium.length > 0) {
          html += '<div class="lb-podium">';
          podiumOrder.forEach(i => {
            const p = podium[i];
            const pName = p.name || 'Learner';
            const firstName = pName.split(' ')[0];
            const isUser = p.uid === currentUid;
            const isFirst = i === 0;
            html += `
              <div class="lb-podium-card${isFirst ? ' lb-podium-first' : ''}${isUser ? ' lb-podium-you' : ''}">
                <div class="lb-podium-top">
                  <div class="lb-podium-medal">${medals[i]}</div>
                  <div class="lb-podium-av-wrap${isFirst ? ' lb-first-ring' : ''}">
                    ${buildAvatar(p, 'lbav-lg')}
                  </div>
                </div>
                <div class="lb-podium-info">
                  <div class="lb-podium-name">${escHtml(firstName)}${isUser ? ' <span class="lb-you">You</span>' : ''}</div>
                  <div class="lb-podium-xp">▲ ${(p.xp||0).toLocaleString()} XP</div>
                </div>
                <div class="lb-podium-badge" style="--mc:${medalColors[i]}">${rankLabels[i]}</div>
              </div>`;
          });
          html += '</div>';
        }

        if (rest.length > 0) {
          html += '<div class="lb-ranked-list">';
          rest.forEach((p, i) => {
            const rank = i + 4;
            const pName = p.name || 'Learner';
            const isUser = p.uid === currentUid;
            html += `
              <div class="lb-row${isUser ? ' lb-row-you' : ''}" id="player-${rank-1}">
                <div class="lb-row-rank">${rank}</div>
                <div class="lb-row-av">${buildAvatar(p, 'lbav-sm')}</div>
                <div class="lb-row-info">
                  <span class="lb-row-name">${escHtml(pName)}${isUser ? ' <span class="lb-you">You</span>' : ''}</span>
                  <span class="lb-row-xp" id="score-val-${rank-1}">▲ ${(p.xp||0).toLocaleString()} XP</span>
                </div>
                <div class="lb-row-badge">${rank}th</div>
              </div>`;
          });
          html += '</div>';
        }

        container.innerHTML = html;
      } catch (err) {
        console.error('[Leaderboard] render failed:', err);
        container.innerHTML = `<div class="lb-loading" style="color:var(--accent-red)">⚠ Render error: ${err.message}</div>`;
      }
    }, err => {
      console.error('[Leaderboard] subscribe failed:', err);
      container.innerHTML = `<div class="lb-loading" style="color:var(--accent-red)">⚠ Database error: ${err.message}</div>`;
    });
  }


  function render(stats) {
    renderStatCards(stats);
    renderLevelProgress(stats);
    renderLeaderboard();

    renderCategoryBars(stats.categories);
    renderTopWords(stats.topWords);
    renderStreakCalendar(stats.datesUsed || []);
    renderBadges(stats.badges || {});
  }

  function cleanup() {
    if (_leaderboardUnsub) {
      _leaderboardUnsub();
      _leaderboardUnsub = null;
    }
  }

  function renderLevelProgress(stats) {
    const xp = stats.xp || 0;
    const level = stats.level || 1;

    const currentLevelStartXP = (level - 1) * level * 100;
    const nextLevelTargetXP = level * (level + 1) * 100;
    const levelTotalXPNeeded = nextLevelTargetXP - currentLevelStartXP;
    const levelCurrentXP = xp - currentLevelStartXP;

    const rawPct = (levelCurrentXP / levelTotalXPNeeded) * 100;
    const pct = Math.max(0, Math.min(100, Math.round(rawPct)));

    const badgeEl = document.getElementById('insights-level-badge');
    const displayEl = document.getElementById('nav-level-display');
    const titleEl = document.getElementById('insights-level-title');
    const detailEl = document.getElementById('insights-xp-detail');
    const percentEl = document.getElementById('insights-xp-percent');
    const fillEl = document.getElementById('insights-xp-fill');

    const langName = (typeof LanguageSupport !== 'undefined') ? LanguageSupport.getCurrent().name : 'German';
    const langFlag = (typeof LanguageSupport !== 'undefined') ? LanguageSupport.getCurrent().flag : '🇩🇪';
    const levelTitles = [
      `${langName} Starter ${langFlag}`,
      `${langName} Novice 🚶`,
      `${langName} Apprentice 📝`,
      `${langName} Communicator 🗣️`,
      `${langName} Advanced Profi 🧠`,
      `${langName} Fluent King 👑`
    ];
    const title = levelTitles[Math.min(level - 1, levelTitles.length - 1)];

    if (badgeEl) badgeEl.textContent = `Lvl ${level}`;
    if (displayEl) displayEl.textContent = `Lvl ${level}`;
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = `${xp} / ${nextLevelTargetXP} XP (${nextLevelTargetXP - xp} XP to level up)`;
    if (percentEl) percentEl.textContent = `${pct}%`;
    if (fillEl) fillEl.style.width = `${pct}%`;
  }

  function renderBadges(unlockedBadges) {
    const container = document.getElementById('badges-grid');
    if (!container) return;

    container.innerHTML = BADGES_CONFIG.map(b => {
      const isUnlocked = !!unlockedBadges[b.id];
      const unlockDate = unlockedBadges[b.id] ? unlockedBadges[b.id] : null;
      const dateStr = unlockDate ? new Date(unlockDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

      return `
        <div class="badge-item ${isUnlocked ? 'unlocked' : 'locked'}" title="${escHtml(b.desc)}">
          <div class="badge-emoji">${b.emoji}</div>
          <div class="badge-name">${escHtml(b.name)}</div>
          <div class="badge-desc">${escHtml(b.desc)}</div>
          ${isUnlocked
            ? `<div class="badge-date">Earned ${dateStr}</div>
               <button class="badge-share-btn" onclick="Insights.shareBadge('${escHtml(b.id)}', '${escHtml(b.name)}', '${b.emoji}')">
                 Share 🔗
               </button>`
            : `<div class="badge-date locked-label">Locked</div>`
          }
        </div>`;
    }).join('');

    if (window.Motion) {
      const { animate, stagger } = window.Motion;
      animate(
        container.querySelectorAll('.badge-item'),
        { opacity: [0, 1], scale: [0.85, 1], y: [15, 0] },
        { delay: stagger(0.02), duration: 0.4, easing: [0.16, 1, 0.3, 1] }
      );
    }
  }

  function renderStatCards(stats) {
    const els = {
      'stat-total-words': stats.totalWords || 0,
      'stat-translations': stats.totalTranslations || 0,
      'stat-streak': `${stats.streak || 0}d`,
      'stat-categories': (stats.categories || []).length,
    };

    for (const [id, val] of Object.entries(els)) {
      const el = document.getElementById(id);
      if (el) {
        animateCount(el, val);
      }
    }
  }

  function animateCount(el, target) {
    const isString = typeof target === 'string';
    const numericTarget = isString ? parseInt(target) : target;
    const suffix = isString ? target.replace(/\d/g, '') : '';
    const duration = 800;
    const start = Date.now();
    const from = parseInt(el.textContent) || 0;

    function step() {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (numericTarget - from) * eased);
      el.textContent = current + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function renderCategoryBars(categories) {
    const container = document.getElementById('category-bars');
    if (!container) return;

    if (!categories || categories.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 2rem;">
          <div class="empty-state-icon">📊</div>
          <p>Start translating words to see category insights</p>
        </div>`;
      return;
    }

    const maxCount = Math.max(...categories.map(c => c.count));

    container.innerHTML = categories.slice(0, 7).map(cat => {
      const info = Categories.getCategoryInfo(cat.id);
      const pct = Math.round((cat.count / maxCount) * 100);
      return `
        <div class="cat-bar-item">
          <div class="cat-bar-header">
            <span class="cat-bar-name">${info.emoji} ${info.label}</span>
            <span class="cat-bar-count">${cat.count} use${cat.count !== 1 ? 's' : ''}</span>
          </div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" style="width: 0%; background: ${categoryColor(cat.id)}"
                 data-target="${pct}"></div>
          </div>
        </div>`;
    }).join('');

    if (window.Motion) {
      const { animate, stagger } = window.Motion;
      animate(
        container.querySelectorAll('.cat-bar-fill'),
        { width: [0, (el) => el.dataset.target + '%'] },
        { delay: stagger(0.04), duration: 0.6, easing: [0.16, 1, 0.3, 1] }
      );
    } else {
      // Animate bars after render
      requestAnimationFrame(() => {
        container.querySelectorAll('.cat-bar-fill').forEach(bar => {
          const target = bar.dataset.target;
          setTimeout(() => { bar.style.width = target + '%'; }, 100);
        });
      });
    }
  }

  function renderTopWords(topWords) {
    const container = document.getElementById('top-words-list');
    if (!container) return;

    if (!topWords || topWords.length === 0) {
      container.innerHTML = `<p class="text-muted text-center" style="padding: 1rem;">Save words to see your top vocabulary</p>`;
      return;
    }

    const rankClasses = ['gold', 'silver', 'bronze'];

    container.innerHTML = topWords.slice(0, 8).map((w, i) => `
      <div class="top-word-item">
        <span class="top-word-rank ${rankClasses[i] || ''}">#${i + 1}</span>
        <div class="top-word-text">
          <div class="top-word-de">${escHtml(w.german)}</div>
          <div class="top-word-en">${escHtml(w.english)}</div>
        </div>
        <div class="top-word-freq">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
          </svg>
          ${w.frequency}×
        </div>
      </div>
    `).join('');

    if (window.Motion) {
      const { animate, stagger } = window.Motion;
      animate(
        container.querySelectorAll('.top-word-item'),
        { opacity: [0, 1], x: [-15, 0] },
        { delay: stagger(0.03), duration: 0.35, easing: [0.16, 1, 0.3, 1] }
      );
    }
  }

  function renderStreakCalendar(datesUsed) {
    const container = document.getElementById('streak-calendar');
    if (!container) return;

    // Show last 60 days
    const today = new Date();
    const days = [];
    for (let i = 59; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }

    const dateSet = new Set(datesUsed);
    const todayStr = today.toISOString().split('T')[0];

    container.innerHTML = days.map(d => {
      if (d === todayStr) return `<div class="streak-day today" title="${d}"></div>`;
      if (dateSet.has(d)) {
        // Simple intensity based on how recent
        const daysAgo = Math.floor((today - new Date(d)) / 86400000);
        const level = daysAgo < 7 ? 3 : daysAgo < 21 ? 2 : 1;
        return `<div class="streak-day active-${level}" title="${d}"></div>`;
      }
      return `<div class="streak-day" title="${d}"></div>`;
    }).join('');
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shareBadge(id, name, emoji) {
    if (typeof Analytics !== 'undefined') {
      Analytics.logEvent('badge_shared', { badge_id: id, badge_name: name });
    }
    const shareText = `I just earned the ${emoji} '${name}' badge on Daily Deutsch! 🇩🇪 Build your German vocabulary: https://dailydeutsch.web.app`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

    if (navigator.share) {
      navigator.share({
        title: 'Daily Deutsch Badge',
        text: shareText,
        url: 'https://dailydeutsch.web.app',
      }).catch(() => {});
    } else {
      window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=550,height=420');
    }
  }

  return { render, cleanup, renderLevelProgress, shareBadge };
})();
