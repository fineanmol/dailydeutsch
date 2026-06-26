# Free AI Trial — one-time setup (Firebase only, no backend)

The app offers a **limited free AI trial** so non-technical users can try the
Gemini-powered features (Sentence Auditor, AI Story, Conjugator) **without
needing their own API key**. It runs entirely on the **Firebase free tier** —
no server, no Cloud Functions, no paid services.

## How it works

1. The shared Gemini key is stored in **one Firestore document**: `config/trial`.
2. Each signed-in account gets a **lifetime cap of 5 AI calls**, counted in
   `trialUsage/{uid}`.
3. **Firestore Security Rules** (in `firestore.rules`) enforce two things:
   - The trial key (`config/trial`) is **readable only while the account is
     under its quota**.
   - The usage counter can **only increase by 1** per call and **never reset** —
     so clearing the browser / localStorage cannot restore trials.
4. When the 5 calls are used up, the app shows the **upgrade prompt** ("add your
   own free Gemini key, or join the Pro waitlist").

Users who paste their **own** Gemini key in Settings bypass the trial entirely
(unlimited, and their key never leaves their device).

> ⚠️ **Trade-off (by design):** a signed-in user who still has trial budget can
> technically read the shared key in DevTools. That's why usage is **capped per
> account** — the cap is what protects your quota. Treat this key as a
> low-limit, disposable trial key, **not** your main billing key, and set a
> usage budget/alert on it in Google Cloud.

## One-time steps

### 1. Deploy the security rules
```bash
npx firebase deploy --only firestore:rules
```

### 2. Seed the trial key document
In the [Firebase Console](https://console.firebase.google.com/) →
**Firestore Database** → **Start collection**:

- Collection ID: `config`
- Document ID: `trial`
- Field: `key` (type: *string*) = `<your trial Gemini API key>`

That's it. No other document is created by hand — `trialUsage/{uid}` docs are
created automatically by the app as users consume the trial.

### 3. (Recommended) Cap the key's spend
In **Google Cloud Console → APIs & Services**, restrict the trial key to the
**Generative Language API** and set a **quota / budget alert**, so even in a
worst case your bill stays bounded.

## Changing the cap

The limit lives in **two places that must match**:

- `js/gemini.js` → `const TRIAL_LIMIT = 5;`
- `firestore.rules` → `function trialLimit() { return 5; }`

Update both, then redeploy rules.

## Rotating the key

Just edit the `key` field on `config/trial` in the Firebase Console. No code
change or redeploy needed — the app reads it live.
