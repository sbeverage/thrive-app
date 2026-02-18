# 🔧 Database Schema Fixes

## 🚨 Errors Found

Your backend is trying to use database columns that don't exist:

1. **`email_verified_at`** - Column missing from `users` table
2. **`latitude`** - Column missing from `users` table (and possibly `longitude`)

---

## ❌ Error 1: `email_verified_at` Column Missing

**Error:**
```
Could not find the 'email_verified_at' column of 'users' in the schema cache
```

**What's happening:**
- Backend code is trying to update `email_verified_at` when email is verified
- This column doesn't exist in your `users` table

**Solution Options:**

### Option A: Add the Column (Recommended)

Add the `email_verified_at` column to your `users` table:

```sql
-- Add email_verified_at column
ALTER TABLE users 
ADD COLUMN email_verified_at TIMESTAMP WITH TIME ZONE;

-- Add index for faster queries
CREATE INDEX idx_users_email_verified_at ON users(email_verified_at);
```

### Option B: Use Existing Column

If you already have an `is_verified` boolean column, update your backend code to use that instead:

**Backend Code Change:**
```typescript
// Instead of:
await supabase
  .from('users')
  .update({ email_verified_at: new Date().toISOString() })
  .eq('id', userId);

// Use:
await supabase
  .from('users')
  .update({ is_verified: true })
  .eq('id', userId);
```

---

## ❌ Error 2: `latitude` Column Missing

**Error:**
```
column users.latitude does not exist
```

**What's happening:**
- Backend code is trying to save location data (latitude/longitude) to `users` table
- These columns don't exist

**Solution Options:**

### Option A: Add Location Columns (Recommended)

Add location columns to your `users` table:

```sql
-- Add location columns
ALTER TABLE users 
ADD COLUMN latitude DECIMAL(10, 8),
ADD COLUMN longitude DECIMAL(11, 8);

-- Add index for location-based queries
CREATE INDEX idx_users_location ON users(latitude, longitude);
```

**Note:** `DECIMAL(10, 8)` for latitude allows values from -90.00000000 to 90.00000000
**Note:** `DECIMAL(11, 8)` for longitude allows values from -180.00000000 to 180.00000000

### Option B: Store Location in Separate Table

If you prefer to keep location data separate:

```sql
-- Create location table
CREATE TABLE user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  city VARCHAR(255),
  state VARCHAR(100),
  zip_code VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_user_locations_user_id ON user_locations(user_id);
```

Then update your backend to save location to this table instead.

### Option C: Remove Location from Save Profile

If you don't need to store precise coordinates, update your backend to not save latitude/longitude:

**Backend Code Change:**
```typescript
// In save-profile endpoint, remove latitude/longitude:
const { 
  firstName, 
  lastName, 
  phone, 
  email,
  profileImage,
  profileImageUrl,
  // Remove these:
  // latitude,
  // longitude,
} = body;

// Only save location if you have a separate location table
```

---

## 🔍 How to Check Your Current Schema

### In Supabase Dashboard:

1. Go to **Database** → **Tables**
2. Click on **`users`** table
3. Check **Columns** tab
4. See what columns currently exist

### Or Run SQL Query:

```sql
-- Check users table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
```

---

## ✅ Complete Fix: Add Missing Columns

Run this SQL in your Supabase SQL Editor:

```sql
-- 1. Add email_verified_at column
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

-- 2. Add location columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

-- 3. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email_verified_at ON users(email_verified_at);
CREATE INDEX IF NOT EXISTS idx_users_location ON users(latitude, longitude);

-- 4. Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('email_verified_at', 'latitude', 'longitude');
```

---

## 🔧 Backend Code Updates Needed

After adding the columns, make sure your backend code handles them correctly:

### Email Verification Update:

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

### Save Profile Update:

```typescript
// In save-profile endpoint
const { 
  firstName, 
  lastName, 
  phone, 
  email,
  profileImage,
  profileImageUrl,
  latitude,    // Now this column exists
  longitude,   // Now this column exists
  city,
  state,
  zipCode,
} = body;

await supabase
  .from('users')
  .update({
    first_name: firstName,
    last_name: lastName,
    phone: phone,
    email: email,
    profile_image: profileImage || profileImageUrl,
    latitude: latitude ? parseFloat(latitude) : null,
    longitude: longitude ? parseFloat(longitude) : null,
    city: city,
    state: state,
    zip_code: zipCode,
    updated_at: new Date().toISOString(),
  })
  .eq('id', userId);
```

---

## 🧪 Testing After Fix

1. **Test Email Verification:**
   - Verify an email
   - Check that `email_verified_at` is set in database
   - No more "column not found" errors

2. **Test Profile Save:**
   - Save profile with location data
   - Check that `latitude` and `longitude` are saved
   - No more "column not found" errors

3. **Check Database:**
   - Verify columns exist in Supabase Dashboard
   - Verify data is being saved correctly

---

## 📋 Alternative: Check What Backend Expects

If you're not sure what columns your backend needs, check your backend code:

1. **Find save-profile endpoint** in your Supabase Edge Function
2. **Look for database updates** - see what columns it's trying to update
3. **Match your schema** to what the code expects

**Common columns your backend might need:**
- `first_name` (or `firstName`)
- `last_name` (or `lastName`)
- `phone`
- `email`
- `profile_image` (or `profileImage`)
- `profile_image_url` (or `profileImageUrl`)
- `latitude`
- `longitude`
- `city`
- `state`
- `zip_code` (or `zipCode`)
- `email_verified_at`
- `is_verified`
- `updated_at`
- `created_at`

---

## 🎯 Quick Fix Summary

**Run this SQL to add missing columns:**

```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
```

**Then restart your backend** and test again!

---

## 🆘 If You Still Get Errors

1. **Check exact column names** - Backend might use `snake_case` vs `camelCase`
2. **Check table name** - Make sure it's `users` not `user` or `user_profiles`
3. **Check backend logs** - See exactly what column it's trying to access
4. **Verify migration ran** - Check Supabase Dashboard to confirm columns exist

---

## 📝 Related Issues

These schema issues are also related to:
- **500 Error on save-profile** - Missing columns cause database errors
- **Email verification not updating** - Missing `email_verified_at` column

Fixing these will resolve multiple issues at once!

