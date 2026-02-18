# Save Profile Endpoint - 404 Error Fix

## 🔍 Current Issue

The mobile app is receiving a **404 error** when trying to save user profile data:

```
ERROR  Save profile failed: [AxiosError: Request failed with status code 404]
```

## 📋 Root Cause

The endpoint `POST /api/auth/save-profile` is **not implemented** in the Supabase Edge Function backend.

**Note:** The app gracefully handles this by falling back to local storage, but profile data is not synced to the backend.

## ✅ Solution: Add Endpoint to Supabase Edge Function

Since your backend is a **Supabase Edge Function** (not Express.js), you need to add the save profile endpoint to your Edge Function code.

### Step 1: Locate Your Supabase Edge Function

Your Edge Function should be located at:
```
supabase/functions/api/index.ts
```

### Step 2: Add the Save Profile Endpoint

Add this route handler to your Edge Function:

```typescript
// POST /api/auth/save-profile
if (method === 'POST' && path === '/api/auth/save-profile') {
  try {
    // 1. Verify JWT token (required for this endpoint)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7);
    // Verify JWT and extract user ID
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // 2. Parse request body
    const body = await req.json();
    const { 
      firstName, 
      lastName, 
      phone, 
      email,
      profileImage,
      profileImageUrl,
      monthlyDonation,
      points,
      totalSavings
    } = body;

    // 3. Update user profile in database
    // Option A: If you have a user_profiles table
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        email: email || user.email,
        profile_image: profileImage || profileImageUrl,
        monthly_donation: monthlyDonation,
        points: points,
        total_savings: totalSavings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (profileError) {
      console.error('Profile update error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to save profile' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Option B: If you're using Supabase Auth metadata
    // Update user metadata instead
    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      {
        user_metadata: {
          firstName: firstName,
          lastName: lastName,
          phone: phone,
          profileImage: profileImage || profileImageUrl,
          monthlyDonation: monthlyDonation,
          points: points,
          totalSavings: totalSavings,
        }
      }
    );

    if (updateError) {
      console.error('User update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to save profile' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Profile saved successfully',
        profile: profile || {
          firstName,
          lastName,
          phone,
          email: email || user.email,
          profileImage: profileImage || profileImageUrl,
        }
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Save profile error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Step 3: Database Schema Requirements

You'll need one of these approaches:

#### Option A: User Profiles Table (Recommended)

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  profile_image VARCHAR(500),
  profile_image_url VARCHAR(500),
  monthly_donation DECIMAL(10,2) DEFAULT 0,
  points INTEGER DEFAULT 0,
  total_savings DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
```

#### Option B: Use Supabase Auth User Metadata

If you prefer to store profile data in Supabase Auth's `user_metadata`, you can use the `supabase.auth.admin.updateUserById()` method shown in Option B above.

**Note:** Using `user_metadata` has limitations:
- Limited to JSON data
- May have size restrictions
- Less queryable than a separate table

### Step 4: Update Route Matching Logic

Make sure your Edge Function route matching includes this pattern. Your main handler should look something like:

```typescript
export default async function handler(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // ... existing route handlers ...

  // Add save profile route
  if (method === 'POST' && path === '/api/auth/save-profile') {
    // ... save profile handler code from Step 2 ...
  }

  // 404 for unmatched routes
  return new Response(
    JSON.stringify({ error: 'Route not found' }),
    { status: 404, headers: { 'Content-Type': 'application/json' } }
  );
}
```

### Step 5: Deploy the Edge Function

After adding the endpoint, deploy your Edge Function:

```bash
# If using Supabase CLI
supabase functions deploy api

# Or deploy via Supabase Dashboard
```

## 📝 Request/Response Format

### Request
```http
POST /api/auth/save-profile
Headers:
  Content-Type: application/json
  apikey: YOUR_SUPABASE_ANON_KEY
  Authorization: Bearer YOUR_JWT_TOKEN

Body:
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "(555) 123-4567",
  "email": "john@example.com",
  "profileImage": "https://...",
  "profileImageUrl": "https://...",
  "monthlyDonation": 15.00,
  "points": 25,
  "totalSavings": 5.00
}
```

### Success Response (200)
```json
{
  "success": true,
  "message": "Profile saved successfully",
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "phone": "(555) 123-4567",
    "email": "john@example.com",
    "profileImage": "https://..."
  }
}
```

### Error Responses

**401 Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**500 Server Error:**
```json
{
  "error": "Failed to save profile"
}
```

## 🧪 Testing

After deploying, test the endpoint:

```bash
curl -X POST https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1/api/auth/save-profile \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phone": "(555) 123-4567",
    "email": "john@example.com"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Profile saved successfully",
  "profile": { ... }
}
```

## 🔍 Current App Behavior

**Good News:** The app already handles this gracefully:
- ✅ Profile data is saved to local storage (AsyncStorage)
- ✅ App continues to work normally
- ✅ Error is logged but doesn't break the user experience
- ⚠️ Profile data is just not synced to backend

**After Implementation:**
- ✅ Profile data will sync to backend
- ✅ Profile can be retrieved from backend
- ✅ Data persists across devices (if user logs in on different device)

## 📝 Notes

1. **Authentication**: This endpoint requires JWT authentication
2. **Data Validation**: Consider adding validation for required fields (firstName, lastName, phone)
3. **Image URLs**: The endpoint accepts both `profileImage` and `profileImageUrl` for compatibility
4. **Upsert Logic**: Using `upsert` ensures the profile is created if it doesn't exist, or updated if it does

## 🔄 Related Endpoints

- `GET /api/auth/profile` - Get user profile (already working ✅)
- `POST /api/auth/save-profile` - Save user profile (needs implementation ❌)

## ✅ Verification Checklist

After implementing, verify:
1. ✅ Endpoint returns 200 (not 404)
2. ✅ Profile data is saved to database
3. ✅ Profile can be retrieved with `GET /api/auth/profile`
4. ✅ Mobile app successfully saves profile to backend
5. ✅ Error handling works correctly










