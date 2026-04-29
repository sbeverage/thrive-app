# Apple Pay Integration Details

## How it Works
In the Thrive App, Apple Pay is natively integrated directly into the unified Stripe Payment Sheet rather than using a separate standalone Apple Pay button.

When the user clicks the "Pay with Card" button in `checkout.js`, the app invokes `presentMonthlySubscriptionPaymentSheet`. This function configures and opens the Stripe Payment Sheet:

1. **Initialization**: The function `initPaymentSheet` receives an configuration object that explicitly enables Apple Pay by passing the `applePay: { merchantCountryCode: "US" }` parameter (this occurs inside `app/utils/monthlySubscriptionPaymentSheet.js`).
2. **Presentation**: When `presentPaymentSheet` is called, Stripe evaluates the device capabilities. If the device supports Apple Pay and it has been configured properly, Apple Pay automatically appears as the top primary payment option within the Stripe Payment Sheet alongside standard credit card inputs.
3. **Processing**: If the user selects Apple Pay, the native Apple Pay sheet slides up to authenticate with Face ID / Touch ID. The payment is processed securely via Stripe.

## Requirements

To ensure Apple Pay continues to work flawlessly in production and local environments, the following requirements must be met:

### 1. App Configuration (`StripeProvider`)
The `StripeProvider` component (located in `app/_layout.js`) **must** be configured with the `merchantIdentifier` prop.
```javascript
<StripeProvider
  publishableKey={STRIPE_PUBLISHABLE_KEY}
  merchantIdentifier={STRIPE_MERCHANT_IDENTIFIER} // e.g. "merchant.com.thrive.app"
>
```

### 2. Xcode Entitlements (iOS specific)
For Apple Pay to function on iOS devices:
* The Xcode project must have the **Apple Pay** capability enabled under Signing & Capabilities.
* The specific Merchant ID (matching `STRIPE_MERCHANT_IDENTIFIER`) must be checked/enabled within those capabilities.

### 3. Stripe Dashboard Configuration
* The Apple Merchant ID must be registered within the Stripe Dashboard.
* Navigate to **Settings > Payment Methods > Apple Pay** in your Stripe account and add the iOS certificate generated from your Apple Developer account.

### 4. Device Support
* Apple Pay will only be visible in the Stripe Payment Sheet if testing on a physical iOS device with a wallet configured, or on an iOS Simulator where Apple Pay test cards have been added to the simulated wallet.
