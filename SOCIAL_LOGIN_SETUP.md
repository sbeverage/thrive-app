# 🔐 Social Login Setup Guide

## ✅ What's Been Implemented

### Frontend (Complete)
- ✅ Apple Sign In handler (`app/utils/socialLogin.js`)
- ✅ Google Sign In handler (OAuth flow)
- ✅ Facebook Sign In handler (OAuth flow)
- ✅ Social login buttons connected in `app/signup.js` and `app/login.js`
- ✅ API method added: `API.socialLogin()`
- ✅ Apple Authentication plugin added to `app.json`

### What You Need to Do

## 1. 🔑 Set Up OAuth Credentials

### Google OAuth Setup

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create a new project** (or select existing)
3. **Enable Google+ API**:
   - APIs & Services → Library
   - Search for "Google+ API" or "People API"
   - Click "Enable"
4. **Create OAuth 2.0 Credentials**:
   - APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **iOS** (for iOS app)
   - Application type: **Android** (for Android app)
   - Application type: **Web application** (for OAuth redirect)
5. **Add Authorized Redirect URIs**:
   ```
   thriveapp://oauth/google
   ```
6. **Copy Client ID** and add to `.env`:
   ```env
   EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   ```

### Facebook OAuth Setup

1. **Go to Facebook Developers**: https://developers.facebook.com/
2. **Create a new app** (or select existing)
3. **Add Facebook Login product**:
   - Dashboard → Add Product → Facebook Login
4. **Configure OAuth Redirect URIs**:
   - Settings → Basic
   - Add **Valid OAuth Redirect URIs**:
     ```
     thriveapp://oauth/facebook
     ```
5. **Get App ID** and add to `.env`:
   ```env
   EXPO_PUBLIC_FACEBOOK_APP_ID=your-facebook-app-id
   ```

### Apple Sign In Setup

1. **Go to Apple Developer**: https://developer.apple.com/
2. **Configure App ID**:
   - Certificates, Identifiers & Profiles → Identifiers
   - Select your App ID
   - Enable "Sign In with Apple"
3. **Configure in Xcode** (when building):
   - Add "Sign In with Apple" capability
   - Or configure in `app.json` (already added plugin)

**Note**: Apple Sign In works automatically on iOS 13+ devices. No additional credentials needed in `.env`.

---

## 2. 🔧 Update Environment Variables

Add to your `.env` file:

```env
# Google OAuth
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# Facebook OAuth
EXPO_PUBLIC_FACEBOOK_APP_ID=your-facebook-app-id
```

**Important**: 
- These are **public** keys (safe to expose in client)
- Restart Expo dev server after adding
- For production builds, add to EAS secrets

---

## 3. 🚀 Backend Implementation

### Required Endpoint: `POST /api/auth/social-login`

**Location**: `supabase/functions/api/auth/social-login/index.ts`

**Request Body**:
```typescript
{
  provider: 'apple' | 'google' | 'facebook',
  providerId: string, // Unique ID from provider
  email: string | null,
  firstName: string | null,
  lastName: string | null,
  
  // Apple-specific
  identityToken?: string,
  authorizationCode?: string,
  
  // Google/Facebook-specific
  accessToken?: string,
  idToken?: string, // Google only
  
  // Optional
  picture?: string,
  
  // Location (from frontend)
  city?: string,
  state?: string,
  zipCode?: string,
  
  // Referral (from frontend)
  referralToken?: string,
}
```

**Response**:
```typescript
{
  success: true,
  token: string, // JWT auth token
  user: {
    id: string,
    email: string,
    firstName: string | null,
    lastName: string | null,
    needsProfileSetup: boolean, // true if new user
  }
}
```

### Backend Logic

1. **Verify OAuth Token**:
   - **Apple**: Verify `identityToken` with Apple's public keys
   - **Google**: Verify `idToken` with Google's public keys
   - **Facebook**: Verify `accessToken` with Facebook Graph API

2. **Find or Create User**:
   - Check if user exists by `providerId` or `email`
   - If exists: Return user and token
   - If new: Create user account, return with `needsProfileSetup: true`

3. **Store Provider Info**:
   - Save `provider` and `providerId` to user record
   - Link to existing account if email matches

### Example Backend Implementation

```typescript
// supabase/functions/api/auth/social-login/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const { provider, providerId, email, firstName, lastName, ...tokens } = await req.json();
    
    // 1. Verify OAuth token (provider-specific)
    // ... verification logic ...
    
    // 2. Find or create user
    const supabase = createClient(/* ... */);
    
    // Check if user exists
    let user = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (!user.data) {
      // Create new user
      user = await supabase
        .from('users')
        .insert({
          email,
          first_name: firstName,
          last_name: lastName,
          provider,
          provider_id: providerId,
          email_verified: true, // OAuth emails are pre-verified
        })
        .select()
        .single();
    }
    
    // 3. Generate JWT token
    const token = generateJWT(user.data.id);
    
    // 4. Return response
    return new Response(
      JSON.stringify({
        success: true,
        token,
        user: {
          id: user.data.id,
          email: user.data.email,
          firstName: user.data.first_name,
          lastName: user.data.last_name,
          needsProfileSetup: !user.data.first_name || !user.data.last_name,
        },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 400 }
    );
  }
});
```

---

## 4. 🧪 Testing

### Apple Sign In
- ✅ Works on **real iOS devices only** (iOS 13+)
- ❌ Won't work in simulator
- Test on iPhone/iPad with Apple ID signed in

### Google Sign In
- ✅ Works on iOS, Android, and web
- Test with Google account
- Check redirect URI matches exactly

### Facebook Sign In
- ✅ Works on iOS, Android, and web
- Test with Facebook account
- Check redirect URI matches exactly

### Testing Checklist
- [ ] Apple Sign In on real iOS device
- [ ] Google Sign In on iOS
- [ ] Google Sign In on Android
- [ ] Facebook Sign In on iOS
- [ ] Facebook Sign In on Android
- [ ] New user signup flow
- [ ] Existing user login flow
- [ ] Error handling (cancel, network error)

---

## 5. 🐛 Troubleshooting

### "Google Sign In failed"
- Check `EXPO_PUBLIC_GOOGLE_CLIENT_ID` is set
- Verify redirect URI matches: `thriveapp://oauth/google`
- Check Google Cloud Console OAuth settings

### "Facebook Sign In failed"
- Check `EXPO_PUBLIC_FACEBOOK_APP_ID` is set
- Verify redirect URI matches: `thriveapp://oauth/facebook`
- Check Facebook App settings

### "Apple Sign In not available"
- Only works on iOS 13+ devices
- Won't work in simulator
- Check device has Apple ID signed in

### Backend returns 404
- Ensure `/api/auth/social-login` endpoint exists
- Check Supabase Edge Function is deployed
- Verify endpoint is in PUBLIC_ENDPOINTS list

---

## 6. 📱 Production Considerations

### Before Launch
- [ ] Use production OAuth credentials (not test)
- [ ] Test all three providers thoroughly
- [ ] Verify backend token verification is secure
- [ ] Test error handling and edge cases
- [ ] Add analytics tracking for social logins

### Security
- ✅ OAuth tokens are verified on backend
- ✅ Never expose secret keys in frontend
- ✅ Use HTTPS for all OAuth redirects
- ✅ Validate tokens server-side before creating accounts

---

## 📞 Next Steps

1. **Set up OAuth credentials** (Google, Facebook)
2. **Add credentials to `.env`**
3. **Implement backend endpoint** `/api/auth/social-login`
4. **Test on real devices**
5. **Deploy to production**

Need help with backend implementation? Let me know!

