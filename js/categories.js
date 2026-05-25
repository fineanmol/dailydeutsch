/**
 * categories.js — Auto-categorization of words
 * Detects category and part-of-speech from English input text
 */

const Categories = (() => {

  // Keyword maps for category detection
  const CATEGORY_MAP = [
    {
      id: 'greeting',
      label: 'Greetings',
      emoji: '👋',
      color: '#f5a623',
      keywords: [
        'hello', 'hi', 'hey', 'goodbye', 'bye', 'good morning', 'good night',
        'good evening', 'good afternoon', 'welcome', 'thanks', 'thank you',
        'please', 'sorry', 'excuse me', 'nice to meet', 'how are you',
        'see you', 'take care', 'greet', 'farewell', 'cheers', 'you\'re welcome',
        'of course', 'sure'
      ]
    },
    {
      id: 'food',
      label: 'Food & Drink',
      emoji: '🍕',
      color: '#ff8800',
      keywords: [
        'eat', 'food', 'drink', 'water', 'coffee', 'tea', 'beer', 'wine',
        'bread', 'meat', 'chicken', 'fish', 'vegetable', 'fruit', 'apple',
        'banana', 'orange', 'salad', 'soup', 'rice', 'pasta', 'pizza',
        'burger', 'sandwich', 'cake', 'dessert', 'milk', 'juice', 'cheese',
        'egg', 'butter', 'sugar', 'salt', 'pepper', 'cook', 'restaurant',
        'breakfast', 'lunch', 'dinner', 'snack', 'hungry', 'thirsty',
        'meal', 'recipe', 'dish', 'taste', 'delicious'
      ]
    },
    {
      id: 'travel',
      label: 'Travel & Places',
      emoji: '✈️',
      color: '#20c997',
      keywords: [
        'travel', 'trip', 'go', 'come', 'walk', 'run', 'drive', 'fly',
        'train', 'bus', 'car', 'taxi', 'airport', 'station', 'hotel',
        'map', 'direction', 'left', 'right', 'straight', 'near', 'far',
        'street', 'road', 'city', 'town', 'country', 'place', 'here',
        'there', 'where', 'north', 'south', 'east', 'west', 'ticket',
        'passport', 'visa', 'border', 'tourist', 'museum', 'beach',
        'mountain', 'park', 'center', 'market', 'shop', 'store'
      ]
    },
    {
      id: 'number',
      label: 'Numbers & Time',
      emoji: '🔢',
      color: '#0dcaf0',
      keywords: [
        'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
        'nine', 'ten', 'eleven', 'twelve', 'hundred', 'thousand', 'million',
        'first', 'second', 'third', 'number', 'count', 'time', 'hour',
        'minute', 'second', 'day', 'week', 'month', 'year', 'today',
        'tomorrow', 'yesterday', 'now', 'later', 'soon', 'always', 'never',
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
        'Sunday', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
        'morning', 'afternoon', 'evening', 'night', 'midnight', 'noon'
      ]
    },
    {
      id: 'feelings',
      label: 'Feelings',
      emoji: '😊',
      color: '#fd7e14',
      keywords: [
        'happy', 'sad', 'angry', 'love', 'like', 'hate', 'feel', 'emotion',
        'excited', 'bored', 'tired', 'scared', 'fear', 'joy', 'pain',
        'hurt', 'worry', 'stress', 'relax', 'calm', 'nervous', 'anxious',
        'confident', 'proud', 'shame', 'embarrassed', 'surprised', 'shocked',
        'lonely', 'depressed', 'upset', 'frustrated', 'content', 'grateful',
        'thankful', 'hope', 'wish', 'dream', 'wonder', 'curious'
      ]
    },
    {
      id: 'work',
      label: 'Work & Professional',
      emoji: '💼',
      color: '#9b59b6',
      keywords: [
        'work', 'job', 'office', 'meeting', 'email', 'boss', 'colleague',
        'team', 'project', 'deadline', 'report', 'presentation', 'client',
        'business', 'company', 'money', 'pay', 'salary', 'budget', 'cost',
        'price', 'buy', 'sell', 'hire', 'manager', 'employee', 'staff',
        'contract', 'agreement', 'plan', 'strategy', 'goal', 'task',
        'computer', 'phone', 'call', 'schedule', 'appointment', 'calendar',
        'invoice', 'bank', 'account', 'profit', 'loss'
      ]
    },
    {
      id: 'phrase',
      label: 'Common Phrases',
      emoji: '💬',
      color: '#ff6b6b',
      keywords: [
        'what', 'when', 'where', 'who', 'why', 'how', 'which', 'that',
        'this', 'these', 'those', 'some', 'any', 'every', 'all', 'much',
        'many', 'more', 'most', 'less', 'few', 'enough', 'too', 'very',
        'really', 'quite', 'just', 'only', 'also', 'but', 'and', 'or',
        'because', 'so', 'if', 'then', 'while', 'before', 'after',
        'maybe', 'perhaps', 'probably', 'certainly', 'definitely', 'can',
        'could', 'should', 'would', 'must', 'need', 'want', 'have'
      ]
    },
  ];

  // Part-of-speech heuristics
  const POS_SUFFIXES = {
    verb: ['ing', 'tion', 'ate', 'ify', 'ize', 'ise', 'en'],
    adjective: ['ful', 'less', 'ous', 'ive', 'ible', 'able', 'al', 'ic', 'ly'],
    noun: ['ness', 'ment', 'er', 'or', 'ist', 'ism', 'ity', 'ance', 'ence'],
  };

  const COMMON_VERBS = new Set([
    'go', 'come', 'see', 'look', 'say', 'tell', 'ask', 'know', 'get', 'give',
    'take', 'make', 'do', 'use', 'find', 'want', 'need', 'like', 'love', 'hate',
    'feel', 'think', 'believe', 'understand', 'learn', 'teach', 'help', 'try',
    'work', 'play', 'eat', 'drink', 'sleep', 'wake', 'buy', 'sell', 'pay',
    'read', 'write', 'speak', 'listen', 'wait', 'start', 'stop', 'run', 'walk',
    'sit', 'stand', 'open', 'close', 'put', 'keep', 'show', 'call', 'meet',
  ]);

  function detectCategory(text) {
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);

    let bestMatch = { category: null, score: 0 };

    for (const cat of CATEGORY_MAP) {
      let score = 0;
      for (const kw of cat.keywords) {
        if (lower.includes(kw)) {
          score += kw.includes(' ') ? 2 : 1; // multi-word phrases score higher
        }
      }
      if (score > bestMatch.score) {
        bestMatch = { category: cat.id, score };
      }
    }

    return bestMatch.category || 'general';
  }

  function detectPartOfSpeech(text) {
    const lower = text.toLowerCase().trim();
    const words = lower.split(/\s+/);

    // Multi-word = likely a phrase
    if (words.length > 2) return 'phrase';

    const word = words[0];

    if (COMMON_VERBS.has(word)) return 'verb';

    for (const [pos, suffixes] of Object.entries(POS_SUFFIXES)) {
      for (const suf of suffixes) {
        if (word.endsWith(suf) && word.length > suf.length + 2) {
          return pos;
        }
      }
    }

    return 'noun'; // default
  }

  function getCategoryInfo(id) {
    return CATEGORY_MAP.find(c => c.id === id) || {
      id: 'general', label: 'General', emoji: '📚', color: '#6c757d'
    };
  }

  function getAllCategories() {
    return [
      ...CATEGORY_MAP,
      { id: 'general', label: 'General', emoji: '📚', color: '#6c757d' }
    ];
  }

  return {
    detectCategory,
    detectPartOfSpeech,
    getCategoryInfo,
    getAllCategories,
  };
})();
