# 🍎 Apple Developer Setup - TestFlight & App Store Guide

## 🎯 Overview

This guide walks you through getting your app from development to TestFlight and then to the App Store, now that you have access to your Apple Developer account.

---

## 📋 Prerequisites Checklist

Before starting, make sure you have:
- [x] ✅ Apple Developer account access ($99/year)
- [ ] App Store Connect access (same Apple ID as Developer account)
- [ ] EAS CLI installed (`npm install -g eas-cli`)
- [ ] Logged into EAS (`eas login`)
- [ ] Your app code ready for production

---

## Step 1: Set Up App Store Connect

### 1.1 Create Your App in App Store Connect

1. **Go to App Store Connect**: https://appstoreconnect.apple.com
2. **Sign in** with your Apple Developer account
3. **Click "My Apps"** → **"+"** → **"New App"**
4. **Fill in the form**:
   - **Platform**: iOS
   - **Name**: "THRIVE Initiative" (or your app name)
   - **Primary Language**: English (or your language)
   - **Bundle ID**: You'll need to create this first (see Step 1.2)
   - **SKU**: A unique identifier (e.g., "thrive-app-001")
   - **User Access**: Full Access (or Limited if you have a team)

### 1.2 Create Bundle Identifier

**Option A: Create in App Store Connect (Recommended)**
1. In App Store Connect, when creating the app, click **"Register a new Bundle ID"**
2. **Identifier**: `com.thriveinitiative.app` (or your preferred ID)
3. **Description**: "THRIVE Initiative iOS App"
4. **Capabilities**: Enable what you need:
   - ✅ Sign In with Apple (if using social login)
   - ✅ Push Notifications (if using)
   - ✅ Associated Domains (for deep linking)

**Option B: Create in Apple Developer Portal**
1. Go to https://developer.apple.com/account
2. **Certificates, Identifiers & Profiles** → **Identifiers**
3. Click **"+"** → **App IDs** → **App**
4. Fill in:
   - **Description**: "THRIVE Initiative"
   - **Bundle ID**: `com.thriveinitiative.app`
   - **Capabilities**: Enable as needed
5. **Continue** → **Register**

---

## Step 2: Update Your App Configuration

### 2.1 Update `app.json`

Update your bundle identifier and app name:

```json
{
  "expo": {
    "name": "THRIVE Initiative",
    "slug": "thrive-app",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.thriveinitiative.app",
      "buildNumber": "1",
      "supportsTablet": true,
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "This app uses location to show nearby discounts and causes on the map.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "This app uses location to show nearby discounts and causes on the map."
      }
    }
  }
}
```

**Important**: Make sure the `bundleIdentifier` matches exactly what you created in App Store Connect!

### 2.2 Update `eas.json` for Production

Your `eas.json` should look like this:

