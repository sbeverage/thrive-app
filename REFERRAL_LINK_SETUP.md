# Referral Link Setup Guide

This guide helps you finalize the referral link so `https://thrive-web-jet.vercel.app/signup?ref=xxx` works for Invite Friends.

## Current Setup

- **App** (thrive-app): Deep link handling ✅, Android intent filters ✅
- **Referral URL**: `https://thrive-web-jet.vercel.app/signup?ref=REFERRER_ID`
- **Web**: `thrive-web-jet.vercel.app` returns 404 for `/signup` — needs the signup page

## Option A: Add Signup to Your Existing Web Project (Recommended)

If `thrive-web-jet.vercel.app` is a **separate Next.js/React project**:

1. **Copy the static signup page**
   - From this repo: `public/signup/index.html`
   - Into your web project: `public/signup/index.html`

2. **Or add as a Next.js page** (e.g. `app/signup/page.js`):

```jsx
'use client';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function SignupPage() {
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref') || '';

  useEffect(() => {
    if (typeof window === 'undefined' || !ref) return;
    const deepLink = `thriveapp://signup?ref=${encodeURIComponent(ref)}`;
    window.location.href = deepLink;
    const t = setTimeout(() => {
      document.getElementById('fallback')?.classList.remove('hidden');
    }, 2000);
    return () => clearTimeout(t);
  }, [ref]);

  return (
    <div style={{ fontFamily: 'system-ui', textAlign: 'center', padding: 40 }}>
      <h1>Join Thrive</h1>
      <p>A friend invited you!</p>
      <div id="fallback" className="hidden">
        <p>Don&apos;t have the app?</p>
        <a href="https://apps.apple.com/app/thrive-app">iPhone</a>
        <a href="https://play.google.com/store/apps/details?id=com.thriveinitiative.app">Android</a>
      </div>
    </div>
  );
}
```

3. **Deploy** to Vercel — `/signup` will then serve this page.

## Option B: Deploy This Repo's Static Signup Page

This repo includes `public/signup/index.html`. If you have a Vercel project that serves static files:

1. Ensure the project builds and deploys (see note below about web build).
2. The `public/` folder is copied to the output during build.
3. Configure `vercel.json` so `/signup` maps correctly.

**Note**: The main app's web build (`npm run build:web`) currently fails due to Stripe’s native modules. The static `public/signup/index.html` will work if deployed by a project that copies `public/` into its output (e.g. a minimal Next.js or static site).

## Option C: Minimal Vercel Project for Signup Only

Create a small Vercel project that only serves the signup page:

1. Create a new repo with:

```
/public/signup/index.html   (copy from this project)
vercel.json
```

2. **vercel.json**:
```json
{
  "rewrites": [{ "source": "/signup", "destination": "/signup/index.html" }]
}
```

3. Point `thrive-web-jet.vercel.app` to this project, or use a subdomain like `signup.thriveinitiative.com` and update the referral link in the app.

## Update App Store / Play Store Links

In `public/signup/index.html`, replace the placeholder links with your real store URLs:

- **iOS**: `https://apps.apple.com/app/idYOUR_APP_ID` or your app’s slug
- **Android**: `https://play.google.com/store/apps/details?id=com.thriveinitiative.app` (update if different)

## Verification

1. Deploy the signup page to `thrive-web-jet.vercel.app/signup`.
2. Visit: `https://thrive-web-jet.vercel.app/signup?ref=test123`
3. On mobile: Should attempt to open the app with `ref=test123`.
4. On desktop or if the app doesn’t open: Should show download links.

## Flow Summary

1. User taps referral link → Opens `https://thrive-web-jet.vercel.app/signup?ref=USER_ID`
2. Web page tries `thriveapp://signup?ref=USER_ID` (opens app if installed)
3. If app doesn’t open → Shows App Store / Play Store links
4. If app opens → Signup screen loads with `ref` and passes it to the API
