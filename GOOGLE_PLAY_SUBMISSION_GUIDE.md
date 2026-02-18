# 📱 Google Play Store Submission Guide

## 🎯 Quick Start

You have two options:
1. **Manual Submission** (Recommended for first time) - Upload via Google Play Console website
2. **Automated Submission** - Use EAS CLI (requires service account setup)

---

## Option 1: Manual Submission (Easiest)

### Step 1: Download Your App Bundle

**Your build is ready:**
- **Download URL**: https://expo.dev/artifacts/eas/7x8YwqJCLKtXo49Bt5U4g9.aab
- **Or download via CLI**:
  ```bash
  eas build:download --platform android --latest
  ```

### Step 2: Access Google Play Console

1. **Go to**: https://play.google.com/console
2. **Sign in** with your Google account
3. **Pay $25 registration fee** (one-time, if not already paid)

### Step 3: Create Your App

1. **Click "Create app"** (top right)
2. **Fill in the form**:
   - **App name**: "THRIVE Initiative" (or your preferred name)
   - **Default language**: English (United States)
   - **App or game**: App
   - **Free or paid**: Free
   - **Declarations**: Check the compliance box
3. **Click "Create app"**

### Step 4: Complete Store Listing (Required)

1. **Go to "Store presence" → "Main store listing"**

2. **Fill in required fields**:
   - **App name**: "THRIVE Initiative"
   - **Short description** (80 chars max): Brief description of your app
   - **Full description** (4000 chars max): Detailed description
   - **App icon**: Upload your app icon (512x512px PNG)
   - **Feature graphic**: 1024x500px image
   - **Screenshots**: At least 2 required (phone screenshots)
     - Phone: 16:9 or 9:16 aspect ratio
     - Minimum: 320px height
   - **Privacy Policy URL**: Required if your app collects data

3. **Example content**:
   ```
   Short description:
   "Connect with causes, earn points, and make a difference in your community."
   
   Full description:
   "THRIVE Initiative is a community-driven platform that connects donors with 
   local causes and beneficiaries. Earn points through donations, discover 
   nearby discounts, and track your impact. Join a community of changemakers 
   making a real difference."
   ```

### Step 5: Complete Content Rating

1. **Go to "Policy" → "App content"**
2. **Click "Start questionnaire"**
3. **Answer questions** about your app's content
4. **Submit** and wait for rating (usually instant)

### Step 6: Set Up Pricing & Distribution

1. **Go to "Pricing & distribution"**
2. **Select**:
   - **Free** or **Paid** (choose Free for now)
   - **Countries**: Select where to distribute
   - **User programs**: Check if applicable
3. **Save**

### Step 7: Upload Your App Bundle

1. **Go to "Production"** (left sidebar, under "Release")
2. **Click "Create new release"**
3. **Upload your `.aab` file**:
   - Drag and drop the downloaded `.aab` file
   - Or click "Browse files" and select it
4. **Add release notes**:
   ```
   Initial release of THRIVE Initiative
   - Connect with local causes
   - Earn points through donations
   - Discover nearby discounts
   - Track your impact
   ```
5. **Click "Save"**
6. **Review the release** and click "Review release"

### Step 8: Submit for Review

1. **Review all sections**:
   - ✅ Store listing (completed)
   - ✅ Content rating (completed)
   - ✅ Pricing & distribution (completed)
   - ✅ Production release (uploaded)
   - ✅ App content (may need to complete)

2. **If "App content" shows issues**, complete:
   - Data safety form
   - Target audience
   - Ads (if applicable)
   - COVID-19 contact tracing (if applicable)

3. **Click "Submit for review"** (top right)

4. **Wait for review** (typically 1-3 days for new apps)

---

## Option 2: Automated Submission via EAS

### Prerequisites

You need a **Google Play Service Account** JSON key file.

### Step 1: Create Service Account

1. **Go to Google Cloud Console**: https://console.cloud.google.com
2. **Select or create a project**
3. **Go to "IAM & Admin" → "Service Accounts"**
4. **Click "Create Service Account"**
5. **Fill in**:
   - Name: "EAS Submit"
   - Description: "For EAS automated submissions"
6. **Click "Create and Continue"**
7. **Skip role assignment** (click "Continue")
8. **Click "Done"**

### Step 2: Create and Download Key

