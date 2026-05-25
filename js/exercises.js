/**
 * exercises.js — Smart Exercise Engine
 *
 * Core philosophy:
 *   - Saved phrases → broken into component words to learn individually
 *   - Exercises use NEW contextual sentences, not the original saved phrase
 *   - Original phrase appears occasionally (~20%) as a recognition check
 *   - Prioritise: high-frequency words + low accuracy + component words
 */

const Exercises = (() => {

  // ── Stopwords (skip these when decomposing phrases) ──────────
  const STOPWORDS = new Set([
    'der','die','das','ein','eine','einen','einem','einer','des',
    'und','oder','aber','wenn','weil','dass','ob','also','denn',
    'mit','von','zu','in','an','auf','bei','für','aus','nach','vor',
    'über','unter','zwischen','neben','durch','gegen','ohne','um',
    'ist','sind','war','waren','sein','haben','wird','wurde',
    'ich','du','er','sie','es','wir','ihr','man',
    'mein','dein','sein','ihr','unser','kein','keine','nicht',
    'auch','noch','schon','sehr','so','nur','ja','nein','doch',
    'wie','was','wer','wo','wann','warum','bitte','danke',
    'alle','alles','etwas','nichts','mehr','viel','hier','dort',
  ]);

  // ── Rich contextual sentence templates (by category) ─────────
  // These are DIFFERENT from the saved phrase — new situations
  const TEMPLATES = {
    greeting: [
      { de: 'Wenn ich ins Büro komme, sage ich "___".', clue: 'When I arrive at the office, I say "___".' },
      { de: '"___" sagt man auf Deutsch zur Begrüßung.', clue: '"___" is how you greet someone in German.' },
      { de: 'Am Telefon beginne ich mit "___".', clue: 'On the phone, I start with "___".' },
      { de: 'Mein Nachbar sagt immer "___ " zu mir.', clue: 'My neighbour always says "___ " to me.' },
    ],
    food: [
      { de: 'Zum Frühstück esse ich gerne ___.', clue: 'For breakfast I like to eat ___.' },
      { de: 'Im Restaurant bestelle ich ___.', clue: 'At the restaurant I order ___.' },
      { de: 'Mein Lieblingsessen ist ___.', clue: 'My favourite food is ___.' },
      { de: 'Ich kaufe ___ beim Bäcker.', clue: 'I buy ___ at the bakery.' },
      { de: '___ schmeckt mir sehr gut.', clue: '___ tastes very good to me.' },
      { de: 'Hast du noch ___?', clue: 'Do you still have ___?' },
      { de: 'Ohne ___ kann ich nicht frühstücken.', clue: 'I cannot have breakfast without ___.' },
    ],
    travel: [
      { de: 'Ich fahre mit dem ___ in die Stadt.', clue: 'I take the ___ into the city.' },
      { de: 'Am ___ steige ich aus.', clue: 'At the ___ I get off.' },
      { de: 'Entschuldigung, wo ist der/die ___?', clue: 'Excuse me, where is the ___?' },
      { de: 'Das ___ fährt alle zehn Minuten.', clue: 'The ___ runs every ten minutes.' },
      { de: 'Ich buche ein Zimmer im ___.', clue: 'I book a room at the ___.' },
      { de: 'Mein ___ landet um 15 Uhr.', clue: 'My ___ lands at 3 pm.' },
    ],
    number: [
      { de: 'Es ist genau ___ Uhr.', clue: 'It is exactly ___ o\'clock.' },
      { de: 'Der Termin ist am ___ um zehn.', clue: 'The appointment is on ___ at ten.' },
      { de: 'Das kostet ungefähr ___ Euro.', clue: 'That costs about ___ euros.' },
      { de: 'Ich warte schon ___ Minuten.', clue: 'I have been waiting ___ minutes.' },
    ],
    feelings: [
      { de: 'Heute bin ich sehr ___.', clue: 'Today I am very ___.' },
      { de: 'Er sieht ___ aus.', clue: 'He looks ___.' },
      { de: 'Ich bin ___, weil wir Urlaub machen.', clue: 'I am ___ because we are going on holiday.' },
      { de: 'Nach dem Kaffee fühle ich mich ___.', clue: 'After the coffee I feel ___.' },
      { de: 'Warum wirkst du so ___?', clue: 'Why do you seem so ___?' },
    ],
    work: [
      { de: 'Das ___ beginnt um neun Uhr.', clue: 'The ___ starts at nine o\'clock.' },
      { de: 'Ich habe ein wichtiges ___ heute Nachmittag.', clue: 'I have an important ___ this afternoon.' },
      { de: 'Mein ___ ist sehr interessant.', clue: 'My ___ is very interesting.' },
      { de: 'Wir brauchen einen Plan für das ___.', clue: 'We need a plan for the ___.' },
      { de: 'Kannst du das ___ übernehmen?', clue: 'Can you take on the ___?' },
    ],
    phrase: [
      { de: 'Ich weiß nicht, ___.', clue: 'I don\'t know, ___.' },
      { de: 'Er fragt mich, ___.', clue: 'He asks me, ___.' },
      { de: 'Sie antwortet: "___".', clue: 'She answers: "___".' },
      { de: 'Es ist wichtig zu verstehen, ___.', clue: 'It is important to understand, ___.' },
    ],
    general: [
      { de: 'Das Wort "___ " benutze ich täglich.', clue: 'I use the word "___" daily.' },
      { de: 'Kannst du "___ " auf Deutsch erklären?', clue: 'Can you explain "___" in German?' },
      { de: 'Ich habe gerade ___ gelernt.', clue: 'I just learnt ___.' },
      { de: 'Auf Deutsch heißt das "___ ".', clue: 'In German this is called "___".' },
      { de: 'Mein neues deutsches Wort ist "___ ".', clue: 'My new German word is "___".' },
    ],
  };

  // ── Phrase Decomposition ─────────────────────────────────────
  /**
   * Splits a saved word/phrase into individual learnable component words.
   * Returns an array of {german, english, ...} items.
   *
   * For "Guten Morgen" / "Good Morning":
   *   → [{german:"Morgen", blankedPhrase:"Guten ___", ...}]
   *       (Guten is a stopword/article form so filtered)
   *
   * English components matched positionally where possible.
   */
  function decompose(savedWord) {
    const deWords = savedWord.german.split(/\s+/);
    const enWords = savedWord.english.split(/\s+/);

    if (deWords.length <= 1) return []; // single word — no decomposition needed

    const components = [];
    let compIndex = 0;

    deWords.forEach((deW, i) => {
      const clean = deW.replace(/[^a-zA-ZäöüÄÖÜß-]/g, '');
      if (clean.length < 3 || STOPWORDS.has(clean.toLowerCase())) return;

      // Build the "blanked" version of the parent phrase
      const blanked = deWords.map((w, j) => j === i ? '___' : w).join(' ');

      // Best-effort English for this component word
      const enApprox = enWords[i] || enWords[enWords.length - 1] || savedWord.english;
      const enClean = enApprox.replace(/[^a-zA-Z'-]/g, '');

      components.push({
        id: `comp_${savedWord.id}_${i}`,
        german: clean,
        english: enClean,             // approximation — used as hint
        blankedPhrase: blanked,       // "Guten ___" — used in fill-the-phrase exercises
        sourcePhraseDE: savedWord.german,
        sourcePhraseEN: savedWord.english,
        category: savedWord.category,
        partOfSpeech: 'component',
        frequency: savedWord.frequency,
        attempts: 0,
        correctAnswers: 0,
        isComponent: true,
      });

      compIndex++;
    });

    return components;
  }

  /**
   * Build the full learning pool from saved words.
   * Returns three item types per entry:
   *   'direct'     → the word/phrase itself (appears ~20% of the time)
   *   'component'  → individual words extracted from phrases
   *   'contextual' → word tested inside a brand-new sentence template
   */
  function buildPool(savedWords) {
    const pool = [];
    const seenComponents = new Set(); // avoid duplicate components across words

    for (const word of savedWords) {
      const isPhrase = word.german.trim().split(/\s+/).length > 1;

      // 1. Direct item — occasionally test the full phrase as-is
      pool.push({
        ...word,
        _itemType: 'direct',
        _priority: word.frequency * (isPhrase ? 0.25 : 0.8), // phrases appear less as direct
      });

      // 2. Contextual item — same word, brand-new sentence
      pool.push({
        ...word,
        id: `ctx_${word.id}`,
        _itemType: 'contextual',
        _priority: word.frequency * 1.1,  // contextual is most valuable for learning
      });

      // 3. Component items — individual words extracted from phrases
      if (isPhrase) {
        const components = decompose(word);
        for (const comp of components) {
          if (!seenComponents.has(comp.german.toLowerCase())) {
            seenComponents.add(comp.german.toLowerCase());
            pool.push({
              ...comp,
              _itemType: 'component',
              _priority: word.frequency * 0.9, // component words are high priority
            });
          }
        }
      }
    }

    return pool;
  }

  // ── Prioritisation ───────────────────────────────────────────
  function prioritise(pool, count) {
    const scored = pool.map(item => {
      const accuracy = item.attempts > 0 ? item.correctAnswers / item.attempts : 0.5;
      const urgency = (1 - accuracy) * 2.5;
      return { ...item, _score: item._priority + urgency };
    });
    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, Math.min(count, scored.length));
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickTemplate(category) {
    const pool = [
      ...(TEMPLATES[category] || []),
      ...TEMPLATES.general,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── Flashcards ───────────────────────────────────────────────
  function generateFlashcards(savedWords) {
    if (!savedWords.length) return [];

    const pool = buildPool(savedWords);
    const selected = shuffle(prioritise(pool, 18));

    return selected.map(item => {
      if (item._itemType === 'component') {
        // Phrase-completion flashcard
        return {
          id: item.id,
          frontLabel: 'Complete the phrase',
          front: item.blankedPhrase,
          frontSub: `(${item.sourcePhraseEN})`,
          back: item.german,
          backSub: `Part of: "${item.sourcePhraseDE}"`,
          category: item.category,
          isComponent: true,
          itemType: 'component',
        };
      }

      if (item._itemType === 'contextual') {
        // Show word in a new sentence context
        const tmpl = pickTemplate(item.category);
        return {
          id: item.id,
          frontLabel: 'In context — translate the missing word',
          front: tmpl.clue.replace('___', `[${item.english}]`),
          frontSub: `German sentence: "${tmpl.de.replace('___', '?')}"`,
          back: item.german,
          backSub: tmpl.de.replace('___', item.german),
          category: item.category,
          isComponent: false,
          itemType: 'contextual',
        };
      }

      // Direct flashcard — English → German
      return {
        id: item.id,
        frontLabel: 'Translate to German',
        front: item.english,
        frontSub: null,
        back: item.german,
        backSub: null,
        category: item.category,
        partOfSpeech: item.partOfSpeech,
        isComponent: false,
        itemType: 'direct',
      };
    });
  }

  // ── Multiple Choice ──────────────────────────────────────────
  function generateMultipleChoice(savedWords) {
    if (savedWords.length < 4) return [];

    const pool = buildPool(savedWords);
    // Exclude 'direct' items — always test via context or component
    const testPool = pool.filter(i => i._itemType !== 'direct');
    const selected = shuffle(prioritise(testPool.length > 4 ? testPool : pool, 14));

    // All possible German words as distractor bank (direct words only to avoid confusion)
    const distractorBank = [...new Set(savedWords.map(w => w.german))];

    return selected.map(item => {
      const answer = item.german;

      const distractors = shuffle(
        distractorBank.filter(g => g.toLowerCase() !== answer.toLowerCase())
      ).slice(0, 3);

      const options = shuffle([answer, ...distractors]);

      let question, questionSub;

      if (item._itemType === 'component') {
        question = `Complete: "${item.blankedPhrase}"`;
        questionSub = `(Phrase meaning: "${item.sourcePhraseEN}")`;
      } else {
        // Contextual — use a new sentence as the question frame
        const tmpl = pickTemplate(item.category);
        question = tmpl.clue.replace('___', '___');
        questionSub = `German frame: "${tmpl.de.replace('___', '?')}"`;
      }

      return {
        id: item.id,
        question,
        questionSub,
        options,
        answer,
        category: item.category,
        itemType: item._itemType,
        isComponent: item._itemType === 'component',
      };
    });
  }

  // ── Fill in the Blank ────────────────────────────────────────
  function generateFillBlank(savedWords) {
    if (!savedWords.length) return [];

    const pool = buildPool(savedWords);
    const selected = shuffle(prioritise(pool, 14));

    return selected.map(item => {
      if (item._itemType === 'component') {
        // Phrase-completion: "Guten ___" — fill in the missing word
        return {
          id: item.id,
          sentenceDe: item.blankedPhrase,
          sentenceClue: `Complete the phrase (meaning: "${item.sourcePhraseEN}")`,
          hint: `🔗 This is a part of the phrase you saved: "${item.sourcePhraseDE}"`,
          answer: item.german,
          english: item.german, // show the German word as the target
          category: item.category,
          itemType: 'component',
        };
      }

      // Contextual: brand-new sentence from template
      const tmpl = pickTemplate(item.category);
      return {
        id: item.id,
        sentenceDe: tmpl.de,         // German sentence with ___
        sentenceClue: tmpl.clue.replace('___', `"${item.english}"`),
        hint: item._itemType === 'direct'
          ? `🔁 This is one of your saved words`
          : null,
        answer: item.german,
        english: item.english,
        category: item.category,
        itemType: item._itemType,
      };
    });
  }

  // ── Public ───────────────────────────────────────────────────
  return {
    generateFlashcards,
    generateMultipleChoice,
    generateFillBlank,
    buildPool,        // exposed for debugging / insights
  };

})();