```json
{
  "cli": {
    "version": ">= 16.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "ios": {
        "simulator": false,
        "bundleIdentifier": "com.thriveinitiative.app"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-email@example.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

**Note**: You'll get `ascAppId` and `appleTeamId` from App Store Connect after creating your app.

---

## Step 3: Build Your App for TestFlight

### 3.1 First Build (Development/Preview)

For initial testing, build a preview version:

```bash
eas build --platform ios --profile preview
```

**What happens:**
- Builds your app in the cloud (10-20 minutes)
- Creates an `.ipa` file
- Provides a download link

**OR** build for TestFlight directly:

```bash
eas build --platform ios --profile production
```

**What happens:**
- Builds your app for App Store distribution
- Automatically uploads to App Store Connect
- Makes it available in TestFlight

### 3.2 During Build Process

EAS will ask you questions:

1. **"Would you like to configure credentials now?"** → **Yes**
2. **"How would you like to upload your credentials?"** → **Automatic** (recommended)
3. EAS will automatically:
   - Create certificates
   - Create provisioning profiles
   - Handle all the complex setup

**If you get errors about certificates:**
- Make sure you're logged into the correct Apple Developer account
- Check that your Bundle ID exists in App Store Connect
- Verify your Apple Developer account is active

---

## Step 4: Submit to TestFlight

### 4.1 Automatic Submission (Easiest)

After the build completes, EAS can automatically submit:

```bash
eas submit --platform ios --latest
```

**OR** if you want to submit a specific build:

```bash
eas submit --platform ios --id BUILD_ID
```

### 4.2 Manual Submission (Alternative)

1. **Go to App Store Connect**: https://appstoreconnect.apple.com
2. **My Apps** → Your App → **TestFlight** tab
3. **iOS Builds** section
4. If your build isn't there, click **"+"** to add it
5. Wait for processing (can take 10-30 minutes)

---

## Step 5: Set Up TestFlight Testing

### 5.1 Add Internal Testers (Instant Access)

1. In App Store Connect → **TestFlight** tab
2. **Internal Testing** section
3. Click **"+"** to add testers
4. **Add testers**:
   - Enter email addresses (must be Apple IDs)
   - Up to 100 internal testers
   - They get instant access (no review needed)

### 5.2 Add External Testers (Requires Review)

1. **External Testing** section
2. Click **"+"** to create a new group
3. **Add testers** (up to 10,000)
4. **Submit for Beta App Review**:
   - Fill in required information
   - Answer questions about your app
   - Submit for review (usually approved in 24-48 hours)

### 5.3 TestFlight Information

Before external testers can access, you need to provide:

- **What to Test**: Instructions for testers
- **Feedback Email**: Where testers send feedback
- **Beta App Description**: Brief description of your app
- **Marketing URL** (optional): Your website
- **Privacy Policy URL** (required): Your privacy policy

---

## Step 6: Prepare for App Store Submission

### 6.1 App Information

In App Store Connect → **App Information**:

- [ ] **Name**: "THRIVE Initiative"
- [ ] **Subtitle**: Short tagline (30 characters max)
- [ ] **Category**: Primary and Secondary categories
- [ ] **Content Rights**: Confirm you have rights to all content
- [ ] **Age Rating**: Complete questionnaire

### 6.2 Pricing and Availability

- [ ] **Price**: Set to Free (or your price)
- [ ] **Availability**: Select countries
- [ ] **Discounts** (if applicable)

### 6.3 App Privacy

**Required for App Store submission:**

1. **Privacy Policy URL** (required):
   - Must be publicly accessible
   - Must cover data collection and usage
   - Example: `https://thriveinitiative.com/privacy`

2. **App Privacy Details**:
   - What data you collect
   - How you use it
   - Third-party sharing (Stripe, Supabase, etc.)

**Data Types to Declare:**
- ✅ Location (if using location services)
- ✅ Email Address (user accounts)
- ✅ Phone Number (if collected)
- ✅ Payment Info (Stripe)
- ✅ User Content (profile pictures, etc.)

### 6.4 Screenshots (Required)

You need screenshots for different device sizes:

**Required Sizes:**
- [ ] iPhone 6.7" (iPhone 14 Pro Max, 15 Pro Max)
- [ ] iPhone 6.5" (iPhone 11 Pro Max, XS Max)
- [ ] iPhone 5.5" (iPhone 8 Plus)
- [ ] iPad Pro 12.9" (if supporting iPad)
- [ ] iPad Pro 11" (if supporting iPad)

