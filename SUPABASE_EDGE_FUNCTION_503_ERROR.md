# 🔧 Supabase Edge Function 503 BOOT_ERROR Fix

## 🚨 Current Issue

All API endpoints are returning **503 errors** with:
- **Error Code**: `BOOT_ERROR`
- **Message**: "Function failed to start (please check logs)"
- **Status**: 503 Service Unavailable

This means your **Supabase Edge Functions are failing to start**.

---

## 🔍 Root Causes

### 1. **Code Errors in Edge Function**
- Syntax errors
- Missing imports
- Type errors (TypeScript)
- Runtime errors during initialization

### 2. **Missing Dependencies**
- Dependencies not listed in `package.json`
- Version conflicts
- Missing environment variables

### 3. **Cold Start Timeout**
- Function takes too long to initialize
- Exceeds Supabase's cold start timeout (usually 10-30 seconds)

### 4. **Deployment Issues**
- Function not deployed
- Deployment failed silently
- Wrong function name/path

### 5. **Configuration Issues**
- Missing environment variables
- Incorrect function configuration
- Database connection issues

---

## ✅ Step-by-Step Fix

### Step 1: Check Supabase Dashboard Logs

**Most Important First Step:**

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard
2. **Select your project**: `mdqgndyhzlnwojtubouh`
3. **Navigate to**: **Edge Functions** → **api** (or your function name)
4. **Click "Logs" tab**
5. **Look for error messages** around the time of failed requests
6. **Check for**:
   - Stack traces
   - Import errors
   - Missing dependencies
   - Database connection errors

**The logs will show the exact error!**

### Step 2: Check Edge Function Code

Your Edge Function should be located at:
```
supabase/functions/api/index.ts
```

**Or if you have a separate backend repo:**
- Check your backend repository
- Look for the Edge Function code

**Common Issues to Check:**

1. **Syntax Errors**:
   ```typescript
   // ❌ Missing closing brace
   if (condition) {
     // code
   // Missing }
   
   // ✅ Correct
   if (condition) {
     // code
   }
   ```

2. **Missing Imports**:
   ```typescript
   // ❌ Using without import
   const response = await fetch(...);
   
   // ✅ With proper import (if needed)
   import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
   ```

3. **Missing Environment Variables**:
   ```typescript
   // ❌ Using undefined env var
   const apiKey = Deno.env.get('MISSING_KEY');
   
   // ✅ Check if exists
   const apiKey = Deno.env.get('API_KEY');
   if (!apiKey) {
     throw new Error('API_KEY not set');
   }
   ```

4. **Database Connection Issues**:
   ```typescript
   // ❌ Wrong connection string
   const client = createClient('wrong-url', 'wrong-key');
   
   // ✅ Use correct Supabase client
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
   const supabase = createClient(
     Deno.env.get('SUPABASE_URL')!,
     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
   );
   ```

### Step 3: Test Edge Function Locally

If you have the Edge Function code locally:

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref mdqgndyhzlnwojtubouh

# Serve function locally
supabase functions serve api

# Test the function
curl -X GET "http://localhost:54321/functions/v1/api/health" \
  -H "apikey: YOUR_ANON_KEY"
```

**This will show errors in your terminal!**

### Step 4: Check Function Deployment

1. **Go to Supabase Dashboard** → **Edge Functions**
2. **Check if your function is deployed**:
   - Should show "Active" status
   - Should have a recent deployment
3. **If not deployed or failed**:
   - Check deployment logs
   - Redeploy the function

### Step 5: Check Environment Variables

1. **Go to Supabase Dashboard** → **Project Settings** → **Edge Functions**
2. **Check environment variables**:
   - `SUPABASE_URL` (should be set automatically)
   - `SUPABASE_SERVICE_ROLE_KEY` (should be set automatically)
   - Any custom env vars your function needs
3. **Verify all required variables are set**

### Step 6: Check Function Configuration

**Check `supabase/functions/api/index.ts`** (or your function file):

```typescript
// ✅ Good structure
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    // Your code here
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## 🧪 Quick Diagnostic Tests

### Test 1: Simple Health Check

Create a minimal Edge Function to test:

```typescript
// supabase/functions/api/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  return new Response(
    JSON.stringify({ status: 'ok', message: 'Function is working' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

**Deploy and test:**
```bash
supabase functions deploy api
```

**If this works**, the issue is in your actual function code.

### Test 2: Check Function URL

Your function should be accessible at:
```
https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1/api
```

**Test with curl:**
```bash
curl -X GET "https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1/api/health" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY"
```

**Expected**: `200 OK` with response
**If 503**: Function is not starting (check logs)

---

## 🔧 Common Fixes

### Fix 1: Add Error Handling

Wrap your function in try-catch:

```typescript
serve(async (req) => {
  try {
    // Your code
  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { status: 500 }
    );
  }
});
```

### Fix 2: Check Dependencies

**If using Deno imports**, make sure URLs are correct:

```typescript
// ✅ Correct
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// ❌ Wrong version or URL
import { serve } from 'https://deno.land/std@0.100.0/http/server.ts';
```

### Fix 3: Reduce Cold Start Time

**If function takes too long to start:**

1. **Lazy load heavy dependencies**:
   ```typescript
   // ❌ Load at top level (slow)
   import heavyLibrary from './heavy-library.ts';
   
   // ✅ Load when needed (faster)
   const loadHeavy = async () => {
     return await import('./heavy-library.ts');
   };
   ```

2. **Optimize initialization**:
   - Move heavy operations inside request handler
   - Cache connections (Supabase client, etc.)

### Fix 4: Check Function Name

**Make sure function name matches:**

- **Function folder**: `supabase/functions/api/`
- **Function name in dashboard**: Should be `api`
- **URL path**: `/functions/v1/api`

**If mismatch**, either:
- Rename the function folder, OR
- Update the URL in your app

---

## 📋 Action Items

1. **✅ Check Supabase Dashboard logs** (MOST IMPORTANT)
   - Go to Edge Functions → api → Logs
   - Look for error messages
   - Share the error if you need help

2. **✅ Verify function is deployed**
   - Check Edge Functions dashboard
   - Should show "Active" status

3. **✅ Test with minimal function**
   - Create simple health check
   - Deploy and test
   - If works, issue is in your code

4. **✅ Check environment variables**
   - Verify all required vars are set
   - Check in Project Settings → Edge Functions

5. **✅ Review function code**
   - Check for syntax errors
   - Verify imports
   - Test locally if possible

---

## 🆘 Still Not Working?

**Share these details:**

1. **Error from Supabase Dashboard logs** (exact error message)
2. **Function code** (if you have access)
3. **Deployment status** (Active/Failed)
4. **Environment variables** (which ones are set)
5. **When it started failing** (recent change?)

---

## 🎯 Next Steps

1. **Check the Supabase Dashboard logs** - This will show the exact error
2. **Share the error message** - I can help fix it
3. **If function code is in a separate repo** - Check that repo for errors
4. **If you don't have access to the backend code** - You'll need to contact whoever manages the Supabase Edge Functions

---

**The Supabase Dashboard logs will tell us exactly what's wrong!** 🔍



