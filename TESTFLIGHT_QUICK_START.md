# 🚀 TestFlight Quick Start - Your First Build

## ⚡ Fast Track (30 minutes to first build)

### Step 1: Create Bundle ID in App Store Connect (5 min)

1. Go to https://appstoreconnect.apple.com
2. **My Apps** → **"+"** → **New App**
3. When asked for Bundle ID, click **"Register a new Bundle ID"**
4. Enter:
   - **Description**: "THRIVE Initiative"
   - **Bundle ID**: `com.thriveinitiative.app` (or your preferred ID)
5. **Continue** → **Register**

### Step 2: Update Your App Config (2 min)

Update `app.json` line 18:

```json
"bundleIdentifier": "com.thriveinitiative.app"
```

**Important**: Use the exact Bundle ID you just created!

### Step 3: Build Your App (20 min)

```bash
eas build --platform ios --profile production
```

**What happens:**
- EAS asks: "Would you like to configure credentials now?" → **Yes**
- EAS asks: "How would you like to upload your credentials?" → **Automatic**
- Build runs in the cloud (you can close your computer)
- When done, automatically uploads to App Store Connect

### Step 4: Add to TestFlight (5 min)

1. Go to https://appstoreconnect.apple.com
2. **My Apps** → Your App → **TestFlight** tab
3. Wait for build to process (10-30 minutes)
4. **Internal Testing** → **"+"** → Add your email
5. Check your email for TestFlight invite
6. Install TestFlight app on your iPhone
7. Accept invite and install your app!

---

## 🎯 That's It!

You now have your app in TestFlight. Next steps:

1. **Test thoroughly** on your device
2. **Add more testers** (up to 100 internal testers)
3. **Set up external testing** (requires App Review, but allows up to 10,000 testers)
4. **Prepare for App Store** (screenshots, description, etc.)

---

## 📋 Full Checklist

- [ ] Bundle ID created in App Store Connect
- [ ] `app.json` updated with bundle identifier
- [ ] Build completed: `eas build --platform ios --profile production`
- [ ] Build appears in TestFlight
- [ ] Added yourself as internal tester
- [ ] Installed TestFlight app
- [ ] Installed your app from TestFlight
- [ ] Tested app on device

---

## 🆘 Common Issues

### "Bundle ID not found"
- Make sure you created it in App Store Connect first
- Check the bundle identifier matches exactly (case-sensitive)

### "Certificate errors"
- EAS should handle this automatically
- If it fails, make sure your Apple Developer account is active
- Check you're logged into the correct Apple ID

### "Build not appearing in TestFlight"
- Wait 10-30 minutes for processing
- Check App Store Connect → TestFlight → iOS Builds
- Make sure build completed successfully

---

## 📚 Next Steps

See `APPLE_DEVELOPER_SETUP_GUIDE.md` for:
- Detailed App Store submission process
- Screenshot requirements
- Privacy policy setup
- App Store review preparation

---

## 💡 Pro Tips

1. **Test on multiple devices** before external testing
2. **Gather feedback** from internal testers first
3. **Fix critical bugs** before App Store submission
4. **Prepare screenshots** while testing (saves time later)
5. **Write app description** early (you can refine it)

Good luck! 🎉

