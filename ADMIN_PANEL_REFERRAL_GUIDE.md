# Admin Panel - Referral System Implementation Guide

## 📊 Database Schema Requirements

### 1. `referrals` Table
Stores the referral relationship between users.

```sql
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_token VARCHAR(255) NOT NULL, -- The token used in the signup URL (?ref=token)
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- See status values below
  monthly_donation_amount DECIMAL(10,2), -- Only set when status = 'paid'
  stripe_subscription_id VARCHAR(255), -- Stripe subscription ID when payment is set up
  joined_at TIMESTAMP DEFAULT NOW(), -- When referred user signed up
  payment_setup_at TIMESTAMP, -- When payment method was added
  first_payment_at TIMESTAMP, -- When first payment succeeded
  cancelled_at TIMESTAMP, -- When subscription was cancelled
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(referred_user_id) -- A user can only be referred once
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_referrals_token ON referrals(referral_token);
```

**Status Values:**
- `pending`: User clicked referral link but hasn't signed up yet
- `signed_up`: User signed up but hasn't set up payment
- `payment_setup`: User added payment method but first payment hasn't succeeded yet
- `paid`: User has active subscription with successful first payment (counts toward milestones)
- `cancelled`: Subscription was cancelled

### 2. `referral_milestones` Table
Tracks which milestones each user has unlocked.

```sql
CREATE TABLE referral_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_count INTEGER NOT NULL, -- 1, 5, 10, or 25
  reward_type VARCHAR(100) NOT NULL, -- 'credit', 'badge', 'vip_access', 'recognition'
  reward_value DECIMAL(10,2), -- Credit amount (e.g., 5.00, 25.00)
  reward_name VARCHAR(255), -- Badge name (e.g., "Community Builder")
  unlocked_at TIMESTAMP DEFAULT NOW(),
  credit_applied BOOLEAN DEFAULT FALSE, -- Whether credit has been applied to account
  credit_expires_at TIMESTAMP, -- 90 days from unlocked_at
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, milestone_count) -- One milestone per user per count
);

CREATE INDEX idx_milestones_user ON referral_milestones(user_id);
CREATE INDEX idx_milestones_unlocked ON referral_milestones(unlocked_at);
```

### 3. `user_credits` Table
Tracks credits earned from referrals (for applying to donations).

```sql
CREATE TABLE user_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  source VARCHAR(100) NOT NULL, -- 'referral_milestone_1', 'referral_milestone_5', etc.
  milestone_id UUID REFERENCES referral_milestones(id),
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'applied', 'expired'
  expires_at TIMESTAMP NOT NULL, -- 90 days from creation
  applied_at TIMESTAMP, -- When credit was used
  applied_to_donation_id UUID, -- Which donation the credit was applied to
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_credits_user ON user_credits(user_id);
CREATE INDEX idx_credits_status ON user_credits(status);
CREATE INDEX idx_credits_expires ON user_credits(expires_at);
```

### 4. `user_badges` Table
Tracks badges earned by users.

```sql
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_name VARCHAR(255) NOT NULL, -- 'Community Builder', 'VIP Member', etc.
  milestone_id UUID REFERENCES referral_milestones(id),
  earned_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, badge_name) -- One badge per user per name
);

CREATE INDEX idx_badges_user ON user_badges(user_id);
```

## 🔄 Referral Flow & Status Transitions

### Signup Flow with Referral Token

1. **User clicks referral link**: `https://thrive-web-jet.vercel.app/signup?ref=USER_ID`
   - Frontend captures `referralToken` from URL params
   - `referralToken` = the referrer's user ID (or a unique token)

2. **User signs up** (`POST /api/auth/signup`):
   ```json
   {
     "email": "newuser@example.com",
     "password": "password123",
     "referralToken": "user123" // The referrer's ID
   }
   ```
   - Backend should:
     - Create user account
     - If `referralToken` exists, create referral record:
       ```sql
       INSERT INTO referrals (
         referrer_id,
         referred_user_id,
         referral_token,
         status,
         joined_at
       ) VALUES (
         (SELECT id FROM users WHERE id = referralToken OR referral_code = referralToken),
         new_user_id,
         referralToken,
         'signed_up',
         NOW()
       );
       ```

