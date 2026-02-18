# 🔧 Email Verification Name Fix

## 🚨 Issue

**Problem:** Email verification email shows "Welcome, stephanie" instead of "Welcome, Aussie" (the actual profile name).

**Root Cause:** The verification email is sent **immediately after signup** (before the profile is created), so the backend doesn't have the user's name yet. The email template is likely extracting the name from the email address (`stephanie@phixsolutions.com` → "stephanie").

---

## 📋 Current Flow

1. **User signs up** → Provides email and password only
2. **Backend sends verification email** → Uses email address to extract name (or no name)
3. **User creates profile** → Enters firstName "Aussie", lastName, etc.
4. **Profile saved** → But verification email already sent with wrong name

**Timeline:**
```
Signup (email only) 
  ↓
Verification Email Sent (no profile name available yet)
  ↓
Profile Created (firstName: "Aussie")
  ↓
Email already sent with wrong name ❌
```

---

## ✅ Solution Options

### Option 1: Fetch Profile Name When Sending Email (Recommended)

Update the backend to check if a profile exists and use the actual name:

**Backend Code Fix:**

```typescript
// In your signup endpoint or email sending function
async function sendVerificationEmail(email: string, token: string) {
  // Try to get user's profile name from database
  let userName = null;
  
  try {
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();
    
    if (user) {
      // Check if profile exists
      const { data: profile } = await supabase
        .from('user_profiles') // or your profile table name
        .select('first_name, last_name')
        .eq('user_id', user.id)
        .single();
      
      if (profile && profile.first_name) {
        userName = profile.first_name;
      }
    }
  } catch (error) {
    console.log('No profile found yet, using generic greeting');
  }
  
  // Use actual name if available, otherwise use generic greeting
  const greeting = userName 
    ? `Welcome, ${userName}!` 
    : `Welcome to Thrive!`;
  
  const emailHtml = `
    <h2>${greeting}</h2>
    <p>Click the link below to verify your email address:</p>
    <a href="${verificationLink}">Verify Email</a>
  `;
  
  // Send email...
}
```

**Pros:**
- ✅ Uses actual profile name if it exists
- ✅ Falls back to generic greeting if no profile yet
- ✅ Works for both new signups and profile updates

**Cons:**
- ⚠️ Requires database query (slight performance impact)

---

### Option 2: Don't Include Name in Initial Verification Email

Use a generic greeting for the initial verification email:

**Backend Code Fix:**

```typescript
// For initial signup verification email
const emailHtml = `
  <h2>Welcome to Thrive!</h2>
  <p>Click the link below to verify your email address:</p>
  <a href="${verificationLink}">Verify Email</a>
  <p>After verification, you'll complete your profile setup.</p>
`;
```

**Pros:**
- ✅ Simple fix
- ✅ No database query needed
- ✅ Clear that profile comes next

**Cons:**
- ⚠️ Less personalized

---

### Option 3: Send Verification Email After Profile Creation

Move the verification email to send **after** the profile is created:

**Flow Change:**
```
Signup (email only)
  ↓
Profile Created (firstName: "Aussie")
  ↓
Verification Email Sent (with correct name) ✅
```

**Backend Code Fix:**

```typescript
// In your save-profile endpoint
if (method === 'POST' && path === '/api/auth/save-profile') {
  // ... save profile code ...
  
  // If this is the first time creating a profile, send verification email
  if (isNewProfile && !user.is_verified) {
    await sendVerificationEmail(user.email, verificationToken, profile.first_name);
  }
  
  // ... rest of code ...
}
```

**Pros:**
- ✅ Always has the correct name
- ✅ More personalized

**Cons:**
- ⚠️ Changes the user flow (email sent later)
- ⚠️ User might expect email immediately after signup

---

## 🔧 Recommended Fix: Option 1

**Best approach:** Check for profile name when sending email, but use generic greeting if not available yet.

### Backend Implementation

**Location:** Your Supabase Edge Function email sending code

**Before:**
```typescript
// Extracting name from email (WRONG)
const name = email.split('@')[0]; // "stephanie@phixsolutions.com" → "stephanie"
const greeting = `Welcome, ${name}!`;
```

**After:**
```typescript
// Try to get actual profile name
let userName = null;
try {
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();
  
  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles') // Adjust table name if different
      .select('first_name')
      .eq('user_id', user.id)
      .single();
    
    if (profile?.first_name) {
      userName = profile.first_name;
    }
  }
} catch (error) {
  // Profile doesn't exist yet, that's okay
}

// Use actual name or generic greeting
const greeting = userName 
  ? `Welcome, ${userName}!` 
  : `Welcome to Thrive!`;

const emailHtml = `
  <h2>${greeting}</h2>
  <p>Click the link below to verify your email address:</p>
  <a href="${verificationLink}">Verify Email</a>
`;
```

---

## 🧪 Testing

After implementing the fix:

1. **Test new signup:**
   - Sign up with email only
   - Check email → Should say "Welcome to Thrive!" (generic)
   - Create profile with name "Aussie"
   - Email already sent, but future emails will use "Aussie"

2. **Test resend verification:**
   - After profile is created, resend verification email
   - Should say "Welcome, Aussie!" ✅

3. **Test profile update:**
   - Update profile name
   - Any new emails should use updated name

---

## 📝 Database Schema Check

Make sure your backend can access the profile name. Check your database schema:

**Required Tables:**
- `users` table with `id` and `email`
- `user_profiles` table (or similar) with:
  - `user_id` (foreign key to users.id)
  - `first_name` (or `firstName`)

**If using Supabase Auth metadata instead:**
```typescript
// Get name from user metadata
const { data: { user } } = await supabase.auth.getUserByEmail(email);
const userName = user?.user_metadata?.firstName || user?.user_metadata?.first_name;
```

---

## 🎯 Quick Fix (Temporary)

If you can't update the backend immediately, you can at least make the email template not extract the name from the email:

**Change:**
```typescript
// From this:
const name = email.split('@')[0];
const greeting = `Welcome, ${name}!`;

// To this:
const greeting = `Welcome to Thrive!`;
```

This removes the incorrect name extraction until you can implement the proper fix.

---

## ✅ Summary

**The Problem:**
- Verification email sent before profile is created
- Backend extracts name from email address (wrong)
- Profile name "Aussie" is created later (too late)

**The Solution:**
- Check database for profile name when sending email
- Use actual name if available
- Use generic greeting if profile doesn't exist yet

**Files to Update:**
- Backend email sending function (Supabase Edge Function)
- Email template code
- Possibly the signup endpoint if it sends the email

---

## 🔍 Where to Find the Code

The email sending code is likely in:
- `supabase/functions/api/index.ts` (or similar)
- Look for `sendEmail` or `sendVerificationEmail` function
- Check the signup endpoint (`POST /api/auth/signup`)

---

Need help finding the exact backend code? Let me know and I can help locate it!

