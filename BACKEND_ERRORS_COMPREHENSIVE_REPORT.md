# 🔴 Backend Errors - Comprehensive Fix Report

**Date:** January 2025  
**Status:** All Backend Issues Documented for Batch Fix

---

## 📋 Executive Summary

This report documents all known backend errors that need to be fixed. Fix them in order of priority for the best results.

**Total Issues:** 5  
**Critical:** 2  
**High Priority:** 2  
**Medium Priority:** 1

---

## 🔴 CRITICAL ISSUES (Fix First)

### Issue #1: Save Profile Endpoint - 500 Server Error

**Status:** ❌ **CRITICAL - BLOCKING USER DATA SYNC**

**Error Details:**
```
POST /api/auth/save-profile
Status: 500 Internal Server Error
Response: {"error": "Failed to save profile"}
```

**What's Happening:**
- User creates profile with name "Aussie Bear"
- App tries to save to backend
- Backend returns 500 error
- Data saved locally only (not synced to backend)

**Impact:**
- ❌ User profile data not synced to backend
- ❌ Data won't persist across devices
- ❌ Data lost if user clears app data
- ❌ Profile image uploads fail

**Root Cause:**
Unknown - Need to check backend logs. Possible causes:
1. Database column name mismatch (snake_case vs camelCase)
2. Missing required columns in database
3. Data type mismatch
4. Null reference error in backend code
5. JWT token validation issue

**Fix Steps:**

1. **Check Backend Logs:**
   - Go to Supabase Dashboard → Edge Functions → api → Logs
   - Look for errors around the time of save-profile request
   - Find the actual error message (not just "Failed to save profile")

2. **Verify Database Schema:**
   ```sql
   -- Check what columns exist in users table
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'users' 
   ORDER BY column_name;
   ```

3. **Check Backend Code:**
   - Location: `supabase/functions/api/index.ts` (or similar)
   - Find `POST /api/auth/save-profile` handler
   - Check what columns it's trying to update
   - Verify column names match database (snake_case vs camelCase)

4. **Common Issues to Check:**
   - Column names: `first_name` vs `firstName`
   - Missing columns: `profile_image`, `profile_image_url`, etc.
   - Data types: String vs Number, etc.
   - Null checks: Is user ID being extracted correctly?

**Expected Request:**
```json
{
  "firstName": "Aussie",
  "lastName": "Bear",
  "email": "stephanie@workatthrive.com",
  "phone": "(954) 871-4645",
  "profileImage": null,
  "profileImageUrl": null
}
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Profile saved successfully",
  "profile": {
    "firstName": "Aussie",
    "lastName": "Bear",
    "email": "stephanie@workatthrive.com",
    "phone": "(954) 871-4645"
  }
}
```

**Testing:**
```bash
curl -X POST "https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1/api/auth/save-profile" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "phone": "555-1234"
  }'
```

---

### Issue #2: Database Schema - Missing Columns (PARTIALLY FIXED)

**Status:** ⚠️ **PARTIALLY FIXED - VERIFY COMPLETE**

**What Was Fixed:**
- ✅ `email_verified_at` column added
- ✅ `latitude` column added  
- ✅ `longitude` column added

**SQL Already Run:**
```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
```

