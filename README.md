# Daily Deutsch 🇩🇪

Daily Deutsch is a premium, offline-first web application designed to help language learners build their German vocabulary systematically. By capturing, translating, and organizing the words you use every day, Daily Deutsch transforms your real-life expressions into smart, contextual exercises.

---

## 🚀 Key Features

* **Instant Translation & Audit**: Translate phrases via DeepL, Google Translate, or MyMemory, and get immediate grammar, verb placement, and CEFR level (A1–C2) analysis using Gemini AI.
* **Smart Exercises**: Practice with Spaced Repetition (simplified SM-2 algorithm) using dynamically generated exercises:
  * **Flashcards**: Flip cards to test memory inside rich sentences.
  * **Multiple Choice**: Select correct translations from smart distractors.
  * **Fill in the Blank**: Write missing vocabulary words in new contextual frames.
  * **Translate Phrase**: Tap word tiles in order to compile translations.
  * **Match**: Connect German words with their meanings in a race against the clock.
* **Gamification & Motivation**:
  * **Daily Streaks**: Build daily habits and unlock animated fire celebrations.
  * **Levels & XP**: Earn experience points for translating, saving, and practising.
  * **Achievements Grid**: Unlock beautiful badges for milestones (e.g. Early Bird, Perfectionist) and share them with friends.
* **Collaboration Match**: Challenge your friends to real-time vocabulary matching duels by sharing direct challenge room codes.
* **AI Custom Stories**: Instantly compile A2–B1 level short stories containing your exact saved word bank vocabulary, with inline translations and text-to-speech audio pronunciation.
* **Google Analytics 4 Tracking**: Out-of-the-box custom event tracking wrappers for screen views, translations, exercise accuracy, level-ups, badge unlocks, and AI activations.

---

## 🛠️ Technology Stack

1. **Frontend**: Plain HTML5, custom CSS3 variable design systems, and modular IIFE vanilla JavaScript modules.
2. **Backend**: Node.js & Express server for server-side API translations.
3. **Database & Auth**: Firebase Auth (Google Sign-In + Anonymous Guests) and Cloud Firestore for cross-device database synchronization.
4. **Offline First**: Service Worker implementation pre-caching all assets for offline capabilities.

---

## ⚙️ Setup & Development

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Environment Configuration
Create a `.env` file in the project root:
```env
# Translation Keys
DEEPL_KEY=your_deepl_api_key
GOOGLE_KEY=your_google_translate_key
TRANSLATION_PROVIDER=auto

# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_firebase_sender_id
FIREBASE_APP_ID=your_firebase_app_id
FIREBASE_MEASUREMENT_ID=your_firebase_measurement_id

# Local server
PORT=3000
```

### 3. Install & Start Development Server
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your web browser.

### 4. Deployment
Deploy static pages directly to Firebase Hosting:
```bash
npx firebase deploy --only hosting:dailydeutsch
```
