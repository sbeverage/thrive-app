# 🤖 Google Play Store Setup Guide

## 🎯 Overview

This guide walks you through getting your app from development to Google Play Store, similar to the iOS TestFlight/App Store process.

---

## 📋 Prerequisites Checklist

Before starting, make sure you have:
- [ ] Google Play Console account ($25 one-time registration fee)
- [ ] EAS CLI installed (`npm install -g eas-cli`)
- [ ] Logged into EAS (`eas login`)
- [ ] Your app code ready for production

---

## Step 1: Set Up Google Play Console

### 1.1 Create Google Play Developer Account

1. **Go to Google Play Console**: https://play.google.com/console
2. **Sign in** with your Google account
3. **Pay registration fee**: $25 one-time (if not already paid)
4. **Complete account setup**:
   - Accept Developer Program Policies
   - Complete account details
   - Set up payment profile

### 1.2 Create Your App in Play Console

1. **Click "Create app"** in Play Console
2. **Fill in the form**:
   - **App name**: "THRIVE Initiative" (or your app name)
   - **Default language**: English (or your language)
   - **App or game**: App
   - **Free or paid**: Free (or Paid)
   - **Declare that you comply with export laws**: Check the box
3. **Click "Create app"**

---

## Step 2: Update Your App Configuration

### 2.1 Update `app.json` for Android

You need to add a **package name** (similar to bundle identifier for iOS):

```json
{
  "expo": {
    "name": "THRIVE Initiative",
    "slug": "thrive-app",
    "version": "1.0.0",
    "android": {
      "package": "com.thriveinitiative.app",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/piggy-with-flowers.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ]
    }
  }
}
```

**Important Notes:**
- **Package name** must be unique (like `com.thriveinitiative.app`)
- **Cannot be changed** after first release
- Use reverse domain notation: `com.yourcompany.appname`
- **versionCode** must be an integer that increments with each release (1, 2, 3, etc.)

### 2.2 Update `eas.json` for Android Production

Add Android configuration to your `eas.json`:

```json
{
  "cli": {
    "version": ">= 16.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "ios": {
        "simulator": false
      },
      "android": {
        "buildType": "apk"  // or "aab" for App Bundle (recommended for Play Store)
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./path/to/service-account-key.json",
        "track": "internal"  // or "alpha", "beta", "production"
      }
    }
  }
}
```

**Note:** For Google Play Store, **App Bundle (AAB)** is recommended over APK:
- Smaller download size
- Better optimization
- Required for new apps (as of August 2021)

Change `"buildType": "apk"` to `"buildType": "aab"` for production builds.

---

## Step 3: Set Up App Signing

### 3.1 Google Play App Signing (Recommended)

**Option A: Let Google Manage Signing (Easiest)**

1. **EAS will handle this automatically** when you build
2. **Google Play will manage your signing key**
3. **You don't need to manage keys yourself**

**This is the recommended approach** - Google handles everything!

### 3.2 Manual Signing (If Needed)

If you need to manage your own signing key:

1. **Generate a keystore** (EAS can do this automatically)
2. **Store it securely** (EAS stores it for you)
3. **Use it for all builds**

**EAS handles this automatically** - you don't need to do anything!

---

## Step 4: Build Your App for Google Play

### 4.1 First Build (Preview/Testing)

For initial testing:

```bash
eas build --platform android --profile preview
```

**What happens:**
- Builds your app in the cloud (10-20 minutes)
- Creates an `.apk` file
- Provides a direct download link

### 4.2 Production Build (For Play Store)

For Google Play Store submission:

```bash
eas build --platform android --profile production
```

**What happens:**
- Builds your app in the cloud (10-20 minutes)
- Creates an `.aab` (App Bundle) file
- Ready for Play Store upload

**During build:**
- EAS will ask: "Would you like to configure credentials now?" → **Yes**
- EAS will ask: "How would you like to upload your credentials?" → **Automatic**
- EAS automatically creates and manages your signing key

---

## Step 5: Set Up Google Play Service Account (For Automatic Submission)

### 5.1 Create Service Account

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create a new project** (or select existing)
3. **Enable Google Play Android Developer API**:
   - APIs & Services → Library
   - Search for "Google Play Android Developer API"
   - Click "Enable"
