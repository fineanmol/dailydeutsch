/**
 * features/ai.js — Gemini-powered learning features.
 *
 * Carved out of the former app.js monolith (audit P3). Centralizes everything
 * that calls the AI: the in-exercise grammar explainer, the AI story writer
 * (live + demo), the sentence auditor (live + demo), the AI writing assistant,
 * and the verb conjugator (inline panel + standalone conjugator page).
 *
 * The trial gate is a single shared helper (ctx.callGemini already enforces it
 * and surfaces the upgrade modal); each entry point only adds the pre-check
 * (`!getGeminiKey() && !hasTrialRemaining()` → showProInterestModal) that the
 * originals had.
 *
 * Wiring: App calls AIFeatures.init(ctx) once. Verb-conjugation panel state
 * (state.verbConjugations / state.verbConjugationsOpen) stays on Store.state.
 *
 * Depends on: store.js, gemini (via ctx.callGemini), wordbank.js, ui.js,
 *             analytics.js (optional).
 */
const AIFeatures = (() => {

  // ── Injected shared context (set in init) ─────────────────────
  let state, escHtml, escAttr, showToast, showModal, showProInterestModal,
      callGemini, getGeminiKey, hasTrialRemaining, getLearningLangName,
      navigateTo;

  let demoStoryToggle = false;

  function init(ctx) {
    state = ctx.state;
    escHtml = ctx.escHtml;
    escAttr = ctx.escAttr;
    showToast = ctx.showToast;
    showModal = ctx.showModal;
    showProInterestModal = ctx.showProInterestModal;
    callGemini = ctx.callGemini;
    getGeminiKey = ctx.getGeminiKey;
    hasTrialRemaining = ctx.hasTrialRemaining;
    getLearningLangName = ctx.getLearningLangName;
    navigateTo = ctx.navigateTo;
    setupConjugator();
  }

  // ── In-exercise Grammar Explanation ───────────────────────────
  async function explainMistake(context, correct, wrong) {
    if (!getGeminiKey() && !hasTrialRemaining()) {
      showProInterestModal('ai_explain');
      return;
    }
    showModal('AI Grammar Explanation', '<div style="display:flex; justify-content:center; align-items:center; padding:30px;"><div class="spinner"></div></div>');
    try {
      const prompt = `You are a friendly ${getLearningLangName()} language tutor. The user got a question wrong in an exercise.
      Context/Sentence: "${context}"
      Correct Answer: "${correct}"
      User's Incorrect Answer: "${wrong}"
      Explain the grammatical or contextual rule in 2 short, simple sentences. Explain why "${correct}" is correct and why "${wrong}" is incorrect or different. Avoid complex jargon. Write in English.`;

      const explanation = await callGemini(prompt);

      showModal('AI Grammar Explanation', `
        <div style="line-height:1.5; font-size:0.95rem; color:var(--text-primary);">
          <div style="margin-bottom:1rem; padding:10px; background:rgba(233,95,92,0.06); border-radius:6px; font-size:0.85rem; border:1px solid rgba(233,95,92,0.15)">
            <strong>Your answer:</strong> <span style="text-decoration:line-through;color:var(--accent-red);">${escHtml(wrong)}</span><br>
            <strong>Correct answer:</strong> <span style="color:var(--mint);font-weight:600;">${escHtml(correct)}</span>
          </div>
          <p style="margin: 0 0 1.25rem 0;">${escHtml(explanation)}</p>
          <button class="btn btn-primary w-full" onclick="document.getElementById('dd-custom-modal').remove()">Got it!</button>
        </div>`);
    } catch (e) {
      showModal('Explanation Error', `<p style="color:var(--accent-red); margin:0;">${escHtml(e.message)}</p>`);
    }
  }

  // ── AI Story Generator ────────────────────────────────────────
  async function generateAIStory() {
    const words = WordBank.getAllWords();
    if (words.length < 3) {
      showToast('Save at least 3 words in your word bank first!', 'info');
      return;
    }
    if (!getGeminiKey() && !hasTrialRemaining()) {
      showProInterestModal('ai_story');
      return;
    }

    if (typeof Analytics !== 'undefined') {
      Analytics.logEvent('ai_story_triggered');
    }

    const container = document.getElementById('ai-story-container');
    if (container) {
      container.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; padding:30px;"><div class="spinner"></div><span style="margin-left:10px;color:var(--text-muted);">Writing your custom story…</span></div>`;
    }

    const randomWords = [...words].sort(() => 0.5 - Math.random()).slice(0, Math.min(5, words.length));
    const wordListStr = randomWords.map(w => `"${w.german}" (meaning "${w.english}")`).join(', ');

    try {
      const prompt = `You are a ${getLearningLangName()} language teacher. Write a very short, simple, engaging story (exactly 3 sentences) in ${getLearningLangName()} at an elementary A2-B1 level.
      You MUST naturally use these specific vocabulary words in the story: ${wordListStr}.
      Highlight the target vocabulary words in the ${getLearningLangName()} text by surrounding them with asterisks, like *word*.
      Provide a translation of the story in English.
      Return a JSON object with these EXACT keys:
      {
        "storyDe": "The ${getLearningLangName()} text of the story (exactly 3 sentences, with target words surrounded by asterisks)",
        "storyEn": "The English translation of the story"
      }`;

      const res = await callGemini(prompt, true);

      if (typeof Analytics !== 'undefined') {
        Analytics.logEvent('ai_story_success', { words_count: randomWords.length });
      }

      let highlightedDe = escHtml(res.storyDe);
      highlightedDe = highlightedDe.replace(/\*([^*]+)\*/g, '<span style="color:var(--primary); font-weight:700;">$1</span>');

      if (container) {
        container.innerHTML = `
          <div class="ai-story-card" style="text-align:left;">
            <p class="ai-story-text-de" style="font-size:1.05rem; line-height:1.6; margin-bottom:1rem; color:var(--text-primary); font-family:'Outfit',sans-serif;">${highlightedDe}</p>
            <button class="btn btn-ghost btn-sm" id="story-translate-btn" onclick="document.getElementById('ai-story-en').classList.toggle('hidden'); this.textContent = this.textContent.includes('Show') ? 'Hide Translation' : 'Show Translation'">Show Translation</button>
            <p class="ai-story-text-en hidden" id="ai-story-en" style="margin-top:0.75rem; color:var(--text-muted); font-size:0.9rem; line-height:1.5;">${escHtml(res.storyEn)}</p>
            <div style="margin-top:1.25rem; font-size:0.75rem; color:var(--text-muted); border-top:1px solid rgba(0,0,0,0.06); padding-top:8px;">
              Featured words: ${randomWords.map(w => `<span class="badge" style="background:rgba(92,195,232,0.08);color:var(--primary);margin-right:4px;">${escHtml(w.german)}</span>`).join('')}
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

  async function runStoryDemo() {
    const container = document.getElementById('ai-story-container');
    if (!container) return;

    container.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; padding:30px;"><div class="spinner"></div><span style="margin-left:10px;color:var(--text-muted);">Reading demo story...</span></div>`;

    // Simulate load time
    await new Promise(resolve => setTimeout(resolve, 800));

    let highlightedDe = '';
    let storyEn = '';
    let demoWords = [];

    if (demoStoryToggle) {
      demoWords = [
        { german: 'schön', english: 'beautiful' },
        { german: 'spazieren', english: 'go for a walk' },
        { german: 'Freund', english: 'friend' }
      ];
      highlightedDe = 'Heute ist das Wetter sehr <span style="color:var(--primary); font-weight:700;">schön</span>, und ich möchte im Park <span style="color:var(--primary); font-weight:700;">spazieren</span>. Ich treffe dort einen guten <span style="color:var(--primary); font-weight:700;">Freund</span>, und wir trinken zusammen einen Kaffee.';
      storyEn = 'Today the weather is very beautiful, and I want to go for a walk in the park. I meet a good friend there, and we drink a coffee together.';
    } else {
      demoWords = [
        { german: 'müde', english: 'tired' },
        { german: 'Geschenk', english: 'gift' },
        { german: 'spielen', english: 'play' }
      ];
      highlightedDe = 'Der Hund war gestern sehr <span style="color:var(--primary); font-weight:700;">müde</span>, also legte er sich in sein Körbchen. Seine Besitzerin brachte ihm ein <span style="color:var(--primary); font-weight:700;">Geschenk</span>, nämlich einen leckeren Knochen. Er begann sofort zu <span style="color:var(--primary); font-weight:700;">spielen</span> und wedelte glücklich mit dem Schwanz.';
      storyEn = 'The dog was very tired yesterday, so he lay down in his basket. His owner brought him a gift, namely a tasty bone. He immediately started to play and wagged his tail happily.';
    }

    // Toggle next time
    demoStoryToggle = !demoStoryToggle;

    container.innerHTML = `
      <div class="ai-story-card" style="text-align:left;">
        <p class="ai-story-text-de" style="font-size:1.05rem; line-height:1.6; margin-bottom:1rem; color:var(--text-primary); font-family:'Outfit',sans-serif;">${highlightedDe}</p>
        <button class="btn btn-ghost btn-sm" id="story-translate-btn" onclick="document.getElementById('ai-story-en').classList.toggle('hidden'); this.textContent = this.textContent.includes('Show') ? 'Hide Translation' : 'Show Translation'">Show Translation</button>
        <p class="ai-story-text-en hidden" id="ai-story-en" style="margin-top:0.75rem; color:var(--text-muted); font-size:0.9rem; line-height:1.5;">${storyEn}</p>
        <div style="margin-top:1.25rem; font-size:0.75rem; color:var(--text-muted); border-top:1px solid rgba(0,0,0,0.06); padding-top:8px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
          <span>Featured words:</span>
          ${demoWords.map(w => `<span class="badge" style="background:rgba(92,195,232,0.08);color:var(--primary);">${escHtml(w.german)} (${escHtml(w.english)})</span>`).join('')}
        </div>
        <div style="margin-top:1.25rem; padding:10px; background:rgba(0,0,0,0.02); border-radius:6px; font-size:0.78rem; color:var(--text-muted); line-height:1.35;">
          💡 Connect a free Gemini API Key in Settings to generate stories dynamically from your actual Word Bank!
        </div>
        <button class="btn btn-secondary btn-sm" style="margin-top:1rem; width:100%;" onclick="App.runStoryDemo()">🔄 View another demo story</button>
      </div>`;
  }

  // ── Sentence Auditor ──────────────────────────────────────────
  function startSentenceAuditor() {
    document.getElementById('exercise-picker').classList.add('hidden');
    document.getElementById('exercise-area').classList.add('hidden');
    document.getElementById('exercise-result-area').classList.add('hidden');

    const auditorArea = document.getElementById('sentence-auditor-area');
    if (auditorArea) auditorArea.classList.remove('hidden');

    // Check if key is available
    const keyAvailable = !!getGeminiKey();
    const warning = document.getElementById('auditor-key-warning');
    const sandbox = document.getElementById('auditor-sandbox');
    const submitBtn = document.getElementById('auditor-submit-btn');

    if (warning) warning.classList.toggle('hidden', keyAvailable);
    if (sandbox) sandbox.classList.toggle('hidden', keyAvailable);
    if (submitBtn) submitBtn.disabled = false; // Always enable to guide users

    // Clear inputs and results
    const input = document.getElementById('auditor-input');
    const results = document.getElementById('auditor-results');
    const loader = document.getElementById('auditor-loader');
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    if (loader) loader.classList.add('hidden');
  }

  function stopSentenceAuditor() {
    const auditorArea = document.getElementById('sentence-auditor-area');
    if (auditorArea) auditorArea.classList.add('hidden');

    document.getElementById('exercise-picker').classList.remove('hidden');
    if (typeof ExerciseEngine !== 'undefined') ExerciseEngine.renderExercisePicker();
  }

  async function runAuditorDemo(sentence) {
    const input = document.getElementById('auditor-input');
    if (input) input.value = sentence;

    const loader = document.getElementById('auditor-loader');
    const resultsContainer = document.getElementById('auditor-results');
    const submitBtn = document.getElementById('auditor-submit-btn');

    if (loader) loader.classList.remove('hidden');
    if (resultsContainer) resultsContainer.innerHTML = '';
    if (submitBtn) submitBtn.disabled = true;

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    let mockData = {};
    if (sentence.includes('gehen gestern')) {
      mockData = {
        sentenceOriginal: "Ich gehen gestern nach Hause",
        sentenceCorrected: "Ich bin gestern nach Hause gegangen",
        isPerfect: false,
        mistakes: [
          {
            wrong: "gehen",
            right: "bin gegangen",
            explanation: "German past tense (Perfekt) for 'gehen' (to go) requires the auxiliary verb 'sein' (bin) and the past participle 'gegangen'."
          },
          {
            wrong: "gehen gestern nach Hause",
            right: "bin gestern nach Hause gegangen",
            explanation: "In past tense clauses, the past participle ('gegangen') must go at the very end of the sentence."
          }
        ],
        generalFeedback: "You used the correct vocabulary, but watch out for past tense structure! In German, conversational past tense uses an auxiliary verb in second position, and places the main action verb at the very end."
      };
    } else if (sentence.includes('gekaufen')) {
      mockData = {
        sentenceOriginal: "Er hat das Buch gekaufen",
        sentenceCorrected: "Er hat das Buch gekauft",
        isPerfect: false,
        mistakes: [
          {
            wrong: "gekaufen",
            right: "gekauft",
            explanation: "The verb 'kaufen' is a regular (weak) verb. Its past participle is formed with 'ge-' + verb stem + '-t' (gekauft), not '-en'."
          }
        ],
        generalFeedback: "Almost perfect! You correctly used the auxiliary verb 'haben' and placed the participle at the end. Just remember that regular verbs like 'kaufen' end in '-t' rather than '-en' in their past participle form."
      };
    } else {
      mockData = {
        sentenceOriginal: "Der Hund ist sehr treu und groß",
        sentenceCorrected: "Der Hund ist sehr treu und groß",
        isPerfect: true,
        mistakes: [],
        generalFeedback: "Outstanding! Your sentence is grammatically correct and uses accurate capitalization (Nouns like 'Hund' are capitalized in German)."
      };
    }

    renderAuditorResults(mockData);

    if (loader) loader.classList.add('hidden');
    if (submitBtn) submitBtn.disabled = false;
  }

  function toggleAuditorSandbox() {
    const wrap = document.getElementById('sandbox-buttons-wrap');
    const icon = document.getElementById('sandbox-toggle-icon');
    if (!wrap || !icon) return;

    const isHidden = wrap.classList.contains('hidden');
    if (isHidden) {
      wrap.classList.remove('hidden');
      icon.textContent = 'Hide Examples ▲';
    } else {
      wrap.classList.add('hidden');
      icon.textContent = 'Show Examples ▼';
    }
  }

  function renderAuditorResults(data) {
    const resultsContainer = document.getElementById('auditor-results');
    if (!resultsContainer) return;

    let html = '';
    if (data.isPerfect) {
      html += `
        <div class="auditor-result-card perfect">
          <div style="font-size:1.8rem; margin-bottom: 6px;">🎉 Excellent!</div>
          <div class="auditor-sentence-display">
            <span class="auditor-sentence-corrected">${escHtml(data.sentenceCorrected)}</span>
          </div>
          <p style="margin: 0.5rem 0 0 0; font-size: 0.92rem; color: var(--text-secondary); line-height: 1.45;">
            ${escHtml(data.generalFeedback || 'No grammar or spelling mistakes detected. Great job!')}
          </p>
        </div>
      `;
    } else {
      html += `
        <div class="auditor-result-card imperfect">
          <div style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Auditor Correction</div>

          <div class="auditor-sentence-display" style="margin-top: 6px; margin-bottom: 12px;">
            <div class="auditor-sentence-original">${escHtml(data.sentenceOriginal)}</div>
            <div class="auditor-sentence-corrected" style="color: var(--sky-blue);">${escHtml(data.sentenceCorrected)}</div>
          </div>

          <div class="auditor-mistakes-title">Grammar Scan Results</div>
      `;

      if (data.mistakes && data.mistakes.length > 0) {
        data.mistakes.forEach(m => {
          html += `
            <div class="auditor-mistake-item">
              <div class="auditor-diff-grid">
                <div>Wrong: <span class="auditor-diff-wrong">${escHtml(m.wrong)}</span></div>
                <div style="color: var(--text-muted);">→</div>
                <div>Correct: <span class="auditor-diff-right">${escHtml(m.right)}</span></div>
              </div>
              <div class="auditor-mistake-exp">${escHtml(m.explanation)}</div>
            </div>
          `;
        });
      } else {
        html += `<p class="text-muted" style="font-size:0.88rem;">Minor stylistic tweaks suggested.</p>`;
      }

      if (data.generalFeedback) {
        html += `
          <div style="margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid var(--border); font-size: 0.9rem; color: var(--text-secondary); line-height: 1.45;">
            <strong>Feedback:</strong> ${escHtml(data.generalFeedback)}
          </div>
        `;
      }

      html += `</div>`;
    }

    resultsContainer.innerHTML = html;
  }

  async function auditSentence() {
    const input = document.getElementById('auditor-input');
    const sentence = input?.value?.trim() || '';
    if (!sentence) {
      showToast('Please type a sentence to audit first!', 'info');
      return;
    }

    if (!getGeminiKey() && !hasTrialRemaining()) {
      showProInterestModal('ai_auditor');
      return;
    }

    const loader = document.getElementById('auditor-loader');
    const submitBtn = document.getElementById('auditor-submit-btn');
    const resultsContainer = document.getElementById('auditor-results');

    if (loader) loader.classList.remove('hidden');
    if (submitBtn) submitBtn.disabled = true;
    if (resultsContainer) resultsContainer.innerHTML = '';

    try {
      const prompt = `You are a professional ${getLearningLangName()} teacher.
Audit the following ${getLearningLangName()} sentence typed by a student:
"${sentence}"

Provide feedback in JSON format only, matching this structure:
{
  "sentenceOriginal": "the original sentence",
  "sentenceCorrected": "the fully corrected sentence in ${getLearningLangName()}. If the original was perfect, this should be identical.",
  "isPerfect": true/false (true if the original sentence was grammatically and stylistically perfect, false otherwise),
  "mistakes": [
    {
      "wrong": "the exact substring from the original sentence that is incorrect",
      "right": "the corrected substring that replaces it",
      "explanation": "a short, simple 1-2 sentence explanation in English of why it was incorrect (e.g., verb position, case ending, dative preposition, word choice)."
    }
  ],
  "generalFeedback": "A brief, encouraging overall note in English about the user's sentence structure and style."
}

Do not include any markdown formatting wrappers (like \`\`\`json). Just return the raw JSON string.`;

      const data = await callGemini(prompt, true);
      if (!data || typeof data !== 'object') {
        throw new Error('Failed to parse the AI analysis report. Please try again.');
      }

      renderAuditorResults(data);

    } catch (e) {
      console.error(e);
      showToast(e.message || 'Error occurred during sentence audit.', 'error');
      if (resultsContainer) {
        resultsContainer.innerHTML = `
          <div class="card card-red" style="margin-top: var(--space-md);">
            <strong>Error Auditing Sentence:</strong> ${escHtml(e.message || 'Network or API error occurred.')}
          </div>
        `;
      }
    } finally {
      if (loader) loader.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // ── AI Writing Assistant (German→English translate flow) ──────
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
          <p style="margin-bottom: 8px;">Get instant CEFR levels, grammar feedback, and natural phrasing suggestions for your ${getLearningLangName()} text.</p>
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

    if (typeof Analytics !== 'undefined') {
      Analytics.logEvent('ai_writing_assistant_trigger');
    }

    try {
      const prompt = `Analyze the ${getLearningLangName()} sentence "${germanText}".
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

      if (typeof Analytics !== 'undefined') {
        Analytics.logEvent('ai_writing_assistant_success', { cefr_level: res.cefrLevel });
      }

      // Brand CEFR palette — single source of truth in js/cefr.js (CEFR.COLORS).
      const meta = (typeof CEFR !== 'undefined' && CEFR.COLORS[res.cefrLevel])
        || { color: 'var(--sky-blue)', bg: 'rgba(92,195,232,0.08)', border: 'rgba(92,195,232,0.22)' };

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

  // ── Inline Verb Conjugations (translator result panel) ────────
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
      const prompt = `You are a ${getLearningLangName()} grammar helper. Conjugate the ${getLearningLangName()} verb "${germanVerb}" in the following tenses:
      1. Present (Präsens / equivalent standard present tense)
      2. Simple Past (Präteritum / equivalent standard past tense)
      3. Present Perfect (Perfekt / equivalent compound past tense)
      4. Future (Futur I / equivalent standard future tense)

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
            ${_conjRows(c)}
          </tbody>
        </table>
      </div>
    `;
  }

  // Shared 6-pronoun table-body builder (used by both inline panel and page).
  function _conjRows(c) {
    const pronouns = [
      ['ich', 'ich'], ['du', 'du'], ['er/sie/es', 'er_sie_es'],
      ['wir', 'wir'], ['ihr', 'ihr'], ['sie/Sie', 'sie_Sie'],
    ];
    return pronouns.map(([label, key]) => `
            <tr>
              <td class="conjugation-pronoun">${label}</td>
              <td class="conjugation-verb-form">${escHtml(c.present[key])}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_simple[key])}</td>
              <td class="conjugation-verb-form">${escHtml(c.past_perfect[key])}</td>
              <td class="conjugation-verb-form">${escHtml(c.future[key])}</td>
            </tr>`).join('');
  }

  // ── Standalone Conjugator page ────────────────────────────────
  function setupConjugator() {
    const input = document.getElementById('conjugator-search-input');
    const btn = document.getElementById('conjugator-search-btn');

    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runConjugationSearch();
      }
    });

    btn?.addEventListener('click', () => {
      runConjugationSearch();
    });
  }

  async function runConjugationSearch() {
    const input = document.getElementById('conjugator-search-input');
    const verb = input?.value?.trim();
    if (!verb) return;

    await fetchViewConjugations(verb);
  }

  async function conjugateSuggestedVerb(verb) {
    const input = document.getElementById('conjugator-search-input');
    if (input) {
      input.value = verb;
      await fetchViewConjugations(verb);
    }
  }

  async function fetchViewConjugations(germanVerb) {
    const wrapper = document.getElementById('conjugator-result-wrapper');
    if (!wrapper) return;

    wrapper.innerHTML = `
      <div class="card" style="display:flex; justify-content:center; align-items:center; padding:40px; margin-top: var(--space-md);">
        <div class="spinner" style="width:24px; height:24px; border-width:3px; margin-bottom:10px;"></div>
        <span style="color:var(--text-muted); font-size:0.9rem;">Generating conjugation table for "${germanVerb}"…</span>
      </div>
    `;
    wrapper.classList.remove('hidden');

    const geminiKey = getGeminiKey();
    if (!geminiKey) {
      wrapper.innerHTML = `
        <div class="card" style="margin-top: var(--space-md);">
          <div class="verb-conjugations-header">
            <div class="verb-conjugations-title" style="color: var(--accent-green); margin-bottom: 0;">📊 Verb Conjugations</div>
          </div>
          <div style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5; margin-top: 10px;">
            <p style="margin-bottom: 12px;">Conjugation tables require Google's free Gemini API. Enter your key in Settings to unlock this feature.</p>
            <button class="btn btn-secondary btn-sm" onclick="App.navigateTo('settings')">
              🔑 Configure Gemini API Key →
            </button>
          </div>
        </div>
      `;
      return;
    }

    try {
      const prompt = `You are a ${getLearningLangName()} grammar helper.
      Your tasks are:
      1. Identify the root infinitive (dictionary base form) of the ${getLearningLangName()} verb input: "${germanVerb}" (for example, if the input is a conjugated form, resolve it to the dictionary base form).
      2. Translate this root infinitive verb to English.
      3. Conjugate this resolved root infinitive verb in the following tenses:
         - Present (Präsens / equivalent standard present tense)
         - Simple Past (Präteritum / equivalent standard past tense)
         - Present Perfect (Perfekt / equivalent compound past tense)
         - Future (Futur I / equivalent standard future tense)

      For each tense, provide the conjugated form for the pronouns: ich, du, er/sie/es, wir, ihr, sie/Sie.
      Return a JSON object with this EXACT structure:
      {
        "verb": "resolved root infinitive",
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

      const c = res.conjugations;
      wrapper.innerHTML = `
        <div class="card" style="margin-top: var(--space-md);">
          <div class="verb-conjugations-header">
            <div class="verb-conjugations-title" style="font-size: 1.2rem; color: var(--accent-green); margin-bottom: 0;">
              📊 Conjugations for "${res.verb}" (${res.meaning || ''})
            </div>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="App.speakGerman(document.getElementById('conjugator-verb-title').textContent.trim())" title="Hear pronunciation" style="font-size: 1.2rem; border-radius: 50%; width:36px; height:36px;">
              🔊
            </button>
            <span id="conjugator-verb-title" class="hidden">${res.verb}</span>
          </div>

          <div class="verb-conjugations-table-wrapper" style="margin-top: var(--space-lg);">
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
                ${_conjRows(c)}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (e) {
      console.warn('[Verb conjugation view failed]', e);
      wrapper.innerHTML = `
        <div class="card" style="margin-top: var(--space-md);">
          <div class="verb-conjugations-header">
            <div class="verb-conjugations-title" style="color: var(--accent-red); margin-bottom: 0;">📊 Verb Conjugations</div>
          </div>
          <div style="font-size: 0.9rem; color: var(--accent-red); margin-top: 10px;">
            Failed to generate conjugations: ${e.message}
          </div>
        </div>
      `;
    }
  }

  return {
    init,
    explainMistake,
    generateAIStory, runStoryDemo,
    startSentenceAuditor, stopSentenceAuditor, runAuditorDemo, toggleAuditorSandbox,
    renderAuditorResults, auditSentence,
    analyzeGermanSentence,
    toggleVerbConjugations, hideVerbConjugations,
    fetchVerbConjugations, renderVerbConjugations,
    setupConjugator, runConjugationSearch, conjugateSuggestedVerb, fetchViewConjugations,
  };
})();
