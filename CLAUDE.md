# THRIVE App — AI Assistant Rules

These rules apply to every AI assistant (Claude, GPT, Gemini, etc.) working in this codebase.
Violating them creates security vulnerabilities or breaks the app for real users.

---

## NEVER do these things

### 1. No debug network injections
Never add `fetch`, `axios`, or any HTTP call that sends data to localhost, 127.0.0.1, or any
non-project external URL for debugging purposes. This includes patterns like:
```js
// BANNED — leaks auth tokens
fetch('http://127.0.0.1:7895/ingest/...', { body: JSON.stringify({ token, headers }) })
```
If you need to debug, use `console.log`. Never transmit auth tokens, headers, or user data to
any monitoring endpoint without Stephanie's explicit written approval.

### 2. No #region agent log blocks
Never use `// #region agent log ... // #endregion` to wrap debug code. This pattern was used
by a previous AI to inject token-leaking network calls. The pre-commit hook will block it.

### 3. Don't touch JWT_SECRET
Never hardcode, log, or modify the JWT_SECRET value. It lives only in Supabase Edge Function
secrets. Don't add any code that reads or transmits it.

### 4. Don't add duplicate interceptors
`app/lib/api.js` has exactly ONE request interceptor and ONE response interceptor. Never add
a second one. Adding duplicates causes auth headers to be applied twice or error handling to
run twice, which breaks the entire API layer.

### 5. Don't remove auth guards
The 401 handler in `app/lib/api.js` clears the session when a token is rejected. The home
screen (`app/(tabs)/home.js`) redirects to `/` when `!user.isLoggedIn`. The `signupFlowPending`
guard in `app/index.js` resumes incomplete signups. Do not remove or weaken any of these.

### 6. Don't commit .env files
The `.env` file contains real API keys. It is gitignored. Never stage or commit it.

---

## Copy rules (user-facing text)

These govern every string a donor, vendor, or admin reads: screens, buttons, empty
states, error messages, push notifications, emails, and the website. They do not
govern code comments or commit messages.

### 1. No em dashes or en dashes
Never use `—` or `–` in user-facing copy. It is the clearest tell that AI wrote
the text, and THRIVE's copy has to read as if the team wrote it. Use a comma, a
full stop, a colon, or "and". If the dash was joining two ideas, split the
sentence.

```
BANNED   "Your gift is on its way — thanks for thriving"
INSTEAD  "Your gift is on its way. Thanks for thriving!"
```

### 2. Warm and conversational, never legal or cold
THRIVE asks people to give money to strangers and trust that discounts follow.
Formal copy makes a warm idea feel like paperwork, which is a large part of why
new users don't understand the model.

- **Never say "beneficiary" to a user.** It is an insurance word. The word is
  **"charity"**, everywhere, chosen 2026-09-12 and swept through the whole app.
  Not "cause" either: that was the interim word and is now gone from user-facing
  text. Asking "Who do you want to help?" is still fine as a heading.
  Note the two data keys that deliberately still read `cause`/`causes`: the
  notification category key in `app/(tabs)/menu/notifications.js` (matched
  server-side) and the step key in `app/components/ThriveLoop.js`. Identifiers,
  routes and filenames (`chooseCause`, `causeSearch`, `causePicker`) were left
  alone on purpose.
- **Errors say what happened and what to do**, and never open with "Error" or
  "Failed". Not `"Error: Failed to save"` but `"That didn't save. Give it
  another try?"`
- **Write from the user's side of the screen.** They have a "monthly gift", not
  a "recurring donation record".
- **Buttons say what happens.** "Choose this cause", not "Submit".

### 3. Say when something is reversible
Anywhere the app asks for a commitment, say it can be changed. The cause picker
is the important one: people stall there because nothing tells them the choice
isn't permanent.

---

## Charity images

A charity has **three** images, not one. They live in three differently-shaped
slots, and a single photo cannot fill all three without something important
getting cut off. Uploading one picture and hoping is what made profiles look
broken: the app crops with `resizeMode: "cover"`, which centre-crops, so a wide
cover squeezed into the square browse card silently lost its left and right
thirds.

| Role | Column | Ratio | Upload target | Where it appears |
|---|---|---|---|---|
| **Logo** | `logo_url` | 1:1 | 512 x 512 | 110pt circle on the charity profile |
| **Highlight** | `highlight_url` | 1:1 | 600 x 600 | 120pt square on the charity browse list |
| **Cover** | `image_url` | 2:1 | 1600 x 800 | Full-width band across the top of the profile |

### 1. Always crop in the panel, never upload raw

The charity profile form has a cropper (`ImageCropUpload.tsx`). It exports
exactly the rectangle you framed, at the target size, and uploads that. Don't
add an upload path for these three roles that skips it: an uncropped file puts
the silent centre-crop straight back.

The original is not kept. Reframing means re-cropping, which is a deliberate
trade for a correct render everywhere and smaller downloads.

### 2. Slot ratios and crop ratios are a matched pair

Changing `imageCarousel` in `components/BeneficiaryDetailCard.js`, or
`beneficiaryImage` / `beneficiaryCard` in
`app/(tabs)/(main)/beneficiary/index.js`, without changing `IMAGE_PRESETS` in
`ImageCropUpload.tsx` to match re-introduces the bug. They are two halves of
one decision.

Give a slot an **aspect ratio, never a fixed height**. `height: 200` on a
full-width band means the ratio changes with screen width, so the same cover
frames differently on a small phone than a large one and the chosen crop only
holds on one device.

### 3. Fallbacks are render-time only

`formatCharityResponse` resolves `highlightUrl -> image_url -> logo_url` so a
charity nobody has re-cropped yet still shows a picture. Never write that
fallback into the database: storing a cover in `highlight_url` records a square
crop that nobody made, and the panel can no longer tell what still needs doing.

### 4. What to tell a charity asking what to send

One square logo on a transparent or white background, and two photos: one wide
(landscape, the wider the better) and one that works square. Faces and text
near the middle. We do the cropping.
---

## Architecture reminders

- **Backend**: Supabase Edge Functions only. `BACKEND_URL = https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1`
- **The Render backend** (`thrive-backend/`) is legacy and NOT used by the app. Do not route any API calls to it.
- **Auth flow**: Public endpoints get `Authorization: Bearer <ANON_KEY>`. Protected endpoints get `Authorization: Bearer <USER_JWT>` — the user JWT goes directly in Authorization; `apikey: <ANON_KEY>` (set in axios default headers) identifies the project to the Supabase gateway. The Edge Function verifies the user JWT via `JWT_SECRET`. Do not reintroduce `X-App-Authorization`.
- **Signup guard**: `signupFlowPending` in AsyncStorage tracks incomplete signups. It must be SET at account creation (`signup.js`) and CLEARED at flow completion (`stripeIntegration.js`). Don't remove either end.
- **Token expiry**: JWTs issued by the Supabase Edge Function expire in 30 days. Users must log in again after expiry — this is expected behavior, not a bug.

---

## How to work safely

1. Before editing `api.js`, read the full request interceptor (lines ~60-116) and response interceptor (lines ~118-246) to understand the auth model.
2. Before editing `UserContext.js`, understand that `loadUserData` calls `getProfile` on startup. A 401 there sets `isLoggedIn: false`, which triggers the home screen redirect.
3. Before pushing a build to TestFlight, run: `git diff HEAD -- app/lib/api.js | grep "^+" | grep -i "fetch\|127\.0\.0\.1\|agent log"` to confirm no injections crept in.
4. The pre-commit hook catches the most dangerous patterns automatically.