3. **User sets up payment** (Stripe subscription created):
   - Update referral status:
     ```sql
     UPDATE referrals 
     SET status = 'payment_setup',
         payment_setup_at = NOW(),
         stripe_subscription_id = 'sub_xxx'
     WHERE referred_user_id = user_id;
     ```

4. **First payment succeeds** (Stripe webhook):
   - Update referral status:
     ```sql
     UPDATE referrals 
     SET status = 'paid',
         first_payment_at = NOW(),
         monthly_donation_amount = subscription_amount
     WHERE referred_user_id = user_id;
     ```
   - **Trigger milestone check** for referrer:
     ```javascript
     checkReferralMilestones(referrer_id);
     ```

5. **Subscription cancelled**:
   - Update referral status:
     ```sql
     UPDATE referrals 
     SET status = 'cancelled',
         cancelled_at = NOW()
     WHERE referred_user_id = user_id;
     ```
   - Note: This doesn't remove the milestone reward (already earned)

## 🎯 Milestone System

### Milestone Definitions

```javascript
const MILESTONES = [
  {
    count: 1,
    reward: {
      type: 'credit',
      amount: 5.00,
      description: '$5 Credit'
    }
  },
  {
    count: 5,
    reward: {
      type: 'credit_and_badge',
      creditAmount: 25.00,
      badgeName: 'Community Builder',
      description: '$25 Credit + Badge'
    }
  },
  {
    count: 10,
    reward: {
      type: 'credit_and_vip',
      creditAmount: 50.00,
      vipAccess: true,
      description: '$50 Credit + VIP Access'
    }
  },
  {
    count: 25,
    reward: {
      type: 'credit_and_recognition',
      creditAmount: 100.00,
      recognition: true,
      description: '$100 Credit + Recognition'
    }
  }
];
```

### Milestone Check Logic

