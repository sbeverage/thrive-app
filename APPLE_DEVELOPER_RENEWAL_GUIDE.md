# 🔄 Apple Developer Membership Renewal Guide

## 🚨 Your Issue

**Error Message:**
> "Your membership has expired, and your apps have been removed from the App Store until you renew your membership. To renew, a user with the Account Holder role must sign in and renew the membership on the Apple Developer website."

**What this means:**
- Your Apple Developer Program membership ($99/year) has expired
- You need to renew it to continue using App Store Connect
- Only the **Account Holder** can renew (not team members)

---

## ✅ Step-by-Step Renewal Process

### Step 1: Identify Your Account Role

1. **Go to App Store Connect**: https://appstoreconnect.apple.com
2. **Sign in** with your Apple ID
3. **Check your role**:
   - Go to **Users and Access** (if you can see it)
   - Or check the error message - it will tell you if you're the Account Holder

**If you're NOT the Account Holder:**
- You need to contact the Account Holder to renew
- Or transfer the account to yourself (complex process)

**If you ARE the Account Holder:**
- Continue to Step 2

---

### Step 2: Renew on Apple Developer Website

**Important**: You must renew on the **Apple Developer website**, NOT App Store Connect.

1. **Go to Apple Developer Portal**: https://developer.apple.com/account
2. **Sign in** with the same Apple ID (Account Holder)
3. **Look for renewal notice** at the top of the page
4. **Click "Renew Membership"** or **"Renew Now"** button

**OR** if you don't see a button:

1. Go to: https://developer.apple.com/programs/enroll/
2. Click **"Renew Your Membership"**
3. Sign in with your Apple ID

---

### Step 3: Complete Payment

1. **Review membership details**:
   - Cost: $99 USD per year
   - Valid for 1 year from renewal date

2. **Enter payment information**:
   - Credit card or debit card
   - Apple ID payment method (if set up)
   - PayPal (in some regions)

3. **Complete purchase**

4. **Wait for confirmation**:
   - Usually instant, but can take up to 24 hours
   - You'll receive a confirmation email

---

### Step 4: Verify Renewal

1. **Go back to App Store Connect**: https://appstoreconnect.apple.com
2. **Sign in** again
3. **Check status**:
   - The error message should be gone
   - You should see "Active" membership status
   - You can access all features again

**If still showing expired:**
- Wait 24 hours (sometimes takes time to update)
- Sign out and sign back in
- Clear browser cache
- Contact Apple Developer Support if still not working

---

## 🔍 How to Check Your Membership Status

### Method 1: Apple Developer Portal

1. Go to: https://developer.apple.com/account
2. Sign in
3. Look at the top of the page for membership status
4. Should show: **"Active"** or **"Expired"**

### Method 2: App Store Connect

1. Go to: https://appstoreconnect.apple.com
2. Sign in
3. Look for membership status in the header
4. Or go to **Agreements, Tax, and Banking** → Check status

### Method 3: Email

- Check your email for renewal reminders
- Apple sends emails before expiration
- Check spam folder if you didn't see them

---

## 💳 Payment Methods

Apple accepts:
- ✅ Credit cards (Visa, Mastercard, American Express)
- ✅ Debit cards
- ✅ Apple ID payment method (if you have one set up)
- ✅ PayPal (in some regions)
- ✅ Wire transfer (for enterprise accounts)

**Note**: The payment must be made by the Account Holder.

---

## ⏰ Renewal Timeline

**When to renew:**
- You can renew up to 60 days before expiration
- You can renew after expiration (apps will be restored)

**Processing time:**
- Usually instant
- Can take up to 24 hours
- If longer, contact Apple Support

**What happens after renewal:**
- ✅ Apps are restored to App Store (if they were removed)
- ✅ Access to App Store Connect restored
- ✅ Can submit new apps
- ✅ Can update existing apps
- ✅ TestFlight access restored

---

## 🆘 Troubleshooting

### "I can't find the renew button"

**Try these:**
1. Go directly to: https://developer.apple.com/programs/enroll/
2. Click "Renew Your Membership"
3. Or go to: https://developer.apple.com/account → Look for renewal notice

### "I'm not the Account Holder"

**Options:**
1. **Contact the Account Holder** to renew
2. **Transfer account ownership** (complex, requires Apple Support)
3. **Create a new Apple Developer account** (lose access to old apps)

### "Payment failed"

**Check:**
- Card has sufficient funds
- Card is not expired
- Billing address matches card
- Card is not blocked by bank
- Try a different payment method

### "Still showing expired after renewal"

**Wait and try:**
1. Wait 24 hours for system update
2. Sign out and sign back in
3. Clear browser cache/cookies
4. Try a different browser
5. Contact Apple Developer Support

### "I don't remember my Apple ID"

**Recover it:**
1. Go to: https://appleid.apple.com
2. Click "Forgot Apple ID or password"
3. Follow recovery steps
4. Or contact Apple Support

---

## 📞 Apple Developer Support

If you're still having issues:

**Contact Apple Developer Support:**
- **Phone**: 1-800-633-2152 (US)
- **Website**: https://developer.apple.com/contact/
- **Email**: Through the contact form on developer.apple.com

**Have ready:**
- Your Apple ID
- Your Developer account details
- Error messages you're seeing
- Screenshots if helpful

---

## 🔐 Account Holder vs Team Member

**Account Holder:**
- ✅ Can renew membership
- ✅ Can manage billing
- ✅ Full access to all features
- ✅ Can add/remove team members

**Team Member:**
- ❌ Cannot renew membership
- ❌ Limited access
- ✅ Can use App Store Connect (if membership is active)
- ✅ Can submit apps (if given permission)

**To check your role:**
1. Go to App Store Connect
2. **Users and Access** → Find your name
3. Check your role listed

---

## 💡 Pro Tips

1. **Set up auto-renewal reminders**:
   - Add calendar reminder 60 days before expiration
   - Apple sends emails, but set your own reminder too

2. **Keep payment method updated**:
   - Update expired cards before renewal
   - Add backup payment method

3. **Renew early**:
   - Renew 60 days before expiration
   - Avoid any service interruption

4. **Save confirmation emails**:
   - Keep receipt for tax purposes
   - Proof of renewal if issues arise

---

## ✅ After Renewal Checklist

Once your membership is renewed:

- [ ] Membership status shows "Active"
- [ ] Can access App Store Connect
- [ ] Can access TestFlight
- [ ] Can submit new apps
- [ ] Can update existing apps
- [ ] Previous apps restored (if they were removed)

---

## 🚀 Next Steps After Renewal

Once your membership is active again:

1. **Verify access**: Sign into App Store Connect
2. **Check your apps**: See if they're restored
3. **Continue with TestFlight setup**: Follow `TESTFLIGHT_QUICK_START.md`
4. **Build your app**: `eas build --platform ios --profile production`

---

## 📝 Quick Reference

**Renewal URL**: https://developer.apple.com/programs/enroll/

**Developer Portal**: https://developer.apple.com/account

**App Store Connect**: https://appstoreconnect.apple.com

**Support**: https://developer.apple.com/contact/

**Cost**: $99 USD per year

**Processing**: Usually instant, up to 24 hours

---

Good luck with your renewal! Once it's active, you can continue with the TestFlight setup. 🎉

