# Discount Redemption Backend Fix Guide

## 🔍 Problem Analysis

Based on the error logs, the mobile app is trying to redeem discounts but the backend endpoint is returning a **404 error**:

```
ERROR  ❌ API Error: POST /api/discounts/1/redeem
Error details: {"data": {"error": "Discount route not found"}, "status": 404}
```

## 🧾 Frontend Usage Persistence (Documentation)

To ensure usage counts remain consistent across logout/login, the app persists redemption counts in local storage using a user-specific key:

- **Storage key:** `redemptionCounts:<user email>`
- **Behavior:** Counts are **not cleared on logout**, so the user sees the same remaining uses after logging back in.
- **Source of truth:** Backend should still enforce usage limits and return `remainingUses`/`availableCount` in the redemption response.

This ensures the UI reflects the same usage counts even if the user logs out.

## 📋 What Needs to Be Fixed

### 1. **Backend: Create Discount Redemption Endpoint**

The mobile app is calling:
```
POST /api/discounts/:discountId/redeem
```

**Current Status:** ❌ This endpoint doesn't exist (returns 404)

**Required Implementation:**

#### Endpoint Details:
- **Method:** `POST`
- **Path:** `/api/discounts/:id/redeem`
- **Authentication:** Required (user must be logged in)
- **Request Body:** (Optional - can be empty for now)
  ```json
  {
    "totalBill": 20.00,      // Optional - for tracking
    "totalSavings": 5.00     // Optional - for tracking
  }
  ```

#### Expected Response:
```json
{
  "success": true,
  "discountCode": "DEALFREE",
  "message": "Discount redeemed successfully",
  "savings": 5.00  // Optional - if provided in request
}
```

#### Error Responses:
- **404:** Discount not found
  ```json
  {
    "error": "Discount not found"
  }
  ```
- **400:** Discount is inactive or expired
  ```json
  {
    "error": "Discount is no longer valid"
  }
  ```
- **401:** User not authenticated
  ```json
  {
    "error": "Unauthorized"
  }
  ```

### 2. **Backend Implementation Steps**

#### Step 1: Add Route Handler

In your backend routes file (e.g., `routes/discounts.js` or `routes/api.js`):

```javascript
// POST /api/discounts/:id/redeem
router.post('/discounts/:id/redeem', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { totalBill, totalSavings } = req.body;
    const userId = req.user.id; // From authentication middleware
    
    // 1. Find the discount
    const discount = await Discount.findById(id).populate('vendorId');
    
    if (!discount) {
      return res.status(404).json({ error: 'Discount not found' });
    }
    
    // 2. Validate discount is active and not expired
    if (!discount.isActive) {
      return res.status(400).json({ error: 'Discount is not active' });
    }
    
    if (new Date(discount.endDate) < new Date()) {
      return res.status(400).json({ error: 'Discount has expired' });
    }
    
    // 3. Check usage limits (if applicable)
    // TODO: Implement usage limit checking
    // const userRedemptions = await Redemption.countDocuments({
    //   userId,
    //   discountId: id,
    //   createdAt: { $gte: startOfMonth }
    // });
    // if (userRedemptions >= discount.maxUsesPerMonth) {
    //   return res.status(400).json({ error: 'Monthly usage limit reached' });
    // }
    
    // 4. Record the redemption (create redemption record)
    // TODO: Create Redemption model/table
    // const redemption = await Redemption.create({
    //   userId,
    //   discountId: id,
    //   vendorId: discount.vendorId,
    //   totalBill: totalBill || null,
    //   totalSavings: totalSavings || null,
    //   discountCode: discount.discountCode,
    //   redeemedAt: new Date()
    // });
    
    // 5. Return success response
    res.json({
      success: true,
      discountCode: discount.discountCode,
      message: 'Discount redeemed successfully',
      savings: totalSavings || null
    });
    
  } catch (error) {
    console.error('Error redeeming discount:', error);
    res.status(500).json({ error: error.message });
  }
});
```

#### Step 2: Database Schema (if not already exists)

You may need to create a **Redemptions** table/collection to track discount redemptions:

```sql
-- SQL Example (PostgreSQL/MySQL)
CREATE TABLE redemptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  discount_id INTEGER NOT NULL REFERENCES discounts(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  discount_code VARCHAR(50) NOT NULL,
  total_bill DECIMAL(10, 2),
  total_savings DECIMAL(10, 2),
  redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_redemptions_user_id ON redemptions(user_id);
CREATE INDEX idx_redemptions_discount_id ON redemptions(discount_id);
CREATE INDEX idx_redemptions_redeemed_at ON redemptions(redeemed_at);
```

Or for MongoDB:
```javascript
{
  userId: ObjectId,
  discountId: ObjectId,
  vendorId: ObjectId,
  discountCode: String,
  totalBill: Number,
  totalSavings: Number,
  redeemedAt: Date,
  createdAt: Date
}
```

#### Step 3: Authentication Middleware

Ensure the route is protected with authentication:

```javascript
// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

### 3. **Admin Panel: No Changes Required**

The admin panel doesn't need changes for discount redemption. The redemption happens from the mobile app, and the admin panel can view redemption history if you implement the Redemptions table.

### 4. **Optional Enhancements**

#### Track Redemption History:
- Create a Redemptions table/collection
- Record each redemption with user, discount, vendor, timestamp
- Track usage limits per user per month

#### Usage Limits:
- Check `maxUsesPerMonth` or `usageLimitPerMonth` from discount
- Prevent users from redeeming more than the limit
- Return appropriate error if limit reached

#### Analytics:
- Track total redemptions per discount
- Track total savings per user
- Generate reports for vendors

## 📝 Summary

**What's Broken:**
- ❌ `POST /api/discounts/:id/redeem` endpoint doesn't exist (404 error)

**What Needs to Be Done:**
1. ✅ Create `POST /api/discounts/:id/redeem` endpoint in backend
2. ✅ Add authentication middleware to protect the route
3. ✅ Validate discount exists and is active
4. ✅ Return discount code in response
5. ✅ (Optional) Create Redemptions table to track redemption history
6. ✅ (Optional) Implement usage limit checking

**Current Mobile App Behavior:**
- The app gracefully handles the 404 error by using local data
- Redemption still works, but it's not being tracked on the backend
- Users can still complete the flow and see their discount code

**After Backend Fix:**
- Redemptions will be properly tracked in the database
- Usage limits can be enforced
- Analytics and reporting will be possible
- Better error handling for expired/inactive discounts












