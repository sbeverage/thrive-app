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
