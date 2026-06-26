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
- Field: **`GEMINI_KEY`** (type: *string*) = `<your trial Gemini API key>`

> The app also still accepts a legacy field named `key` for backward
> compatibility, but **`GEMINI_KEY`** is the canonical name — it sits alongside
> `GOOGLE_KEY` (paid translator) on the same `config/trial` doc.

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

---

# Paid-tier translator (shared Google key)

Separately from the Gemini AI features, the app can give **selected (paid)
users** a higher-quality translator using a **shared Google Translate key**,
while everyone else uses free MyMemory. This runs with **no backend** on static
Firebase Hosting.

## Why Google and not DeepL

> ⚠️ **DeepL can't be used from a static site.** DeepL's API sends no CORS
> headers and rejects direct browser calls, so it needs a server/proxy — which
> we deliberately don't have. **Google Translate v2** *does* allow browser
> calls with `?key=`, so the shared paid translator uses Google. If you later
> add a small proxy (e.g. a free Cloudflare Worker, outside Firebase), DeepL
> can be wired the same way.

## How it works

1. The shared Google key is stored as a field **`GOOGLE_KEY`** on the **same
   `config/trial` document** as the Gemini key.
2. Access is gated by a **per-user entitlement flag**: `entitlements/{uid}`
   with `{ translateEnabled: true }`. This doc is **admin-write-only** in the
   rules — a user **cannot** grant themselves the paid translator.
3. Usage is capped per account in **`translateUsage/{uid}`** (increment-only,
   no reset — same anti-tamper shape as the Gemini counter), limited to
   **`translateLimit()` = 200** calls.
4. The translate chain on static hosting is: **entitled + under cap → Google
   (shared key)**, otherwise / on any failure / when exhausted → **MyMemory**
   (free). Gemini AI features are unaffected — they stay on the trial/own key.

A user who pastes their **own** DeepL/Google key in Settings still uses that
(it never leaves their device) and bypasses the shared path.

## One-time steps

### 1. Add the shared Google key
On the existing `config/trial` doc, add field **`GOOGLE_KEY`** (type *string*)
= your Google Cloud Translation API key. (Restrict the key to the **Cloud
Translation API** and set a **budget/quota alert** — same caution as the
Gemini key, since it's readable by entitled, under-cap users.)

### 2. Grant a user the paid translator
Create a doc at `entitlements/{their-uid}` with a single boolean field:
`translateEnabled` = `true`. Remove it (or set `false`) to revoke.

### 3. Deploy the rules
```bash
npx firebase deploy --only firestore:rules
```

## Changing the translate cap

The cap lives in **two places that must match**:

- `js/translator.js` → `const TRANSLATE_LIMIT = 200;`
- `firestore.rules` → `function translateLimit() { return 200; }`

Update both, then redeploy rules.