4. **Create Service Account**:
   - IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Name: "EAS Submit" (or any name)
   - Click "Create and Continue"
   - Skip role assignment (click "Continue")
   - Click "Done"
5. **Create Key**:
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Choose "JSON"
   - Download the key file
6. **Link to Play Console**:
   - Go to Google Play Console → Setup → API access
   - Find your service account
   - Click "Grant access"
   - Select permissions: **Release apps** and **View app information**
   - Click "Invite user"

### 5.2 Add Service Account to EAS

1. **Save the JSON key file** in your project (e.g., `google-play-service-account.json`)
2. **Add to `.gitignore`** (don't commit this file!)
3. **Update `eas.json`**:
   ```json
   {
     "submit": {
       "production": {
         "android": {
           "serviceAccountKeyPath": "./google-play-service-account.json",
           "track": "internal"
         }
       }
     }
   }
   ```

---

## Step 6: Submit to Google Play Store

### 6.1 Manual Submission (Easiest for First Time)

1. **Go to Google Play Console**: https://play.google.com/console
2. **Select your app**
3. **Go to "Production"** (or "Internal testing" / "Closed testing" / "Open testing")
4. **Click "Create new release"**
5. **Upload your `.aab` file**:
   - Download from EAS build page
   - Drag and drop into Play Console
6. **Fill in release notes**
7. **Review and roll out**

### 6.2 Automatic Submission (After Setup)

After setting up service account:

```bash
eas submit --platform android --latest
```

**What happens:**
- EAS automatically uploads your build to Play Console
- Submits to the track you specified in `eas.json`

---

## Step 7: Complete Play Store Listing

### 7.1 App Content

**Required:**
- [ ] **App name**: "THRIVE Initiative" (50 characters max)
- [ ] **Short description**: Brief tagline (80 characters max)
- [ ] **Full description**: Detailed description (4000 characters max)
- [ ] **App icon**: 512x512px PNG (no transparency)
- [ ] **Feature graphic**: 1024x500px PNG (for Play Store banner)

### 7.2 Screenshots (Required)

You need screenshots for different device sizes:

**Required:**
- [ ] **Phone**: At least 2 screenshots (16:9 or 9:16)
  - Minimum: 320px height
  - Maximum: 3840px height
- [ ] **7-inch tablet** (optional but recommended)
- [ ] **10-inch tablet** (optional but recommended)

**Screenshot Sizes:**
- Phone: 1080x1920px (portrait) or 1920x1080px (landscape)
- 7" tablet: 1200x1920px
- 10" tablet: 1600x2560px

### 7.3 Privacy Policy (Required)

- [ ] **Privacy Policy URL** (required)
  - Must be publicly accessible
  - Must cover data collection and usage
  - Example: `https://thriveinitiative.com/privacy`

### 7.4 App Category

- [ ] **Category**: Select appropriate category
  - Lifestyle, Finance, Shopping, etc.
- [ ] **Tags**: Add relevant tags

### 7.5 Content Rating

- [ ] **Complete content rating questionnaire**
- [ ] **Get rating** (usually automatic)
- [ ] **Age rating**: Based on questionnaire

### 7.6 Target Audience

- [ ] **Target audience**: All ages, or specific age group
- [ ] **Content guidelines**: Confirm compliance

### 7.7 Data Safety

**Required section** - You must declare:
- [ ] What data you collect
- [ ] How you use it
- [ ] Whether you share it with third parties
- [ ] Security practices

**Data Types to Declare:**
- ✅ Location (if using location services)
- ✅ Email Address (user accounts)
- ✅ Phone Number (if collected)
- ✅ Payment Info (Stripe)
- ✅ User Content (profile pictures, etc.)

---

## Step 8: Testing Tracks

Google Play has multiple testing tracks:

### 8.1 Internal Testing (Fastest)

- **Up to 100 testers**
- **No review required**
- **Instant availability**
- **Best for**: Quick testing with your team

**Setup:**
1. Go to Play Console → Internal testing
2. Create release
3. Add testers (email addresses)
4. Testers get email with Play Store link

### 8.2 Closed Testing (Beta)

- **Up to thousands of testers**
- **Requires review** (usually 1-3 days)
- **More structured**
- **Best for**: Wider beta testing

### 8.3 Open Testing (Public Beta)

- **Unlimited testers**
- **Requires review**
- **Publicly visible**
- **Best for**: Public beta program

### 8.4 Production

- **Public release**
- **Requires review** (1-7 days typically)
- **Available to everyone**
- **Best for**: Final release

---

## Step 9: Review Process

### 9.1 Review Timeline

- **Internal testing**: Instant (no review)
- **Closed/Open testing**: 1-3 days
- **Production**: 1-7 days (usually 1-3 days)

### 9.2 Common Rejection Reasons

**To Avoid:**
- ❌ Missing privacy policy
- ❌ Incomplete app information
- ❌ App crashes during review
- ❌ Broken functionality
- ❌ Missing required permissions explanations
- ❌ Incomplete Data Safety section
- ❌ Violation of content policies

**If Rejected:**
1. Read the feedback carefully
2. Fix the issues
3. Resubmit (usually faster second time)

---

## Step 10: After Approval

### 10.1 App Goes Live

- App appears in Play Store within 24 hours
- Users can download and install
- You can share the Play Store link

### 10.2 Monitor

- **Play Console** → Statistics
- **Reviews and Ratings**
- **Crash Reports** (if enabled)
- **Analytics** (if enabled)

### 10.3 Updates

For future updates:
1. Update version in `app.json`:
   ```json
   {
     "version": "1.0.1",  // Increment version
     "android": {
       "versionCode": 2  // Increment versionCode
     }
   }
   ```
2. Build new version: `eas build --platform android --profile production`
3. Submit: `eas submit --platform android --latest`
4. Update release notes in Play Console
5. Submit for review

---

## 🚀 Quick Start Commands

```bash
# 1. Configure EAS (first time only)
eas build:configure

# 2. Build for Google Play Store
eas build --platform android --profile production

# 3. Submit to Play Store (after service account setup)
eas submit --platform android --latest

# 4. Or upload manually via Play Console web interface
```

---

## 📝 Checklist Summary

### Before Building
- [ ] Google Play Console account created
- [ ] App created in Play Console
- [ ] `app.json` updated with package name
- [ ] `eas.json` configured for Android production
- [ ] App code ready for production

### Before Submission
- [ ] Production build completed successfully
- [ ] Build downloaded (if manual upload)
- [ ] Service account set up (if automatic submission)

### Before Play Store Release
- [ ] App name and description complete
- [ ] Screenshots uploaded (at least 2 phone screenshots)
- [ ] App icon uploaded (512x512px)
- [ ] Privacy policy URL provided
- [ ] Content rating completed
- [ ] Data Safety section completed
- [ ] Category selected
- [ ] Release notes written

### Ready to Submit
- [ ] All required fields filled in
- [ ] Screenshots uploaded
- [ ] Privacy policy accessible
- [ ] Content rating obtained
- [ ] Data Safety completed
- [ ] Build uploaded
- [ ] Ready to submit!

---

## 🆘 Troubleshooting

### "Package name already exists"
- Package name must be unique across all Play Store apps
- Try: `com.thriveinitiative.app`, `com.thriveinitiative.mobile`, etc.

### "Build failed"
- Check build logs in EAS dashboard
- Common issues: missing dependencies, build errors
- Fix code issues and rebuild

### "Service account not authorized"
- Make sure service account has "Release apps" permission
- Check service account is linked in Play Console → API access

### "App rejected"
- Read rejection feedback carefully
- Fix issues and resubmit
- Usually faster second time

---

## 📚 Additional Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer/)
- [Google Play Policies](https://play.google.com/about/developer-content-policy/)
- [App Bundle Guide](https://developer.android.com/guide/app-bundle)

---

## 🎯 Next Steps

1. **Create Google Play Console account** ($25 one-time fee)
2. **Create app in Play Console**
3. **Update `app.json`** with package name
4. **Build your app**: `eas build --platform android --profile production`
5. **Complete Play Store listing** (screenshots, description, etc.)
6. **Submit for review**

Good luck! 🚀

