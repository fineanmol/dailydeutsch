/**
 * cefr.js — CEFR Level detection for German words
 * Levels: A1 → A2 → B1 → B2 → C1 → C2
 * Uses a curated German word lookup + heuristic fallback
 */

const CEFR = (() => {

  // ── A1: Goethe Institut core vocabulary ─────────────────────
  const A1 = new Set([
    // Greetings & Social
    'hallo','guten morgen','guten tag','guten abend','gute nacht','tschüss','auf wiedersehen',
    'danke','bitte','entschuldigung','entschuldigen sie','es tut mir leid','kein problem',
    'ja','nein','vielleicht','natürlich','genau','okay','ok','super','toll','gut',
    'wie heißen sie','wie heißt du','ich heiße','mein name ist','ich bin',
    // Pronouns & Articles
    'ich','du','er','sie','es','wir','ihr','mein','dein','sein','unser',
    'der','die','das','ein','eine','dieser','diese','dieses','kein','keine',
    // Core verbs (infinitive)
    'sein','haben','werden','machen','gehen','kommen','sehen','wollen','können','müssen',
    'sollen','dürfen','mögen','möchten','sagen','geben','nehmen','kaufen','trinken','essen',
    'schlafen','arbeiten','spielen','lernen','wohnen','leben','heißen','wissen','kennen',
    'lesen','schreiben','hören','sprechen','verstehen','helfen','brauchen','suchen','finden',
    'warten','bleiben','fragen','antworten','öffnen','schließen','stehen','sitzen','liegen',
    // Numbers
    'null','eins','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn',
    'elf','zwölf','dreizehn','zwanzig','dreißig','vierzig','fünfzig','hundert','tausend',
    'erste','zweite','dritte','erste','letzte',
    // Time
    'heute','morgen','gestern','jetzt','später','früh','spät','immer','nie','manchmal',
    'oft','dann','wann','montag','dienstag','mittwoch','donnerstag','freitag','samstag','sonntag',
    'januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember',
    'uhr','stunde','minute','sekunde','tag','woche','monat','jahr','morgens','abends','mittags',
    // People & Family
    'mann','frau','kind','junge','mädchen','baby','vater','mutter','bruder','schwester',
    'großvater','großmutter','oma','opa','eltern','familie','freund','freundin',
    'herr','frau','lehrer','lehrerin','student','studentin',
    // Home
    'haus','wohnung','zimmer','küche','bad','schlafzimmer','wohnzimmer','garten','tür','fenster',
    'tisch','stuhl','bett','lampe','schrank','sofa',
    // Food & Drink
    'wasser','milch','kaffee','tee','saft','bier','wein','brot','butter','käse','ei',
    'fleisch','fisch','gemüse','obst','apfel','banane','orange','suppe','salat','kuchen',
    'schokolade','zucker','salz','essen','trinken','frühstück','mittagessen','abendessen',
    // Transport
    'auto','bus','zug','fahrrad','flugzeug','taxi','schiff','metro','straße','weg',
    'bahnhof','flughafen','haltestelle',
    // Places
    'schule','universität','büro','geschäft','supermarkt','krankenhaus','apotheke',
    'restaurant','café','hotel','bank','post','bibliothek','park','kirche','museum',
    'stadt','land','straße','platz','markt',
    // Colors
    'rot','blau','grün','gelb','schwarz','weiß','grau','braun','orange','lila','pink',
    // Adjectives
    'groß','klein','alt','neu','jung','schön','gut','schlecht','schnell','langsam',
    'warm','kalt','heiß','richtig','falsch','leicht','schwer','lang','kurz','weit','nah',
    'teuer','billig','voll','leer','offen','geschlossen','laut','leise','sauber','schmutzig',
    // Common words
    'und','oder','aber','weil','wenn','dass','als','wie','was','wer','wo','warum','woher',
    'hier','dort','links','rechts','geradeaus','oben','unten','vorne','hinten',
    'viel','wenig','mehr','weniger','alle','alles','nichts','etwas',
    'mit','ohne','für','gegen','durch','über','unter','neben','zwischen','vor','nach','bei',
    'bis','von','zu','aus','an','in','auf','um','ab',
    'nummer','name','adresse','telefon','handy','computer','internet',
    'geld','preis','euro','cent','kosten',
    'wetter','sonne','regen','schnee','wind','wolke',
    'hund','katze','vogel','pferd','kuh','fisch','tier',
  ]);

  // ── A2 words ─────────────────────────────────────────────────
  const A2 = new Set([
    'besuchen','erklären','erzählen','beschreiben','vergessen','erinnern',
    'einladen','vorstellen','sich vorstellen','begrüßen','verabschieden',
    'anfangen','aufhören','versuchen','schaffen','planen','vorbereiten',
    'aussteigen','einsteigen','umsteigen','abfahren','ankommen','abholen',
    'bezahlen','bestellen','reservieren','buchen','einpacken','auspacken',
    'aussuchen','ausziehen','anziehen','umziehen','aufräumen','putzen',
    'kochen','backen','waschen','bügeln','reparieren','bauen',
    'treffen','kennenlernen','heiraten','scheiden','einladen',
    'geburtstag','hochzeit','fest','feier','urlaub','reise','ausflug',
    'gesundheit','krankheit','arzt','medikament','schmerzen','fieber',
    'zeitung','zeitschrift','buch','brief','paket','formular',
    'unterricht','prüfung','aufgabe','übung','fehler','antwort',
    'sport','fußball','tennis','schwimmen','laufen','wandern',
    'musik','film','theater','konzert','ausstellung','kino',
    'freizeit','hobby','interesse','lieblings',
    'wohnen','miete','möbel','renovieren','umziehen',
    'arbeit','beruf','stelle','bewerbung','kollege','chef','gehalt',
    'einkauf','laden','abteilung','kasse','rabatt','angebot',
    'verkehr','stau','umleitung','ampel','parkplatz','führerschein',
    'nachricht','neuigkeit','information','vorteil','nachteil',
    'wichtig','interessant','nett','freundlich','sympathisch','lustig',
    'müde','hungrig','durstig','krank','gesund','glücklich','traurig','ärgerlich',
    'einfach','schwierig','möglich','unmöglich','notwendig','erlaubt','verboten',
    'gleich','anders','verschieden','ähnlich','besonders','typisch',
    'ungefähr','fast','genug','zu viel','zu wenig','mindestens','höchstens',
    'zusammen','allein','gemeinsam','normalerweise','meistens','selten','endlich',
    'eigentlich','übrigens','außerdem','trotzdem','obwohl','deshalb','deswegen',
    'vielleicht','wahrscheinlich','sicher','bestimmt','leider','zum glück',
    'uhrzeit','termin','verabredung','treffpunkt','absprache',
    'klimaanlage','heizung','strom','gas','wasser','internet','fernseher',
    'dorf','vorstadt','innenstadt','umgebung','gegend','landschaft',
    'meer','see','fluss','berg','wald','feld','wiese',
  ]);

  // ── B1 indicator words ───────────────────────────────────────
  const B1 = new Set([
    'entwickeln','verbessern','vereinbaren','verantwortlich','beeinflussen',
    'entscheiden','abhängen','benutzen','verwenden','erhalten','enthalten',
    'handeln','bedeuten','darstellen','bilden','entstehen','folgen',
    'einige','mehrere','zahlreich','verschiedene','bestimmte','sämtliche',
    'bevorzugen','empfehlen','vorschlagen','ablehnen','akzeptieren','zustimmen',
    'erklärung','begründung','lösung','problem','schwierigkeit','möglichkeit',
    'erfahrung','kenntnisse','fähigkeit','fertigkeit','kompetenz',
    'gesellschaft','wirtschaft','politik','umwelt','kultur','bildung',
    'vergangenheit','gegenwart','zukunft','entwicklung','veränderung',
    'tatsächlich','offensichtlich','grundsätzlich','im allgemeinen','im großen und ganzen',
    'einerseits','andererseits','sowohl als auch','weder noch','entweder oder',
  ]);

  // CEFR badge meta
  const LEVELS = {
    A1: { label: 'A1', title: 'Beginner', color: '#47cf73', bg: 'rgba(71,207,115,0.14)' },
    A2: { label: 'A2', title: 'Elementary', color: '#0ebeff', bg: 'rgba(14,190,255,0.14)' },
    B1: { label: 'B1', title: 'Intermediate', color: '#fcd000', bg: 'rgba(252,208,0,0.14)' },
    B2: { label: 'B2', title: 'Upper-Intermediate', color: '#ae63e4', bg: 'rgba(174,99,228,0.14)' },
    C1: { label: 'C1', title: 'Advanced', color: '#ff3c41', bg: 'rgba(255,60,65,0.14)' },
    C2: { label: 'C2', title: 'Mastery', color: '#76daff', bg: 'rgba(118,218,255,0.14)' },
  };

  function getLevel(germanText) {
    if (!germanText) return 'B1';

    const raw = germanText.toLowerCase().trim();

    // Try full phrase match first
    if (A1.has(raw)) return 'A1';
    if (A2.has(raw)) return 'A2';
    if (B1.has(raw)) return 'B1';

    // Strip leading articles and try the noun/verb alone
    const stripped = raw.replace(/^(der|die|das|ein|eine|ich|du|er|wir|ihr)\s+/, '').trim();
    if (stripped !== raw) {
      if (A1.has(stripped)) return 'A1';
      if (A2.has(stripped)) return 'A2';
      if (B1.has(stripped)) return 'B1';
    }

    // Heuristic fallback based on word/phrase length
    const wordCount = raw.split(/\s+/).length;
    const charLen = raw.replace(/\s/g, '').length;

    if (wordCount === 1 && charLen <= 4) return 'A2';
    if (wordCount === 1 && charLen <= 7) return 'B1';
    if (wordCount === 2) return 'B1';
    if (wordCount >= 3) return 'B2';
    return 'B2';
  }

  function getLevelInfo(level) {
    return LEVELS[level] || LEVELS['B1'];
  }

  return { getLevel, getLevelInfo };
})();