1. **Click on the service account** you just created
2. **Go to "Keys" tab**
3. **Click "Add Key" → "Create new key"**
4. **Select "JSON"**
5. **Click "Create"** - This downloads the JSON file
6. **Save it** as `google-play-service-account.json` in your project root

### Step 3: Link Service Account to Google Play

1. **Go to Google Play Console**: https://play.google.com/console
2. **Go to "Setup" → "API access"**
3. **Click "Link service account"**
4. **Enter the service account email** (from the JSON file, `client_email` field)
5. **Grant access**:
   - Check "View app information and download bulk reports"
   - Check "Manage production releases"
   - Check "Manage testing track releases"
6. **Click "Invite user"**

### Step 4: Update eas.json

Your `eas.json` already has the submit configuration! Just make sure the service account file is in the right place:

```json
{
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "internal"  // Change to "production" when ready
      }
    }
  }
}
```

**Note**: Change `"track": "internal"` to `"track": "production"` when ready for production release.

### Step 5: Submit via EAS CLI

```bash
eas submit --platform android --profile production
```

This will:
1. Download your latest build
2. Upload it to Google Play Console
3. Create a release in the specified track

---

## 🧪 Testing Before Production (Recommended)

### Internal Testing Track

**Before going to production, test in Internal Testing:**

1. **In Google Play Console**, go to "Testing" → "Internal testing"
2. **Click "Create new release"**
3. **Upload the same `.aab` file**
4. **Add testers**:
   - Go to "Testers" tab
   - Add up to 100 email addresses
   - Or create a Google Group
5. **Testers will receive an email** with a link to install
6. **Test thoroughly** before promoting to production

### Promote to Production

Once testing is complete:
1. **Go to "Production"**
2. **Create release** with the same `.aab`
3. **Submit for review**

---

## 📋 Pre-Submission Checklist

Before submitting, ensure:

- [ ] Google Play Console account created ($25 paid)
- [ ] App created in Play Console
- [ ] Store listing completed:
  - [ ] App name
  - [ ] Short description
  - [ ] Full description
  - [ ] App icon (512x512px)
  - [ ] Feature graphic (1024x500px)
  - [ ] At least 2 screenshots
  - [ ] Privacy policy URL (if required)
- [ ] Content rating completed
- [ ] Pricing & distribution set
- [ ] App bundle (`.aab`) downloaded
- [ ] App tested on Android device (recommended)
- [ ] All app content sections completed

---

## 🚨 Common Issues & Solutions

### Issue: "Package name already exists"
**Solution**: The package name `com.thriveinitiative.app` is already taken. You'll need to:
1. Change it in `app.json` to something unique
2. Rebuild the app
3. Use the new package name in Play Console

### Issue: "Missing required fields"
**Solution**: Complete all sections marked with ⚠️ or ❌ in Play Console

### Issue: "Privacy policy required"
**Solution**: 
- If your app collects any data, you need a privacy policy
- Host it on your website
- Add the URL in Store listing

### Issue: "Screenshots required"
**Solution**: 
- Take screenshots from your app
- Use an Android emulator or device
- Minimum 2 screenshots required

---

## 📝 Future Updates

When you need to update your app:

1. **Update version in `app.json`**:
   ```json
   {
     "version": "1.0.1",
     "android": {
       "versionCode": 2  // Increment this!
     }
   }
   ```

2. **Build new version**:
   ```bash
   eas build --platform android --profile production
   ```

3. **Submit update**:
   - Manual: Upload new `.aab` in Play Console
   - Automated: `eas submit --platform android --profile production`

---

## 🆘 Need Help?

- **Google Play Console Help**: https://support.google.com/googleplay/android-developer
- **EAS Submit Docs**: https://docs.expo.dev/submit/android/
- **EAS Support**: https://expo.dev/support

---

## 🎯 Recommended First Steps

1. ✅ **Download your `.aab` file** (already built!)
2. ✅ **Create Google Play Console account** (if not done)
3. ✅ **Create your app** in Play Console
4. ✅ **Complete store listing** (description, screenshots, etc.)
5. ✅ **Upload to Internal testing** first (test before production)
6. ✅ **Test with testers**
7. ✅ **Promote to Production** when ready
8. ✅ **Submit for review**

---

**Ready to start? Begin with Step 1 above!** 🚀



