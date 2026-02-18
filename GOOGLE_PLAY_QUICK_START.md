# 🤖 Google Play Store Quick Start

## ⚡ Fast Track (30 minutes to first build)

### Step 1: Create Google Play Console Account (10 min)

1. Go to https://play.google.com/console
2. **Sign in** with your Google account
3. **Pay $25 registration fee** (one-time)
4. **Accept policies** and complete setup

### Step 2: Create App in Play Console (5 min)

1. **Click "Create app"**
2. **Fill in**:
   - App name: "THRIVE Initiative"
   - Default language: English
   - App or game: App
   - Free or paid: Free
3. **Click "Create app"**

### Step 3: Update App Config (2 min)

✅ **Already done!** Your `app.json` has been updated with:
- Package name: `com.thriveinitiative.app`
- Version code: `1`

**Important**: Make sure the package name matches what you want (you can't change it later!)

### Step 4: Build Your App (20 min)

```bash
eas build --platform android --profile production
```

**What happens:**
- EAS asks: "Would you like to configure credentials now?" → **Yes**
- EAS asks: "How would you like to upload your credentials?" → **Automatic**
- Build runs in the cloud (you can close your computer)
- Creates an `.aab` file (App Bundle) ready for Play Store

### Step 5: Upload to Play Console (5 min)

1. **Go to Play Console** → Your App
2. **Production** (or **Internal testing** for faster testing)
3. **Click "Create new release"**
4. **Upload your `.aab` file**:
   - Download from EAS build page
   - Drag and drop into Play Console
5. **Add release notes**
6. **Review and roll out**

---

## 🎯 That's It!

You now have your app ready for Google Play Store. Next steps:

1. **Complete Play Store listing** (screenshots, description, privacy policy)
2. **Set up testing tracks** (Internal testing is fastest - no review needed)
3. **Submit for production** when ready

---

## 📋 Full Checklist

- [ ] Google Play Console account created ($25 paid)
- [ ] App created in Play Console
- [ ] `app.json` updated with package name ✅ (already done)
- [ ] `eas.json` configured ✅ (already done)
- [ ] Build completed: `eas build --platform android --profile production`
- [ ] Build uploaded to Play Console
- [ ] Screenshots uploaded (at least 2 required)
- [ ] App description written
- [ ] Privacy policy URL provided
- [ ] Content rating completed
- [ ] Data Safety section completed
- [ ] Ready to submit!

---

## 🆘 Common Issues

### "Package name already exists"
- Package name must be unique
- Try: `com.thriveinitiative.app`, `com.thriveinitiative.mobile`, etc.
- Update in `app.json` before building

### "Build failed"
- Check build logs in EAS dashboard
- Fix code issues and rebuild

### "Service account errors"
- Only needed for automatic submission
- For first time, upload manually via Play Console

---

## 📚 Next Steps

See `GOOGLE_PLAY_STORE_SETUP_GUIDE.md` for:
- Detailed Play Store listing requirements
- Screenshot specifications
- Privacy policy setup
- Testing tracks setup
- Automatic submission setup

---

## 💡 Pro Tips

1. **Start with Internal Testing** - No review needed, instant availability
2. **Use App Bundle (AAB)** - Smaller, better optimized (already configured ✅)
3. **Test on multiple devices** before production release
4. **Prepare screenshots** while building (saves time)
5. **Write app description** early (you can refine it)

Good luck! 🎉