**How to Create Screenshots:**
1. Run your app in iOS Simulator
2. Take screenshots: **Device** → **Screenshots**
3. Or use a tool like [Fastlane](https://fastlane.tools/) or [App Store Screenshot Generator](https://www.appstorescreenshot.com/)

**Tips:**
- Show key features of your app
- Use real content (not placeholders)
- Make them visually appealing
- Follow Apple's guidelines

### 6.5 App Description

**Required Fields:**
- [ ] **Description** (up to 4,000 characters):
  - What your app does
  - Key features
  - Who it's for

- [ ] **Keywords** (up to 100 characters):
  - Comma-separated
  - No spaces after commas
  - Example: "charity,donation,giving,nonprofit"

- [ ] **Promotional Text** (optional, up to 170 characters):
  - Can be updated without resubmission
  - Use for promotions, sales, etc.

- [ ] **Support URL** (required):
  - Where users can get help
  - Example: `https://thriveinitiative.com/support`

- [ ] **Marketing URL** (optional):
  - Your website
  - Example: `https://thriveinitiative.com`

### 6.6 App Preview Video (Optional but Recommended)

- [ ] Create a 15-30 second video
- [ ] Show your app in action
- [ ] Upload to App Store Connect
- [ ] Can increase conversion rates

---

## Step 7: Submit for App Store Review

### 7.1 Create App Store Version

1. In App Store Connect → **App Store** tab
2. Click **"+"** next to **iOS App**
3. **Version**: "1.0" (or your version number)
4. **What's New in This Version**: Release notes

### 7.2 Build Selection

1. **Build** section
2. Click **"+"** to select a build
3. Choose your production build from TestFlight
4. If no builds appear, wait for processing or upload a new build

### 7.3 Review Information

Fill in:
- [ ] **Contact Information**: Your contact details
- [ ] **Demo Account**: Test account for reviewers (if login required)
- [ ] **Notes**: Any special instructions for reviewers

### 7.4 Version Information

- [ ] **Copyright**: "© 2024 THRIVE Initiative" (or your copyright)
- [ ] **Trade Representative Contact**: If applicable
- [ ] **App Review Information**: Any notes for reviewers

### 7.5 Submit for Review

1. **Review all information** carefully
2. Click **"Submit for Review"**
3. **Confirm submission**
4. Status changes to **"Waiting for Review"**

---

## Step 8: Review Process

### 8.1 Review Timeline

- **Initial Review**: 24-48 hours typically
- **Rejection**: If issues found, you'll get feedback
- **Approval**: App goes live immediately (or on scheduled date)

### 8.2 Common Rejection Reasons

**To Avoid:**
- ❌ Missing privacy policy
- ❌ Incomplete app information
- ❌ App crashes during review
- ❌ Broken functionality
- ❌ Missing required permissions explanations
- ❌ Incomplete payment flows (if applicable)

**If Rejected:**
1. Read the feedback carefully
2. Fix the issues
3. Resubmit (usually faster second time)

---

## Step 9: After Approval

### 9.1 App Goes Live

- App appears in App Store within 24 hours
- Users can download and install
- You can share the App Store link

### 9.2 Monitor

- **App Store Connect** → **Sales and Trends**
- **Analytics** (if enabled)
- **Reviews and Ratings**
- **Crash Reports** (if enabled)

### 9.3 Updates

For future updates:
1. Update version in `app.json`
2. Build new version: `eas build --platform ios --profile production`
3. Submit: `eas submit --platform ios --latest`
4. Update version in App Store Connect
5. Submit for review

---

## 🚀 Quick Start Commands

```bash
# 1. Configure EAS (first time only)
eas build:configure

# 2. Build for TestFlight
eas build --platform ios --profile production

# 3. Submit to TestFlight (after build completes)
eas submit --platform ios --latest

# 4. For App Store submission, use App Store Connect web interface
```

---

## 📝 Checklist Summary

### Before Building
- [ ] Bundle ID created in App Store Connect
- [ ] `app.json` updated with correct bundle identifier
- [ ] `eas.json` configured for production
- [ ] App code ready for production

### Before TestFlight
- [ ] Build completed successfully
- [ ] Build uploaded to App Store Connect
- [ ] TestFlight information filled in
- [ ] Internal testers added

### Before App Store
- [ ] All screenshots uploaded
- [ ] App description complete
- [ ] Privacy policy URL provided
- [ ] App privacy details completed
- [ ] Support URL provided
- [ ] Age rating completed
- [ ] Pricing set
- [ ] Build selected for App Store version
- [ ] Review information filled in
- [ ] Ready to submit!

---

## 🆘 Troubleshooting

### "Bundle ID not found"
- Make sure you created the Bundle ID in App Store Connect or Apple Developer Portal
- Verify the bundle identifier in `app.json` matches exactly

### "Certificate errors"
- EAS should handle this automatically
- If issues persist, check your Apple Developer account is active
- Verify you have the correct permissions

### "Build processing failed"
- Check build logs in EAS dashboard
- Common issues: missing dependencies, build errors
- Fix code issues and rebuild

### "TestFlight build not appearing"
- Wait 10-30 minutes for processing
- Check App Store Connect → TestFlight → iOS Builds
- Verify build was uploaded successfully

---

## 📚 Additional Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Apple Developer Documentation](https://developer.apple.com/documentation/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

---

## 🎯 Next Steps

1. **Create Bundle ID** in App Store Connect
2. **Update `app.json`** with correct bundle identifier
3. **Build your app**: `eas build --platform ios --profile production`
4. **Submit to TestFlight**: `eas submit --platform ios --latest`
5. **Add testers** and test thoroughly
6. **Prepare App Store listing** (screenshots, description, etc.)
7. **Submit for review** when ready

Good luck! 🚀