**Action Required:**
1. **Verify columns exist:**
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'users' 
     AND column_name IN ('email_verified_at', 'latitude', 'longitude');
   ```
   Should return 3 rows.

2. **Check for other missing columns:**
   - Backend might need: `first_name`, `last_name`, `profile_image`, `profile_image_url`
   - Verify these exist or add them:
   ```sql
   -- Check if these columns exist
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'users' 
     AND column_name IN ('first_name', 'last_name', 'profile_image', 'profile_image_url');
   ```

3. **Restart backend** after adding columns (if running locally)

---

## 🟠 HIGH PRIORITY ISSUES

### Issue #3: Email Verification - Wrong Name in Email

**Status:** ⚠️ **HIGH PRIORITY - USER EXPERIENCE**

**Error Details:**
- Email shows: "Welcome, stephanie"
- Should show: "Welcome, Aussie" (user's actual profile name)

**What's Happening:**
- Verification email sent immediately after signup (before profile created)
- Backend extracts name from email address: `stephanie@phixsolutions.com` → "stephanie"
- Profile name "Aussie" created later (too late)

**Root Cause:**
Backend email template extracts name from email address instead of checking database for profile name.

**Fix Steps:**

1. **Update Email Template in Backend:**
   - Location: Email sending function in Supabase Edge Function
   - Find where verification email is sent (signup endpoint)

2. **Check for Profile Name Before Sending:**
   ```typescript
   // In your email sending function
   async function sendVerificationEmail(email: string, token: string) {
     // Try to get user's profile name from database
     let userName = null;
     
     try {
       const { data: user } = await supabase
         .from('users')
         .select('id')
         .eq('email', email)
         .single();
       
       if (user) {
         // Check if profile exists (adjust table/column names as needed)
         const { data: profile } = await supabase
           .from('users') // or 'user_profiles' if separate table
           .select('first_name, last_name')
           .eq('id', user.id)
           .single();
         
         if (profile?.first_name) {
           userName = profile.first_name;
         }
       }
     } catch (error) {
       // Profile doesn't exist yet, that's okay
       console.log('No profile found yet, using generic greeting');
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
     
     // Send email...
   }
   ```

3. **Alternative Quick Fix:**
   If you can't check database, just use generic greeting:
   ```typescript
   const greeting = `Welcome to Thrive!`; // No name extraction
   ```

**Files to Update:**
- `supabase/functions/api/index.ts` - Signup endpoint email sending
- Email template code

---

### Issue #4: Email Verification - email_verified_at Not Updating

**Status:** ⚠️ **HIGH PRIORITY - VERIFY FIXED**

**Error Details:**
```
Could not find the 'email_verified_at' column of 'users' in the schema cache
```

**Status:**
- ✅ Column added via SQL
- ⚠️ Need to verify backend code is using it correctly

**Fix Steps:**

1. **Verify Column Exists:**
   ```sql
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'users' 
     AND column_name = 'email_verified_at';
   ```

2. **Check Backend Code:**
   - Find email verification endpoint
   - Verify it updates `email_verified_at`:
   ```typescript
   // When email is verified
   await supabase
     .from('users')
     .update({ 
       email_verified_at: new Date().toISOString(),
       is_verified: true  // If you also have this column
     })
     .eq('id', userId);
   ```

3. **Test Email Verification:**
   - Verify an email
   - Check database: `email_verified_at` should be set
   - No more "column not found" errors

---

## 🟡 MEDIUM PRIORITY ISSUES

### Issue #5: Backend Error Logging - Generic Error Messages

**Status:** ⚠️ **MEDIUM PRIORITY - DEBUGGING**

**Issue:**
Backend returns generic error messages like "Failed to save profile" without details, making debugging difficult.

**Fix Steps:**

1. **Improve Error Logging in Backend:**
   ```typescript
   // In save-profile endpoint
   try {
     // ... your code ...
     
     const { data, error } = await supabase.from('users').update(...);
     
     if (error) {
       console.error('❌ Database error:', {
         message: error.message,
         code: error.code,
         details: error.details,
         hint: error.hint,
       });
       
       return new Response(
         JSON.stringify({ 
           error: 'Failed to save profile',
           details: error.message, // Include actual error
           code: error.code
         }),
         { status: 500, headers: { 'Content-Type': 'application/json' } }
       );
     }
     
   } catch (error) {
     console.error('❌ Unexpected error:', {
       message: error.message,
       stack: error.stack,
       name: error.name,
     });
     
     return new Response(
       JSON.stringify({ 
         error: 'Internal server error',
         details: error.message // Include actual error for debugging
       }),
       { status: 500, headers: { 'Content-Type': 'application/json' } }
     );
   }
   ```

2. **Add Request Logging:**
   ```typescript
   console.log('📥 Received save-profile request:', {
     method: req.method,
     path: path,
     hasAuth: !!authHeader,
     userId: userId,
     body: await req.json(),
   });
   ```

**Note:** In production, don't expose detailed errors to users, but log them for debugging.

---

## 📋 Fix Checklist

### Database Schema
- [ ] Verify `email_verified_at` column exists
- [ ] Verify `latitude` column exists
- [ ] Verify `longitude` column exists
- [ ] Check if `first_name`, `last_name` columns exist
- [ ] Check if `profile_image`, `profile_image_url` columns exist
- [ ] Verify column names match backend code (snake_case vs camelCase)

### Save Profile Endpoint
- [ ] Check backend logs for actual error message
- [ ] Verify endpoint exists and is accessible
- [ ] Check JWT token validation works
- [ ] Verify database column names match backend code
- [ ] Test endpoint with curl
- [ ] Fix any database errors
- [ ] Improve error logging
- [ ] Test profile save from app

### Email Verification
- [ ] Fix email template to use profile name
- [ ] Verify `email_verified_at` column is updated
- [ ] Test email verification flow
- [ ] Check email shows correct name

### Error Handling
- [ ] Improve error messages in backend
- [ ] Add detailed logging
- [ ] Test error scenarios

---

## 🔍 How to Check Backend Logs

### Supabase Dashboard:
1. Go to **Supabase Dashboard** → Your Project
2. Navigate to **Edge Functions** → **api** (or your function name)
3. Click on **Logs** tab
4. Filter by time/error level
5. Look for errors around the time of failed requests

### Local Backend:
- Check the terminal where backend is running
- Look for error messages, stack traces
- Check for database errors

---

## 🧪 Testing After Fixes

### Test Save Profile:
```bash
curl -X POST "https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1/api/auth/save-profile" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "phone": "555-1234"
  }'
