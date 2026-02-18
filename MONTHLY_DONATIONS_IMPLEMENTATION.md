# 💰 Monthly Donations Implementation Guide

**Priority:** 🔴 **CRITICAL**  
**Impact:** Revenue-critical - Users think they're donating but money isn't being collected

---

## 📋 Overview

Users can set monthly donation amounts in the app, but **no Stripe subscriptions are being created**. This means money is not being collected, even though users believe they're donating monthly.

---

## 🗄️ Database Schema

### 1. Create `monthly_donations` Table

```sql
CREATE TABLE IF NOT EXISTS monthly_donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beneficiary_id UUID REFERENCES charities(id),
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Stripe Integration
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),
  stripe_price_id VARCHAR(255), -- Stripe Price ID for subscription
  
  -- Status Tracking
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'cancelled', 'past_due'
  next_payment_date DATE,
  last_payment_date DATE,
  last_payment_amount DECIMAL(10,2),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (beneficiary_id) REFERENCES charities(id)
);

CREATE INDEX idx_monthly_donations_user_id ON monthly_donations(user_id);
CREATE INDEX idx_monthly_donations_status ON monthly_donations(status);
CREATE INDEX idx_monthly_donations_stripe_subscription ON monthly_donations(stripe_subscription_id);
```

---

### 2. Update `users` Table (If Needed)

```sql
-- Add Stripe customer ID to users table if not exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
```

---

## 🔌 Backend Endpoints

### 1. `POST /api/donations/monthly/subscribe` - Create Subscription

**Purpose:** Create a new Stripe subscription for monthly donations

**Request:**
```json
{
  "beneficiary_id": "uuid",
  "amount": 15.00,
  "payment_method_id": "pm_xxx" // Optional - Stripe payment method ID
}
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "id": "uuid",
    "user_id": "uuid",
    "beneficiary_id": "uuid",
    "amount": 15.00,
    "status": "active",
    "stripe_subscription_id": "sub_xxx",
    "next_payment_date": "2025-02-01",
    "created_at": "2025-01-23T10:00:00Z"
  },
  "stripe_subscription": {
    "id": "sub_xxx",
    "status": "active",
    "current_period_end": 1738368000
  }
}
```

**Implementation Steps:**
1. Get or create Stripe customer for user
2. Create Stripe Price for the amount (or use existing)
3. Create Stripe Subscription
4. Save subscription to database
5. Return subscription data

---

### 2. `GET /api/donations/monthly` - Get Monthly Donations

**Purpose:** Get user's monthly donation subscription

**Request:** `GET /api/donations/monthly`

**Response:**
```json
{
  "subscription": {
    "id": "uuid",
    "user_id": "uuid",
    "beneficiary_id": "uuid",
    "beneficiary_name": "NPCF",
    "amount": 15.00,
    "status": "active",
    "next_payment_date": "2025-02-01",
    "last_payment_date": "2025-01-01",
    "last_payment_amount": 15.00,
    "stripe_subscription_id": "sub_xxx",
    "created_at": "2025-01-01T10:00:00Z"
  },
  "history": [
    {
      "id": "uuid",
      "amount": 15.00,
      "date": "2025-01-01",
      "status": "succeeded"
    }
  ]
}
```

---

### 3. `PUT /api/donations/monthly/amount` - Update Donation Amount

**Purpose:** Update the monthly donation amount (creates new subscription)

**Request:**
```json
{
  "amount": 25.00
}
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "id": "uuid",
    "amount": 25.00,
    "status": "active",
    "next_payment_date": "2025-02-01"
  }
}
```

**Implementation Steps:**
1. Get current subscription
2. Cancel old Stripe subscription
3. Create new Stripe subscription with new amount
4. Update database record
5. Return updated subscription

---

### 4. `PUT /api/donations/monthly/beneficiary` - Change Beneficiary

**Purpose:** Change which beneficiary receives the monthly donation

**Request:**
```json
{
  "beneficiary_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "id": "uuid",
    "beneficiary_id": "uuid",
    "beneficiary_name": "New Charity"
  }
}
```

---

### 5. `POST /api/donations/monthly/pause` - Pause Subscription

**Purpose:** Pause monthly donations temporarily

**Request:** `POST /api/donations/monthly/pause`

**Response:**
```json
{
  "success": true,
  "subscription": {
    "id": "uuid",
    "status": "paused"
  }
}
```

---

### 6. `POST /api/donations/monthly/resume` - Resume Subscription

**Purpose:** Resume paused monthly donations

**Request:** `POST /api/donations/monthly/resume`

**Response:**
```json
{
  "success": true,
  "subscription": {
    "id": "uuid",
    "status": "active",
    "next_payment_date": "2025-02-01"
  }
}
```

---

### 7. `DELETE /api/donations/monthly/subscription/:id` - Cancel Subscription

**Purpose:** Cancel monthly donation subscription

**Request:** `DELETE /api/donations/monthly/subscription/:id`

**Response:**
```json
{
  "success": true,
  "message": "Subscription cancelled successfully"
}
```

**Implementation Steps:**
1. Cancel Stripe subscription
2. Update database status to 'cancelled'
3. Return success

---

### 8. `GET /api/donations/monthly/summary` - Get Donation Summary

**Purpose:** Get summary of monthly donations (for donation summary screen)

**Request:** `GET /api/donations/monthly/summary`

**Response:**
```json
{
  "current_subscription": {
    "amount": 15.00,
    "beneficiary_name": "NPCF",
    "status": "active",
    "next_payment_date": "2025-02-01"
  },
  "total_donated": 150.00,
  "months_active": 10,
  "monthly_breakdown": [
    {
      "month": "January 2025",
      "amount": 15.00,
      "beneficiary": "NPCF",
      "status": "completed"
    },
    {
      "month": "February 2025",
      "amount": 15.00,
      "beneficiary": "NPCF",
      "status": "pending"
    }
  ]
}
```