```javascript
async function checkReferralMilestones(referrerId) {
  // Get count of paid referrals (status = 'paid')
  const paidCount = await db.query(`
    SELECT COUNT(*) as count
    FROM referrals
    WHERE referrer_id = $1 AND status = 'paid'
  `, [referrerId]);
  
  const count = paidCount.rows[0].count;
  
  // Check each milestone
  for (const milestone of MILESTONES) {
    if (count >= milestone.count) {
      // Check if already unlocked
      const existing = await db.query(`
        SELECT id FROM referral_milestones
        WHERE user_id = $1 AND milestone_count = $2
      `, [referrerId, milestone.count]);
      
      if (existing.rows.length === 0) {
        // Unlock milestone
        await unlockMilestone(referrerId, milestone);
      }
    }
  }
}

async function unlockMilestone(userId, milestone) {
  const transaction = await db.beginTransaction();
  
  try {
    // Create milestone record
    const milestoneRecord = await db.query(`
      INSERT INTO referral_milestones (
        user_id, milestone_count, reward_type, reward_value, reward_name
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      userId,
      milestone.count,
      milestone.reward.type,
      milestone.reward.creditAmount || milestone.reward.amount,
      milestone.reward.badgeName || null
    ]);
    
    const milestoneId = milestoneRecord.rows[0].id;
    
    // Grant credit if applicable
    if (milestone.reward.creditAmount || milestone.reward.amount) {
      const creditAmount = milestone.reward.creditAmount || milestone.reward.amount;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90); // 90 days
      
      await db.query(`
        INSERT INTO user_credits (
          user_id, amount, source, milestone_id, expires_at
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        userId,
        creditAmount,
        `referral_milestone_${milestone.count}`,
        milestoneId,
        expiresAt
      ]);
    }
    
    // Grant badge if applicable
    if (milestone.reward.badgeName) {
      await db.query(`
        INSERT INTO user_badges (user_id, badge_name, milestone_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, badge_name) DO NOTHING
      `, [userId, milestone.reward.badgeName, milestoneId]);
    }
    
    // Grant VIP access if applicable (just a flag in user record)
    if (milestone.reward.vipAccess) {
      await db.query(`
        UPDATE users SET vip_access = true WHERE id = $1
      `, [userId]);
    }
    
    // Grant recognition if applicable (just a flag in user record)
    if (milestone.reward.recognition) {
      await db.query(`
        UPDATE users SET featured_recognition = true WHERE id = $1
      `, [userId]);
    }
    
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

## 📡 API Endpoints Required

### 1. `POST /api/auth/signup`
**Accepts referral token during signup**

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "referralToken": "user123" // Optional - referrer's ID or token
}
```

**Backend Logic:**
1. Create user account
2. If `referralToken` provided:
   - Validate token (lookup referrer by ID or referral code)
   - Create referral record with status `'signed_up'`
   - Store `referral_token`, `referrer_id`, `referred_user_id`

### 2. `GET /api/referrals/info`
**Get referrer's referral statistics**

**Headers:**
```
Authorization: Bearer <user_token>
```

**Response:**
```json
{
  "referralLink": "https://thrive-web-jet.vercel.app/signup?ref=user123",
  "friendsCount": 8, // Total referrals (all statuses)
  "paidFriendsCount": 5, // Only status = 'paid'
  "totalEarned": 30.00, // Sum of all credits earned
  "milestones": [
    {
      "count": 1,
      "reward": "$5 Credit",
      "unlocked": true,
      "earnedAt": "2024-01-15T10:00:00Z"
    },
    {
      "count": 5,
      "reward": "$25 Credit + Badge",
      "unlocked": true,
      "earnedAt": "2024-01-20T14:30:00Z"
    },
    {
      "count": 10,
      "reward": "$50 Credit + VIP Access",
      "unlocked": false,
      "earnedAt": null
    },
    {
      "count": 25,
      "reward": "$100 Credit + Recognition",
      "unlocked": false,
      "earnedAt": null
    }
  ]
}
```

**Backend Query:**
```sql
-- Get referral stats
SELECT 
  COUNT(*) as friends_count,
  COUNT(*) FILTER (WHERE status = 'paid') as paid_friends_count
FROM referrals
WHERE referrer_id = $1;

-- Get total credits earned
SELECT COALESCE(SUM(amount), 0) as total_earned
FROM user_credits
WHERE user_id = $1 AND status = 'active';

-- Get milestones
SELECT 
  milestone_count as count,
  reward_value || ' Credit' || 
    CASE 
      WHEN reward_name IS NOT NULL THEN ' + ' || reward_name || ' Badge'
      WHEN reward_type = 'vip_access' THEN ' + VIP Access'
      WHEN reward_type = 'recognition' THEN ' + Recognition'
      ELSE ''
    END as reward,
  unlocked_at IS NOT NULL as unlocked,
  unlocked_at as "earnedAt"
FROM referral_milestones
WHERE user_id = $1
ORDER BY milestone_count;
```

### 3. `GET /api/referrals/friends`
**Get list of referred friends**

**Headers:**
```
Authorization: Bearer <user_token>
```

**Response:**
```json
{
  "friends": [
    {
      "id": "friend123",
      "name": "John Doe",
      "email": "john@example.com",
      "status": "paid",
      "monthlyDonation": 25.00,
      "joinedAt": "2024-01-15T10:00:00Z",
      "firstPaymentAt": "2024-01-15T10:30:00Z",
      "paymentSetupAt": "2024-01-15T10:25:00Z",
      "cancelledAt": null
    },
    {
      "id": "friend456",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "status": "payment_setup",
      "monthlyDonation": null,
      "joinedAt": "2024-01-16T09:00:00Z",
      "firstPaymentAt": null,
      "paymentSetupAt": "2024-01-16T09:15:00Z",
      "cancelledAt": null
    }
  ]
}
```

**Backend Query:**
```sql
SELECT 
  r.referred_user_id as id,
  u.first_name || ' ' || u.last_name as name,
  u.email,
  r.status,
  r.monthly_donation_amount as "monthlyDonation",
  r.joined_at as "joinedAt",
  r.first_payment_at as "firstPaymentAt",
  r.payment_setup_at as "paymentSetupAt",
  r.cancelled_at as "cancelledAt"
FROM referrals r
JOIN users u ON r.referred_user_id = u.id
WHERE r.referrer_id = $1
ORDER BY r.joined_at DESC;
```

## 🎛️ Admin Panel Features Needed

### 1. Referral Overview Dashboard

**Metrics to Display:**
- Total referrals across all users
- Total paid referrals (active subscriptions)
- Total credits granted
- Total badges earned
- Average referrals per user
- Top referrers (leaderboard)

**SQL Queries:**
```sql
-- Total referrals
SELECT COUNT(*) FROM referrals;

-- Total paid referrals
SELECT COUNT(*) FROM referrals WHERE status = 'paid';

-- Total credits granted
SELECT COALESCE(SUM(amount), 0) FROM user_credits;

-- Total badges earned
SELECT COUNT(*) FROM user_badges;

-- Top 10 referrers
SELECT 
  u.id,
  u.email,
  u.first_name || ' ' || u.last_name as name,
  COUNT(r.id) as total_referrals,
  COUNT(r.id) FILTER (WHERE r.status = 'paid') as paid_referrals,
  COALESCE(SUM(uc.amount), 0) as total_credits_earned
FROM users u
LEFT JOIN referrals r ON u.id = r.referrer_id
LEFT JOIN user_credits uc ON u.id = uc.user_id
GROUP BY u.id, u.email, u.first_name, u.last_name
ORDER BY paid_referrals DESC
LIMIT 10;
```

### 2. User Referral Details Page

**For a specific user, show:**

**Tab 1: Referral Stats**
- Referral link (with copy button)
- Friends count (total vs paid)
- Credits earned
- Badges earned
- Milestones unlocked
- Next milestone progress

**Tab 2: Referred Friends List**
- Table with columns:
  - Name/Email
  - Status (with color coding)
  - Monthly Donation
  - Joined Date
  - Payment Setup Date
  - First Payment Date
  - Cancelled Date (if applicable)
- Filter by status
- Sort by date

**Tab 3: Milestones & Rewards**
- List of all milestones
- Unlock status
- Reward details
- Date earned
- Credit status (active/applied/expired)

**Tab 4: Credits**
- Active credits (with expiration dates)
- Applied credits (with donation reference)
- Expired credits
- Total earned vs total used

### 3. Referral Management Actions

**Admin Actions:**
- **Manually grant milestone**: If milestone check failed, admin can manually unlock
- **Manually grant credit**: Add credit to user account
- **Manually grant badge**: Add badge to user account
- **Adjust referral status**: Change status if needed (e.g., mark as paid if payment was missed)
- **Resend referral link**: Generate new link for user
- **View referral chain**: See who referred this user, and who they referred

### 4. Referral Analytics

**Charts/Graphs:**
- Referrals over time (line chart)
- Status distribution (pie chart)
- Milestone unlock rate (bar chart)
- Average time from signup to paid (histogram)
- Revenue from referrals (monthly recurring revenue from paid referrals)

**SQL for Analytics:**
```sql
-- Referrals over time
SELECT 
  DATE(joined_at) as date,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'paid') as paid
FROM referrals
WHERE joined_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(joined_at)
ORDER BY date;

-- Status distribution
SELECT 
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM referrals
GROUP BY status;

-- Average time to paid
SELECT 
  AVG(EXTRACT(EPOCH FROM (first_payment_at - joined_at)) / 3600) as avg_hours_to_paid
FROM referrals
WHERE status = 'paid' AND first_payment_at IS NOT NULL;

-- Monthly recurring revenue from referrals
SELECT 
  COALESCE(SUM(monthly_donation_amount), 0) as mrr
FROM referrals
WHERE status = 'paid';
```

### 5. Credit Management

**Credit Operations:**
- View all active credits (with expiration warnings)
- Manually expire credits
- Apply credits to specific donations
- View credit history
- Bulk operations (expire all credits for a user, etc.)

### 6. Badge Management

**Badge Operations:**
- View all badges earned
- Manually grant/revoke badges
- Badge leaderboard (users with most badges)
- Badge distribution (how many users have each badge)

## 🔔 Webhook Integration

### Stripe Webhook Events

**1. `customer.subscription.created`**
- Update referral status to `'payment_setup'`
- Store `stripe_subscription_id`

**2. `invoice.payment_succeeded`** (first payment)
- Update referral status to `'paid'`
- Store `monthly_donation_amount`
- Store `first_payment_at`
- **Trigger milestone check** for referrer

**3. `customer.subscription.deleted`**
- Update referral status to `'cancelled'`
- Store `cancelled_at`
- Note: Don't remove milestone rewards (already earned)

**Webhook Handler Pseudo-code:**
```javascript
async function handleStripeWebhook(event) {
  const subscription = event.data.object;
  const customerId = subscription.customer;
  
  // Find user by Stripe customer ID
  const user = await db.query(`
    SELECT id FROM users WHERE stripe_customer_id = $1
  `, [customerId]);
  
  if (!user.rows[0]) return;
  
  const userId = user.rows[0].id;
  
  // Find referral record
  const referral = await db.query(`
    SELECT referrer_id, id FROM referrals 
    WHERE referred_user_id = $1
  `, [userId]);
  
  if (!referral.rows[0]) return;
  
  const referrerId = referral.rows[0].referrer_id;
  
  switch (event.type) {
    case 'customer.subscription.created':
      await db.query(`
        UPDATE referrals 
        SET status = 'payment_setup',
            payment_setup_at = NOW(),
            stripe_subscription_id = $1
        WHERE referred_user_id = $2
      `, [subscription.id, userId]);
      break;
      
    case 'invoice.payment_succeeded':
      // Check if this is the first payment
      const existing = await db.query(`
        SELECT first_payment_at FROM referrals 
        WHERE referred_user_id = $1
      `, [userId]);
      
      if (!existing.rows[0].first_payment_at) {
        // First payment - update status and trigger milestone check
        await db.query(`
          UPDATE referrals 
          SET status = 'paid',
              first_payment_at = NOW(),
              monthly_donation_amount = $1
          WHERE referred_user_id = $2
        `, [subscription.items.data[0].price.unit_amount / 100, userId]);
        
        // Trigger milestone check for referrer
        await checkReferralMilestones(referrerId);
      }
      break;
      
    case 'customer.subscription.deleted':
      await db.query(`
        UPDATE referrals 
        SET status = 'cancelled',
            cancelled_at = NOW()
        WHERE referred_user_id = $1
      `, [userId]);
      break;
  }
}
```

## 📋 Key Business Rules

### 1. Only Paid Referrals Count
- **Count toward milestones**: Only referrals with `status = 'paid'`
- **Don't count**: `pending`, `signed_up`, `payment_setup`, `cancelled`
- **Reason**: Ensures rewards are only given for actual paying customers

### 2. Milestone Rewards Are One-Time
- Each milestone can only be unlocked once per user
- Use `UNIQUE(user_id, milestone_count)` constraint
- Check before granting: `SELECT id FROM referral_milestones WHERE user_id = $1 AND milestone_count = $2`

### 3. Credits Expire After 90 Days
- Credits are created with `expires_at = NOW() + 90 days`
- Backend should have a cron job to mark expired credits:
  ```sql
  UPDATE user_credits 
  SET status = 'expired' 
  WHERE expires_at < NOW() AND status = 'active';
  ```

### 4. Credits Are Non-Transferable
- Credits are tied to specific user_id
- Cannot be transferred between accounts

### 5. Badges Are Permanent
- Once earned, badges are permanent (unless manually revoked by admin)
- Badges don't expire

### 6. Referral Link Format
- Format: `https://thrive-web-jet.vercel.app/signup?ref={USER_ID}`
- `USER_ID` can be:
  - User's UUID
  - User's email (encoded)
  - A unique referral code (if you add this field)

## 🎨 Admin Panel UI Recommendations

### Referral Dashboard
- **Cards showing:**
  - Total Referrals: 1,234
  - Paid Referrals: 856 (69%)
  - Total Credits Granted: $12,450
  - Active Credits: $3,200
  - Top Referrer: John Doe (45 paid referrals)

### User Detail View
- **Tabs:**
  1. Overview (stats summary)
  2. Referred Friends (table with filters)
  3. Milestones (unlock status)
  4. Credits (active/applied/expired)
  5. Badges (earned badges list)

### Filters & Search
- Filter referrals by status
- Filter by date range
- Search by referrer email/name
- Search by referred user email/name
- Filter by milestone unlocked

### Export Options
- Export referral list to CSV
- Export credits report
- Export milestone report

## 🔍 Important Notes for Admin Panel

1. **Status Transitions Are Automatic**: Don't allow manual status changes unless there's a specific issue (use audit log)

2. **Milestone Checks Should Be Idempotent**: Running milestone check multiple times should be safe (won't duplicate rewards)

3. **Credit Application**: Credits should be automatically applied to next donation, but admin should be able to see/manage this

4. **Referral Chain**: A user can be both a referrer AND a referred user (they were referred by someone, and they referred others)

5. **Data Integrity**: 
   - A user can only be referred once (enforced by UNIQUE constraint)
   - Milestones can only be unlocked once per user per count
   - Credits should never exceed total earned

6. **Performance**: 
   - Index `referrer_id` and `status` on referrals table
   - Cache milestone counts for frequently accessed users
   - Consider materialized views for analytics

## 🚨 Edge Cases to Handle

1. **User signs up with referral link, then cancels before payment**
   - Status: `cancelled`
   - Doesn't count toward milestones
   - Referrer doesn't get reward

2. **User signs up, pays, then cancels later**
   - Status: `paid` (then `cancelled`)
   - **Still counts** toward milestones (already earned)
   - Milestone rewards are not revoked

3. **Multiple referral links for same user**
   - Only first referral counts (enforced by UNIQUE constraint)
   - Subsequent referral attempts should be ignored

4. **Referrer account deleted**
   - Use `ON DELETE CASCADE` or `ON DELETE SET NULL`
   - Decide: Should referrals be deleted or orphaned?

5. **Credit expiration**
   - Credits expire 90 days after earning
   - Should be automatically marked as expired
   - Admin should be able to see expired credits for reporting

## 📊 Reporting Queries for Admin Panel

### Revenue from Referrals
```sql
-- Total MRR from referrals
SELECT 
  COALESCE(SUM(monthly_donation_amount), 0) as total_mrr
FROM referrals
WHERE status = 'paid';

-- MRR by referrer
SELECT 
  u.email,
  COUNT(r.id) as referrals,
  COALESCE(SUM(r.monthly_donation_amount), 0) as mrr
FROM users u
LEFT JOIN referrals r ON u.id = r.referrer_id AND r.status = 'paid'
GROUP BY u.id, u.email
HAVING COUNT(r.id) > 0
ORDER BY mrr DESC;
```

### Conversion Funnel
```sql
-- Referral conversion funnel
SELECT 
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM referrals
GROUP BY status
ORDER BY 
  CASE status
    WHEN 'pending' THEN 1
    WHEN 'signed_up' THEN 2
    WHEN 'payment_setup' THEN 3
    WHEN 'paid' THEN 4
    WHEN 'cancelled' THEN 5
  END;
```

### Top Performers
```sql
-- Top 20 referrers by paid referrals
SELECT 
  u.id,
  u.email,
  u.first_name || ' ' || u.last_name as name,
  COUNT(r.id) FILTER (WHERE r.status = 'paid') as paid_referrals,
  COALESCE(SUM(uc.amount), 0) as credits_earned,
  COUNT(DISTINCT ub.id) as badges_earned
FROM users u
LEFT JOIN referrals r ON u.id = r.referrer_id
LEFT JOIN user_credits uc ON u.id = uc.user_id
LEFT JOIN user_badges ub ON u.id = ub.user_id
GROUP BY u.id, u.email, u.first_name, u.last_name
HAVING COUNT(r.id) FILTER (WHERE r.status = 'paid') > 0
ORDER BY paid_referrals DESC
LIMIT 20;
```

This guide should give you everything you need to implement the referral system in your admin panel!
