```

**Expected:** `200 OK` with profile data

### Test Email Verification:
1. Sign up new user
2. Check email - should show correct name (or generic greeting)
3. Click verification link
4. Check database - `email_verified_at` should be set

---

## 📝 Backend Code Locations

**Supabase Edge Function:**
- Main file: `supabase/functions/api/index.ts` (or similar)
- Save profile: Look for `POST /api/auth/save-profile`
- Email sending: Look for `sendVerificationEmail` or similar
- Email verification: Look for `GET /api/auth/verify-email`

**Database:**
- Table: `users`
- Check columns: `first_name`, `last_name`, `email`, `phone`, `profile_image`, `email_verified_at`, `latitude`, `longitude`

---

## 🎯 Priority Order

1. **FIRST:** Check backend logs for save-profile 500 error (Issue #1)
2. **SECOND:** Verify database columns exist (Issue #2)
3. **THIRD:** Fix email verification name (Issue #3)
4. **FOURTH:** Verify email_verified_at updates (Issue #4)
5. **FIFTH:** Improve error logging (Issue #5)

---

## 🆘 Need Help?

If you get stuck:
1. **Share backend logs** from Supabase Dashboard
2. **Share database schema** (column names and types)
3. **Share backend code** for save-profile endpoint
4. **Share curl test results** when testing endpoints

---

## 📚 Related Documentation

- `DATABASE_SCHEMA_FIXES.md` - Database column fixes
- `500_ERROR_DEBUG_GUIDE.md` - How to debug 500 errors
- `BACKEND_SAVE_FAILED_DIAGNOSTIC.md` - Save profile diagnostics
- `EMAIL_VERIFICATION_NAME_FIX.md` - Email name fix guide
- `SAVE_PROFILE_ENDPOINT_FIX.md` - Save profile implementation guide

---

**Good luck with the fixes!** 🚀


