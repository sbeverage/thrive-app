# 🔧 Android Build Troubleshooting Guide

## 🚨 Current Issue

**Error:** "Unknown error. See logs of the Install dependencies build phase for more information."

**Build Log:** https://expo.dev/accounts/sbeverage/projects/thrive-app/builds/614c2e3a-7c7d-4f25-a993-2c0bdf8f170c

---

## Step 1: Check Build Logs

**Most Important:** Check the actual error in the build logs:

1. **Go to the build log URL** (provided in terminal output)
2. **Or go to**: https://expo.dev/accounts/sbeverage/projects/thrive-app/builds
3. **Click on the failed build**
4. **Look for error messages** in the "Install dependencies" phase
5. **Share the error message** - that will tell us exactly what's wrong

---

## Common Causes & Fixes

### Issue 1: Package.json Dependencies Problem

**Symptoms:**
- Build fails during "Install dependencies"
- Error mentions specific package names
- Version conflicts

**Fix:**
1. **Check `package.json`** for problematic dependencies
2. **Update dependencies**:
   ```bash
   npm update
   ```
3. **Clear cache and reinstall**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
4. **Rebuild**

### Issue 2: Node Version Mismatch

**Symptoms:**
- Build fails with Node version errors
- Incompatible package versions

**Fix:**
1. **Check your local Node version**: `node --version`
2. **EAS uses Node 18** by default
3. **Add `.nvmrc` file** to specify Node version:
   ```bash
   echo "18" > .nvmrc
   ```
4. **Or update `eas.json`** to specify Node version:
   ```json
   {
     "build": {
       "production": {
         "node": "18.19.0"
       }
     }
   }
   ```

### Issue 3: Missing or Invalid Dependencies

**Symptoms:**
- Package not found errors
- Invalid package versions
- Peer dependency warnings

**Fix:**
1. **Check for missing packages**:
   ```bash
   npm install
   ```
2. **Verify all packages are valid**:
   ```bash
   npm audit
   ```
3. **Fix any vulnerabilities**:
   ```bash
   npm audit fix
   ```

### Issue 4: Native Module Issues

**Symptoms:**
- Android-specific package errors
- Native module compilation failures

**Fix:**
1. **Check for Android-specific packages** that might need configuration
2. **Verify all Expo packages are compatible**:
   ```bash
   npx expo install --check
   ```
3. **Update Expo packages**:
   ```bash
   npx expo install --fix
   ```

### Issue 5: Memory/Resource Issues

**Symptoms:**
- Build times out
- Out of memory errors

**Fix:**
1. **This is usually on EAS side** - try rebuilding
2. **If persistent**, contact EAS support

---

## Quick Fixes to Try

### Fix 1: Clean and Rebuild

```bash
# Clean everything
rm -rf node_modules
rm package-lock.json

# Reinstall
npm install

# Try build again
eas build --platform android --profile production
```

### Fix 2: Check Package.json

Make sure `package.json` is valid:
```bash
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))"
```

If this errors, your `package.json` has a syntax error.

### Fix 3: Update Expo and EAS CLI

```bash
# Update EAS CLI
npm install -g eas-cli@latest

# Update Expo
npx expo install expo@latest

# Update all Expo packages
npx expo install --fix
```

### Fix 4: Check for Conflicting Packages

Look for packages that might conflict:
- Multiple versions of the same package
- Incompatible React/React Native versions
- Native modules that need Android configuration

---

## Step-by-Step Debugging

### 1. Check Build Logs First

**Most Important:** The build logs will show the exact error. Check:
- What package failed to install?
- What error message appears?
- Is it a version conflict?
- Is it a missing dependency?

### 2. Test Locally First

Before building on EAS, test locally:
```bash
# Make sure dependencies install locally
npm install

# Check for errors
npm run lint

# Try running the app
npx expo start
```

If it works locally but fails on EAS, it's likely an EAS-specific issue.

### 3. Check EAS Build Configuration

Verify your `eas.json` is correct:
```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

### 4. Try Preview Build First

Test with a preview build (faster, less strict):
```bash
eas build --platform android --profile preview
```

If preview works but production doesn't, it's a production-specific config issue.

---

## Common Error Messages & Solutions

### "Package not found"
- **Fix**: Run `npm install` locally first
- **Fix**: Check package name is correct in `package.json`

### "Peer dependency conflict"
- **Fix**: Update conflicting packages
- **Fix**: Use `npm install --legacy-peer-deps` if needed

### "Invalid package.json"
- **Fix**: Check JSON syntax
- **Fix**: Validate with `node -e "JSON.parse(...)"`

### "Out of memory"
- **Fix**: Try rebuilding (might be temporary)
- **Fix**: Contact EAS support if persistent

### "Node version mismatch"
- **Fix**: Add `.nvmrc` file with Node version
- **Fix**: Update `eas.json` with Node version

---

## Next Steps

1. **Check the build logs** at the URL provided
2. **Share the actual error message** from the logs
3. **Try the quick fixes** above
4. **If still failing**, share:
   - The exact error from build logs
   - Your `package.json` (or relevant parts)
   - Any warnings from `npm install`

---

## Need More Help?

1. **Share the build log error** - The actual error message will tell us what's wrong
2. **Check EAS Dashboard** - More detailed logs available there
3. **Try preview build** - Sometimes preview builds work when production doesn't
4. **Contact EAS Support** - If it's an EAS infrastructure issue

---

The build logs will have the exact error - that's the key to fixing this! 🔍

