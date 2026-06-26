/**
 * features/exercises.js — Practice exercise engine.
 *
 * Carved out of the former app.js monolith (audit P2). Owns every exercise
 * mode and its render + state machine: flashcards, multiple-choice,
 * fill-in-the-blank, word arrangement, and the timed match game, plus the
 * shared picker and feedback bar.
 *
 * Question generation stays in js/exercises.js (Exercises.*) and SRS / badge
 * accounting stays in js/wordbank.js (WordBank.*) — this module is the UI and
 * runtime state layer that drives them.
 *
 * Wiring: App calls ExerciseEngine.init(ctx) once, passing shared helpers it
 * can't reach directly (formatGermanWord, speakGerman, isAIEnabled,
 * explainMistake, the sentence-auditor entry points, handleCollabMatchClick,
 * showToast). Globals (Store, WordBank, Exercises, CEFR, Categories,
 * Analytics, UI, window.Motion) are used directly.
 *
 * Exercise-mode runtime fields (waAnswer, matchTiles, matchTimer, …) are
 * attached to Store.state exactly as before.
 *
 * Depends on: store.js, exercises.js, wordbank.js, cefr.js, categories.js, ui.js.
 */
const ExerciseEngine = (() => {

  const STARTER_WORDS = [
    { id: 'starter-1', german: 'der Hund', english: 'the dog', category: 'animals', partOfSpeech: 'noun', frequency: 1, lastUsed: new Date().toISOString() },
    { id: 'starter-2', german: 'die Katze', english: 'the cat', category: 'animals', partOfSpeech: 'noun', frequency: 1, lastUsed: new Date().toISOString() },
    { id: 'starter-3', german: 'der Apfel', english: 'the apple', category: 'food', partOfSpeech: 'noun', frequency: 1, lastUsed: new Date().toISOString() },
    { id: 'starter-4', german: 'das Brot', english: 'the bread', category: 'food', partOfSpeech: 'noun', frequency: 1, lastUsed: new Date().toISOString() },
    { id: 'starter-5', german: 'gehen', english: 'to go', category: 'general', partOfSpeech: 'verb', frequency: 1, lastUsed: new Date().toISOString() },
    { id: 'starter-6', german: 'schnell', english: 'fast', category: 'general', partOfSpeech: 'adjective', frequency: 1, lastUsed: new Date().toISOString() },
  ];

  // ── Injected shared context (set in init) ─────────────────────
  let state, escHtml, escAttr, showToast, formatGermanWord, speakGerman,
      isAIEnabled, explainMistake, startSentenceAuditor, stopSentenceAuditor,
      handleCollabMatchClick;

  function init(ctx) {
    state = ctx.state;
    escHtml = ctx.escHtml;
    escAttr = ctx.escAttr;
    showToast = ctx.showToast;
    formatGermanWord = ctx.formatGermanWord;
    speakGerman = ctx.speakGerman;
    isAIEnabled = ctx.isAIEnabled;
    explainMistake = ctx.explainMistake;
    startSentenceAuditor = ctx.startSentenceAuditor;
    stopSentenceAuditor = ctx.stopSentenceAuditor;
    handleCollabMatchClick = ctx.handleCollabMatchClick;
    setupExercises();
  }

  // ── Exercise Picker ──────────────────────────────────────────
  function renderExercisePicker() {
    const allWords = WordBank.getAllWords();
    const today = new Date().toISOString().split('T')[0];
    const dueWords = allWords.filter(w => !w.srsNextReview || w.srsNextReview <= today);
    const dueCount = dueWords.length;
    const totalCount = allWords.length;

    // Show / hide empty-state guidance
    const emptyState = document.getElementById('exercises-empty-state');
    const picker = document.getElementById('exercise-picker');
    if (emptyState && picker) {
      if (totalCount === 0) {
        emptyState.classList.remove('hidden');
        picker.style.opacity = '';
        picker.style.pointerEvents = '';
      } else {
        emptyState.classList.add('hidden');
        picker.style.opacity = '';
        picker.style.pointerEvents = '';
      }
    }

    const countText = totalCount === 0
      ? "6 starter words"
      : (dueCount >= 4 ? `${dueCount} due for review` : `${totalCount} total words`);

    ['ex-word-count','ex-mc-count','ex-fitb-count','ex-arrangement-count'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = countText;
    });
    const matchCountEl = document.getElementById('ex-match-count');
    if (matchCountEl) matchCountEl.textContent = totalCount === 0 ? 6 : Math.min(6, totalCount);
    const mcStart = document.getElementById('start-mc');
    if (mcStart) mcStart.disabled = totalCount > 0 && totalCount < 4;
    const arrangementStart = document.getElementById('start-arrangement');
    if (arrangementStart) arrangementStart.disabled = false;
    const matchStart = document.getElementById('start-match');
    if (matchStart) matchStart.disabled = totalCount > 0 && totalCount < 2;
  }

  function setupExercises() {
    // Card clicks
    document.getElementById('mode-flashcard')?.addEventListener('click', (e) => {
      if (e.target.closest('.btn')) return;
      startExercise('flashcard');
    });
    document.getElementById('start-flashcard')?.addEventListener('click', () => startExercise('flashcard'));

    document.getElementById('mode-mc')?.addEventListener('click', (e) => {
      if (e.target.closest('.btn')) return;
      const allWords = WordBank.getAllWords();
      if (allWords.length < 4 && allWords.length > 0) {
        showToast('Save at least 4 words to unlock Multiple Choice!', 'info');
        return;
      }
      startExercise('mc');
    });
    document.getElementById('start-mc')?.addEventListener('click', () => startExercise('mc'));

    document.getElementById('mode-fitb')?.addEventListener('click', (e) => {
      if (e.target.closest('.btn')) return;
      startExercise('fitb');
    });
    document.getElementById('start-fitb')?.addEventListener('click', () => startExercise('fitb'));

    document.getElementById('mode-auditor')?.addEventListener('click', (e) => {
      if (e.target.closest('.btn')) return;
      startSentenceAuditor();
    });
    document.getElementById('start-auditor')?.addEventListener('click', () => startSentenceAuditor());

    document.getElementById('mode-arrangement')?.addEventListener('click', (e) => {
      if (e.target.closest('.btn')) return;
      startWordArrangement();
    });
    document.getElementById('start-arrangement')?.addEventListener('click', () => startWordArrangement());

    document.getElementById('mode-match')?.addEventListener('click', (e) => {
      if (e.target.closest('.btn')) return;
      const allWords = WordBank.getAllWords();
      if (allWords.length < 2 && allWords.length > 0) {
        showToast('Save at least 2 words to play Match!', 'info');
        return;
      }
      startMatch();
    });
    document.getElementById('start-match')?.addEventListener('click', () => startMatch());

    document.getElementById('mode-collab')?.addEventListener('click', (e) => {
      if (e.target.closest('.btn')) return;
      handleCollabMatchClick();
    });
    document.getElementById('start-collab')?.addEventListener('click', () => handleCollabMatchClick());
  }

  // ── Feedback Bar ─────────────────────────────────────────────
  function showExerciseFeedback({ correct, title, detail, correctAnswer, onContinue, canExplain, explainArgs }) {
    const bar = document.getElementById('exercise-feedback-bar');
    if (!bar) return;

    bar.className = `exercise-feedback-bar fb-visible ${correct ? 'fb-correct' : 'fb-wrong'}`;
    document.getElementById('fb-emoji').textContent = correct ? '😊' : '😕';
    document.getElementById('fb-title').textContent = title || (correct ? 'You are correct!' : 'Not quite!');
    const detailEl = document.getElementById('fb-detail');
    if (detail) { detailEl.textContent = detail; detailEl.style.display = ''; }
    else { detailEl.style.display = 'none'; }

    const caEl = document.getElementById('fb-correct-answer');
    if (!correct && correctAnswer) {
      caEl.innerHTML = `Correct answer: <strong>${escHtml(correctAnswer)}</strong>`;
      caEl.classList.remove('hidden');
    } else {
      caEl.classList.add('hidden');
    }

    const explainBtn = document.getElementById('fb-explain-btn');
    explainBtn.style.display = (canExplain && !correct && isAIEnabled()) ? '' : 'none';
    if (explainBtn.style.display !== 'none' && explainArgs) {
      explainBtn.onclick = () => {
        explainMistake(...explainArgs);
      };
    }

    const continueBtn = document.getElementById('fb-continue-btn');
    continueBtn.onclick = () => {
      hideExerciseFeedback();
      if (onContinue) onContinue();
    };
  }

  function hideExerciseFeedback() {
    const bar = document.getElementById('exercise-feedback-bar');
    if (bar) bar.className = 'exercise-feedback-bar';
  }

  function startExercise(mode) {
    let allWords = WordBank.getAllWords();
    const isStarter = allWords.length === 0;
    if (isStarter) {
      allWords = STARTER_WORDS;
    }

    if (typeof Analytics !== 'undefined') {
      Analytics.logEvent('exercise_started', { exercise_type: mode, starter_vocabulary: isStarter });
    }

    const today = new Date().toISOString().split('T')[0];
    const dueWords = isStarter ? [] : allWords.filter(w => !w.srsNextReview || w.srsNextReview <= today);
    // Use due words if at least 4 are due, otherwise fall back to all words
    const words = dueWords.length >= 4 ? dueWords : allWords;

    state.exerciseMode = mode;
    state.exerciseIndex = 0;
    state.exerciseScore = 0;
    document.getElementById('exercise-picker').classList.add('hidden');
    document.getElementById('exercise-area').classList.remove('hidden');
    document.getElementById('exercise-result-area').classList.add('hidden');
    const emptyState = document.getElementById('exercises-empty-state');
    if (emptyState) emptyState.classList.add('hidden');
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

    if (typeof Analytics !== 'undefined') {
      Analytics.logEvent('exercise_completed', {
        exercise_type: state.exerciseMode,
        score: score,
        total: total,
        percentage: pct
      });
    }
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

    const q = state.exerciseQuestions[state.exerciseIndex];
    showExerciseFeedback({
      correct: isCorrect,
      title: isCorrect ? 'You are correct! 🎉' : 'Not quite!',
      detail: isCorrect ? correct : null,
      correctAnswer: !isCorrect ? correct : null,
      onContinue: () => { state.exerciseIndex++; renderMCQuestion(); },
      canExplain: true,
      explainArgs: [q.question, correct, selected],
    });
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

    const q = state.exerciseQuestions[state.exerciseIndex];
    showExerciseFeedback({
      correct: isCorrect,
      title: isCorrect ? 'You are correct! 🎉' : 'Not quite!',
      detail: isCorrect ? answer : null,
      correctAnswer: !isCorrect ? answer : null,
      onContinue: () => { state.exerciseIndex++; renderFITBQuestion(); },
      canExplain: true,
      explainArgs: [q.sentenceDe || q.english, answer, userAnswer],
    });
  }

  function stopExercise() {
    document.getElementById('exercise-picker').classList.remove('hidden');
    document.getElementById('exercise-area').classList.add('hidden');
    document.getElementById('word-arrangement-area')?.classList.add('hidden');
    document.getElementById('match-area')?.classList.add('hidden');
    document.getElementById('exercise-result-area').classList.add('hidden');
    hideExerciseFeedback();
    if (state.matchTimer) { clearInterval(state.matchTimer); state.matchTimer = null; }
    renderExercisePicker();
  }

  // ── Word Arrangement Exercise ─────────────────────────────────
  function startWordArrangement() {
    let allWords = WordBank.getAllWords();
    if (allWords.length === 0) {
      allWords = STARTER_WORDS;
    }
    state.exerciseMode = 'arrangement';
    state.exerciseIndex = 0;
    state.exerciseScore = 0;
    state.exerciseQuestions = Exercises.generateWordArrangement(allWords);
    if (!state.exerciseQuestions.length) { showToast('Not enough words for this exercise yet!', 'info'); return; }

    document.getElementById('exercise-picker').classList.add('hidden');
    document.getElementById('exercise-area').classList.add('hidden');
    document.getElementById('exercise-result-area').classList.add('hidden');
    document.getElementById('word-arrangement-area').classList.remove('hidden');
    const emptyState = document.getElementById('exercises-empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    renderWAQuestion();
  }

  function renderWAQuestion() {
    const questions = state.exerciseQuestions;
    const i = state.exerciseIndex;
    if (i >= questions.length) {
      document.getElementById('word-arrangement-area').classList.add('hidden');
      endExercise();
      return;
    }
    const q = questions[i];
    // state for this question
    state.waAnswer = [];   // indices from q.tiles currently placed in answer zone
    state.waQuestion = q;

    const area = document.getElementById('word-arrangement-area');
    area.innerHTML = `
      <div class="wa-container">
        <div class="wa-progress-row">
          <div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:${(i/questions.length)*100}%"></div></div>
          <span class="progress-label">${i+1} / ${questions.length}</span>
        </div>
        <div class="wa-header-label">Translate to English</div>
        <div class="wa-phrase-prompt">
          <button class="wa-phrase-speaker-btn" onclick="App.speakText('${escAttr(q.prompt)}', 'de-DE')" title="Listen">🔊</button>
          <div class="wa-phrase-text">${escHtml(q.prompt)}</div>
        </div>
        <div class="wa-answer-zone" id="wa-answer-zone"></div>
        <div class="wa-tile-pool" id="wa-tile-pool">
          ${q.tiles.map((tile, ti) =>
            `<button class="word-tile" id="wa-tile-${ti}" onclick="App.waAddTile(${ti})">${escHtml(tile)}</button>`
          ).join('')}
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-secondary" style="flex:1" onclick="App.waReset()">Clear</button>
          <button class="btn btn-primary" style="flex:2" onclick="App.waCheck()">Check it</button>
        </div>
        <div style="text-align:center">
          <button class="btn btn-ghost btn-sm" onclick="App.stopExercise()">Stop session</button>
        </div>
      </div>`;
  }

  function waAddTile(tileIndex) {
    const q = state.waQuestion;
    const tile = q.tiles[tileIndex];
    if (!tile) return;
    if (state.waAnswer.includes(tileIndex)) {
      // remove it (toggle)
      state.waAnswer = state.waAnswer.filter(i => i !== tileIndex);
    } else {
      state.waAnswer.push(tileIndex);
    }
    _renderWAZone();
  }

  function waReset() {
    state.waAnswer = [];
    _renderWAZone();
  }

  function _renderWAZone() {
    const q = state.waQuestion;
    const answerZone = document.getElementById('wa-answer-zone');
    const pool = document.getElementById('wa-tile-pool');
    if (!answerZone || !pool) return;

    // Update answer zone
    if (state.waAnswer.length === 0) {
      answerZone.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">Tap words below to build your answer</span>';
      answerZone.classList.remove('has-tiles');
    } else {
      answerZone.innerHTML = state.waAnswer.map(ti =>
        `<button class="word-tile tile-in-answer" onclick="App.waAddTile(${ti})">${escHtml(q.tiles[ti])}</button>`
      ).join('');
      answerZone.classList.add('has-tiles');
    }

    // Update pool tile states
    q.tiles.forEach((_, ti) => {
      const tileEl = document.getElementById(`wa-tile-${ti}`);
      if (tileEl) {
        if (state.waAnswer.includes(ti)) tileEl.classList.add('tile-used');
        else tileEl.classList.remove('tile-used');
      }
    });
  }

  function waCheck() {
    const q = state.waQuestion;
    if (state.waAnswer.length === 0) { showToast('Tap some words to build your answer!', 'info'); return; }
    const userAnswer = state.waAnswer.map(ti => q.tiles[ti]).join(' ').toLowerCase().trim();
    const correct = userAnswer === q.answer.toLowerCase().trim();
    WordBank.recordExerciseResult(q.id, correct);
    if (correct) state.exerciseScore++;

    showExerciseFeedback({
      correct,
      title: correct ? 'You are correct! 🎉' : 'You were close!',
      detail: correct ? q.answer : null,
      correctAnswer: !correct ? q.answer : null,
      onContinue: () => { state.exerciseIndex++; renderWAQuestion(); },
      canExplain: false,
    });
  }

  // ── Match Exercise ────────────────────────────────────────────
  function startMatch() {
    let allWords = WordBank.getAllWords();
    if (allWords.length === 0) {
      allWords = STARTER_WORDS;
    }
    if (allWords.length < 2) { showToast('Save at least 2 words first!', 'error'); return; }
    state.exerciseMode = 'match';
    state.matchPairs = Exercises.generateMatchPairs(allWords);
    state.matchSelected = null;  // {tileEl, pairId, side}
    state.matchMatched = new Set();
    state.matchSeconds = 0;
    if (state.matchTimer) clearInterval(state.matchTimer);

    document.getElementById('exercise-picker').classList.add('hidden');
    document.getElementById('exercise-area').classList.add('hidden');
    document.getElementById('exercise-result-area').classList.add('hidden');
    document.getElementById('match-area').classList.remove('hidden');
    const emptyState = document.getElementById('exercises-empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    renderMatch();

    state.matchTimer = setInterval(() => {
      state.matchSeconds++;
      const tEl = document.getElementById('match-timer-display');
      if (tEl) {
        const m = String(Math.floor(state.matchSeconds / 60)).padStart(2,'0');
        const s = String(state.matchSeconds % 60).padStart(2,'0');
        tEl.textContent = `${m}:${s}`;
      }
    }, 1000);
  }

  function renderMatch() {
    const pairs = state.matchPairs;
    // Build mixed tile list: each pair contributes a german tile and an english tile
    const tiles = [];
    pairs.forEach(p => {
      tiles.push({ pairId: p.id, text: p.german, side: 'de' });
      tiles.push({ pairId: p.id, text: p.english, side: 'en' });
    });
    // Shuffle
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    state.matchTiles = tiles;

    const area = document.getElementById('match-area');
    area.innerHTML = `
      <div class="match-container">
        <div class="match-header-row">
          <div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:0%" id="match-progress-fill"></div></div>
          <div class="match-timer" id="match-timer-display">00:00</div>
        </div>
        <p style="text-align:center;font-size:0.8rem;color:var(--text-muted);margin:0;">Match each German word to its English meaning</p>
        <div class="match-grid" id="match-grid">
          ${tiles.map((t, ti) =>
            `<button class="match-tile" id="match-tile-${ti}" onclick="App.matchSelectTile(${ti})">${escHtml(t.text)}</button>`
          ).join('')}
        </div>
        <div style="text-align:center">
          <button class="btn btn-ghost btn-sm" onclick="App.stopExercise()">Stop</button>
        </div>
      </div>`;
  }

  function matchSelectTile(tileIndex) {
    const tiles = state.matchTiles;
    const tile = tiles[tileIndex];
    if (!tile) return;
    const tileEl = document.getElementById(`match-tile-${tileIndex}`);
    if (!tileEl || tileEl.classList.contains('tile-matched')) return;

    if (!state.matchSelected) {
      // First selection
      state.matchSelected = { tileIndex, pairId: tile.pairId, side: tile.side, el: tileEl };
      tileEl.classList.add('tile-selected');
    } else {
      const first = state.matchSelected;
      if (first.tileIndex === tileIndex) {
        // Deselect
        tileEl.classList.remove('tile-selected');
        state.matchSelected = null;
        return;
      }
      if (first.pairId === tile.pairId && first.side !== tile.side) {
        // Correct match!
        first.el.classList.remove('tile-selected');
        first.el.classList.add('tile-matched');
        tileEl.classList.add('tile-matched');
        state.matchMatched.add(first.pairId);
        state.matchSelected = null;

        // Update progress
        const pct = (state.matchMatched.size / state.matchPairs.length) * 100;
        const pf = document.getElementById('match-progress-fill');
        if (pf) pf.style.width = pct + '%';

        // All matched?
        if (state.matchMatched.size === state.matchPairs.length) {
          clearInterval(state.matchTimer);
          state.matchTimer = null;
          const m = String(Math.floor(state.matchSeconds / 60)).padStart(2,'0');
          const s = String(state.matchSeconds % 60).padStart(2,'0');
          setTimeout(() => {
            const area = document.getElementById('match-area');
            if (area) area.innerHTML = `
              <div class="match-complete">
                <div class="match-complete-emoji">🏆</div>
                <div class="match-complete-time">${m}:${s}</div>
                <div class="match-complete-label">All pairs matched! Great job!</div>
                <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                  <button class="btn btn-primary" onclick="App.startMatch()">Play Again</button>
                  <button class="btn btn-secondary" onclick="App.stopExercise()">Back to Exercises</button>
                </div>
              </div>`;
          }, 600);
        }
      } else {
        // Wrong match — flash red, unselect after delay
        first.el.classList.remove('tile-selected');
        first.el.classList.add('tile-selected-wrong');
        tileEl.classList.add('tile-selected-wrong');
        state.matchSelected = null;
        setTimeout(() => {
          first.el.classList.remove('tile-selected-wrong');
          tileEl.classList.remove('tile-selected-wrong');
        }, 650);
      }
    }
  }

  function nextQuestion() {
    state.exerciseIndex++;
    if (state.exerciseMode === 'mc') renderMCQuestion();
    else if (state.exerciseMode === 'fitb') renderFITBQuestion();
  }

  return {
    STARTER_WORDS,
    init,
    renderExercisePicker,
    showExerciseFeedback, hideExerciseFeedback,
    startExercise, endExercise,
    flipCard, flashcardAnswer, answerMC, checkFITB, stopExercise,
    startWordArrangement, waAddTile, waReset, waCheck,
    startMatch, matchSelectTile,
    nextQuestion,
  };
})();
