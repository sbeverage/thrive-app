# 🔴 Save Profile 500 Error - Diagnostic & Fix Guide

## 🚨 Current Error

**Error from Terminal:**
```
ERROR  ❌ Backend save failed (500 Server Error):
ERROR     Error message: Failed to save profile
ERROR     Response data: {"error": "Failed to save profile"}
```

**Request Details:**
- **Endpoint:** `POST /api/auth/save-profile`
- **Status:** 500 Internal Server Error
- **Response:** Generic error message (not helpful for debugging)

---

## 🔍 Root Cause Analysis

The backend is returning a generic error message, which means the actual error is being caught and hidden. The most common causes are:

### 1. **Column Name Mismatch** (Most Likely)
- App sends: `firstName`, `lastName` (camelCase)
- Database expects: `first_name`, `last_name` (snake_case)
- **Result:** Database error → Generic 500 response

### 2. **Missing Database Columns**
- Backend tries to update columns that don't exist
- Common missing columns: `first_name`, `last_name`, `phone`, `profile_image`, `profile_image_url`
- **Result:** Database error → Generic 500 response

### 3. **JWT Token Validation Issue**
- Token extraction or validation fails
- **Result:** Auth error → Generic 500 response

### 4. **Data Type Mismatch**
- Wrong data type (e.g., sending string to integer column)
- **Result:** Database error → Generic 500 response

---

## ✅ Step-by-Step Fix

### Step 1: Check Supabase Backend Logs (CRITICAL)

The backend logs will show the **actual error**, not the generic message.

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard
2. **Select your project**: `mdqgndyhzlnwojtubouh`
3. **Navigate to**: **Edge Functions** → **api** (or your function name)
4. **Click "Logs" tab**
5. **Filter by time** - Look for errors around when you tried to save the profile
6. **Look for**:
   - Stack traces
   - Database errors
   - Column name errors
   - Type errors

**What to look for:**
```
❌ column "firstname" does not exist
❌ column users.first_name does not exist
❌ null value in column "user_id" violates not-null constraint
❌ invalid input syntax for type integer: "abc"
```

---

### Step 2: Verify Database Schema

Check what columns actually exist in your `users` table:

**In Supabase Dashboard:**
1. Go to **Database** → **Tables** → **users**
2. Check the **Columns** tab
3. Note the exact column names (snake_case vs camelCase)

**Or run SQL:**
```sql
-- Check users table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY column_name;
```

**Expected columns for save-profile:**
- `id` (UUID or integer)
- `first_name` OR `firstName` (check which one exists)
- `last_name` OR `lastName` (check which one exists)
- `email` (string)
- `phone` (string, nullable)
- `profile_image` OR `profileImage` (string, nullable)
- `profile_image_url` OR `profileImageUrl` (string, nullable)
- `updated_at` (timestamp)

---

### Step 3: Fix Backend Code

The backend needs to:
1. **Map camelCase to snake_case** (or vice versa)
2. **Handle missing columns gracefully**
3. **Return detailed error messages** (for debugging)

**Example Backend Fix:**

```typescript
// In your Supabase Edge Function: supabase/functions/api/index.ts

// POST /api/auth/save-profile
if (method === 'POST' && path === '/api/auth/save-profile') {
  try {
    // 1. Verify JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // 2. Parse request body (camelCase from app)
    const body = await req.json();
    const { 
      firstName, 
      lastName, 
      phone, 
      email,
      profileImage,
      profileImageUrl
    } = body;

    // 3. Prepare update data (convert to snake_case for database)
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Map camelCase to snake_case (adjust based on your actual column names)
    if (firstName !== undefined) updateData.first_name = firstName;
    if (lastName !== undefined) updateData.last_name = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (profileImage !== undefined) updateData.profile_image = profileImage;
    if (profileImageUrl !== undefined) updateData.profile_image_url = profileImageUrl;

    // 4. Update user profile in database
    const { data: profile, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      // Log the ACTUAL error (don't hide it!)
      console.error('❌ Database update error:', {
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint,
      });

      // Return detailed error for debugging
      return new Response(
        JSON.stringify({ 
          error: 'Failed to save profile',
          details: updateError.message, // Include actual error
          code: updateError.code
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Profile saved successfully',
        profile: {
          firstName: profile.first_name || profile.firstName,
          lastName: profile.last_name || profile.lastName,
          email: profile.email,
          phone: profile.phone,
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    // Log unexpected errors
    console.error('❌ Unexpected error in save-profile:', {
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
}
```

**Key Changes:**
1. ✅ Map camelCase → snake_case
2. ✅ Log actual errors (not generic messages)
3. ✅ Return detailed error messages (for debugging)
4. ✅ Handle missing fields gracefully

---

### Step 4: Add Missing Database Columns (If Needed)

If your database is missing required columns, add them:

```sql
-- Add missing columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS profile_image VARCHAR(500),
ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
```

**Or if your columns use camelCase:**
```sql
-- Check what naming convention you're using
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name LIKE '%name%' OR column_name LIKE '%Name%';
```

---

### Step 5: Test the Fix

**Test with curl:**
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

**Expected Success Response:**
```json
{
  "success": true,
  "message": "Profile saved successfully",
  "profile": {
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "phone": "555-1234"
  }
}
```

**If you still get an error, check:**
- The error message should now be **detailed** (not generic)
- Check Supabase logs for the actual error
- Verify column names match

---

## 🔧 Quick Diagnostic Checklist

Run through this checklist to identify the issue:

- [ ] **Check Supabase logs** - Find the actual error message
- [ ] **Verify column names** - Check if database uses snake_case or camelCase
- [ ] **Check missing columns** - Ensure all required columns exist
- [ ] **Verify JWT token** - Make sure token is valid and being sent
- [ ] **Test with curl** - Isolate the issue from the app
- [ ] **Check data types** - Ensure data types match database schema

---

## 📋 Common Error Messages & Solutions

### Error: `column "firstname" does not exist`
**Solution:** Backend needs to map `firstName` → `first_name`

### Error: `column users.first_name does not exist`
**Solution:** Add the column: `ALTER TABLE users ADD COLUMN first_name VARCHAR(255);`

### Error: `null value in column "user_id" violates not-null constraint`
**Solution:** Backend isn't extracting user ID correctly from JWT token

### Error: `invalid input syntax for type integer`
**Solution:** Data type mismatch - check what the database expects vs what you're sending

---

## 🎯 Immediate Action Items

1. **Check Supabase logs NOW** - This will show the actual error
2. **Verify database schema** - Check column names and types
3. **Update backend code** - Add proper error logging and column mapping
4. **Test the fix** - Use curl to test before trying in the app
5. **Deploy updated backend** - Deploy the fixed Edge Function

---

## 🆘 Still Stuck?

If you're still getting errors after following these steps:

1. **Share the actual error from Supabase logs** (not the generic message)
2. **Share your database schema** (column names and types)
3. **Share your backend code** (the save-profile endpoint)
4. **Share the exact request** being sent (from app or curl)

With this information, I can provide a more specific fix!

---

## 📝 Notes

- The app currently handles this gracefully (saves locally, doesn't crash)
- But profile data won't sync to backend until this is fixed
- This is a **backend issue**, not an app issue
- The backend needs better error logging to help debug