---

## 🔄 Stripe Integration

### 1. Create Stripe Customer

```javascript
// Get or create Stripe customer
async function getOrCreateStripeCustomer(userId, email) {
  // Check if user already has Stripe customer ID
  const user = await db.query(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId]
  );
  
  if (user.rows[0]?.stripe_customer_id) {
    return user.rows[0].stripe_customer_id;
  }
  
  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email: email,
    metadata: {
      user_id: userId
    }
  });
  
  // Save to database
  await db.query(
    'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
    [customer.id, userId]
  );
  
  return customer.id;
}
```

---

### 2. Create Stripe Subscription

```javascript
async function createStripeSubscription(customerId, amount, paymentMethodId) {
  // Create or get Stripe Price
  const price = await stripe.prices.create({
    unit_amount: Math.round(amount * 100), // Convert to cents
    currency: 'usd',
    recurring: {
      interval: 'month'
    },
    product_data: {
      name: 'Monthly Donation'
    }
  });
  
  // Create subscription
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{
      price: price.id
    }],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      payment_method_types: ['card'],
      save_default_payment_method: 'on_subscription'
    },
    expand: ['latest_invoice.payment_intent']
  });
  
  return subscription;
}
```

---

### 3. Handle Stripe Webhooks

**Webhook Events to Handle:**

1. **`invoice.payment_succeeded`**
   - Update `last_payment_date` and `last_payment_amount`
   - Create transaction record
   - Update `next_payment_date`

2. **`invoice.payment_failed`**
   - Update status to `past_due`
   - Notify user

3. **`customer.subscription.updated`**
   - Update subscription status
   - Update amount if changed

4. **`customer.subscription.deleted`**
   - Update status to `cancelled`

---

## 📱 Frontend Integration

### Update `app/lib/api.js`

Add these methods:

```javascript
// Monthly Donations
createMonthlySubscription: async (subscriptionData) => {
  try {
    const response = await api.post('/api/donations/monthly/subscribe', subscriptionData);
    return response.data;
  } catch (error) {
    console.error('Create subscription failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to create subscription.');
  }
},

getMonthlyDonation: async () => {
  try {
    const response = await api.get('/api/donations/monthly');
    return response.data;
  } catch (error) {
    console.error('Get monthly donation failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to load monthly donation.');
  }
},

updateMonthlyDonationAmount: async (amount) => {
  try {
    const response = await api.put('/api/donations/monthly/amount', { amount });
    return response.data;
  } catch (error) {
    console.error('Update donation amount failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to update donation amount.');
  }
},

getMonthlyDonationSummary: async () => {
  try {
    const response = await api.get('/api/donations/monthly/summary');
    return response.data;
  } catch (error) {
    console.error('Get donation summary failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to load donation summary.');
  }
},

pauseMonthlyDonation: async () => {
  try {
    const response = await api.post('/api/donations/monthly/pause');
    return response.data;
  } catch (error) {
    console.error('Pause donation failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to pause donation.');
  }
},

resumeMonthlyDonation: async () => {
  try {
    const response = await api.post('/api/donations/monthly/resume');
    return response.data;
  } catch (error) {
    console.error('Resume donation failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to resume donation.');
  }
},

cancelMonthlyDonation: async (subscriptionId) => {
  try {
    const response = await api.delete(`/api/donations/monthly/subscription/${subscriptionId}`);
    return response.data;
  } catch (error) {
    console.error('Cancel donation failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to cancel donation.');
  }
},
```

---

### Update `app/(tabs)/menu/editDonationAmount.js`

Replace local storage save with API call:

```javascript
const handleSave = async () => {
  try {
    // Create or update subscription
    if (existingSubscription) {
      await API.updateMonthlyDonationAmount(newAmount);
    } else {
      await API.createMonthlySubscription({
        beneficiary_id: selectedBeneficiary?.id,
        amount: newAmount
      });
    }
    
    // Update local state
    await saveUserData({ monthlyDonation: newAmount });
    
    Alert.alert('Success', 'Monthly donation amount updated!');
    router.back();
  } catch (error) {
    Alert.alert('Error', error.message);
  }
};
```

---

### Update `app/(tabs)/menu/donationSummary.js`

Replace hardcoded data with API call:

```javascript
const [summary, setSummary] = useState(null);

useEffect(() => {
  loadSummary();
}, []);

const loadSummary = async () => {
  try {
    const data = await API.getMonthlyDonationSummary();
    setSummary(data);
  } catch (error) {
    console.error('Failed to load summary:', error);
    // Fallback to local data
  }
};
```

---

## 🧪 Testing Checklist

- [ ] Create subscription with new amount
- [ ] Update subscription amount
- [ ] Change beneficiary
- [ ] Pause subscription
- [ ] Resume subscription
- [ ] Cancel subscription
- [ ] Verify Stripe webhooks work
- [ ] Verify payments are processed
- [ ] Verify transaction records created
- [ ] Test with different payment methods

---

## 🚨 Critical Notes

1. **Payment Method Required:** User must have a payment method before creating subscription
2. **Stripe Price:** Create Stripe Price for each amount, or reuse existing prices
3. **Webhooks:** Must handle Stripe webhooks to keep database in sync
4. **Error Handling:** Handle payment failures gracefully
5. **User Notification:** Notify users of payment success/failure

---

**Status:** ⚠️ **CRITICAL** - Implement immediately to start collecting monthly donations


