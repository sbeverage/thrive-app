# 📊 Transaction History Implementation Guide

**Priority:** 🔴 **CRITICAL**  
**Impact:** Data loss prevention - All transaction data lost on app uninstall

---

## 📋 Overview

Currently, all transactions (discount redemptions, one-time gifts, monthly donations) are stored in AsyncStorage only. This means:
- Data is lost if app is uninstalled
- No cross-device sync
- No backup or recovery
- No admin visibility

**Solution:** Store all transactions in backend database.

---

## 🗄️ Database Schema

### 1. Create `transactions` Table

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Transaction Details
  type VARCHAR(50) NOT NULL, -- 'redemption', 'one_time_gift', 'monthly_donation'
  amount DECIMAL(10,2), -- Transaction amount (positive for spending, negative for refunds)
  description TEXT,
  
  -- References
  reference_id UUID, -- discount_id, gift_id, donation_id, etc.
  reference_type VARCHAR(50), -- 'discount', 'gift', 'donation'
  
  -- Discount Redemption Specific
  discount_id UUID REFERENCES discounts(id),
  vendor_id UUID REFERENCES vendors(id),
  discount_code VARCHAR(50),
  savings DECIMAL(10,2), -- Amount saved from discount
  spending DECIMAL(10,2), -- Amount spent (bill amount)
  
  -- One-Time Gift Specific
  gift_id UUID REFERENCES one_time_gifts(id),
  beneficiary_id UUID REFERENCES charities(id),
  
  -- Monthly Donation Specific
  donation_id UUID REFERENCES monthly_donations(id),
  
  -- Metadata
  metadata JSONB, -- Additional flexible data
  status VARCHAR(50) DEFAULT 'completed', -- 'completed', 'pending', 'failed', 'refunded'
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_reference ON transactions(reference_type, reference_id);
```

---

## 🔌 Backend Endpoints

### 1. `GET /api/transactions` - Get Transaction History

**Purpose:** Get user's transaction history with filtering

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `type` - Filter by type: `redemption`, `one_time_gift`, `monthly_donation`
- `start_date` - Filter from date (ISO format)
- `end_date` - Filter to date (ISO format)

**Request:** `GET /api/transactions?page=1&limit=20&type=redemption`

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "type": "redemption",
      "amount": 25.00,
      "description": "Starbucks - Free Appetizer",
      "discount_code": "DEALFREE",
      "savings": 15.99,
      "spending": 25.00,
      "vendor_name": "Starbucks",
      "status": "completed",
      "created_at": "2025-01-23T10:00:00Z"
    },
    {
      "id": "uuid",
      "type": "one_time_gift",
      "amount": 50.00,
      "description": "One-time gift to NPCF",
      "beneficiary_name": "NPCF",
      "status": "completed",
      "created_at": "2025-01-22T15:30:00Z"
    },
    {
      "id": "uuid",
      "type": "monthly_donation",
      "amount": 15.00,
      "description": "Monthly donation to NPCF",
      "beneficiary_name": "NPCF",
      "status": "completed",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "total_pages": 3
  },
  "summary": {
    "total_transactions": 45,
    "total_spent": 1250.00,
    "total_savings": 350.00,
    "by_type": {
      "redemption": 30,
      "one_time_gift": 10,
      "monthly_donation": 5
    }
  }
}
```

---

### 2. `POST /api/transactions` - Create Transaction

**Purpose:** Create a new transaction record

**Request:**
```json
{
  "type": "redemption",
  "amount": 25.00,
  "description": "Starbucks - Free Appetizer",
  "discount_id": "uuid",
  "vendor_id": "uuid",
  "discount_code": "DEALFREE",
  "savings": 15.99,
  "spending": 25.00,
  "metadata": {
    "bill_amount": 25.00,
    "discount_applied": 15.99
  }
}
```

**Response:**
```json
{
  "success": true,
  "transaction": {
    "id": "uuid",
    "type": "redemption",
    "amount": 25.00,
    "description": "Starbucks - Free Appetizer",
    "status": "completed",
    "created_at": "2025-01-23T10:00:00Z"
  }
}
```

---

### 3. `PUT /api/transactions/:id` - Update Transaction

**Purpose:** Update transaction (e.g., edit savings amount)

**Request:**
```json
{
  "savings": 20.00,
  "spending": 30.00,
  "description": "Updated description"
}
```

**Response:**
```json
{
  "success": true,
  "transaction": {
    "id": "uuid",
    "savings": 20.00,
    "spending": 30.00,
    "updated_at": "2025-01-23T11:00:00Z"
  }
}
```

---

### 4. `DELETE /api/transactions/:id` - Delete Transaction

**Purpose:** Delete a transaction (soft delete recommended)

**Request:** `DELETE /api/transactions/:id`

**Response:**
```json
{
  "success": true,
  "message": "Transaction deleted successfully"
}
```

**Note:** Consider soft delete (set status to 'deleted') instead of hard delete for audit trail.

---

### 5. `GET /api/transactions/summary` - Get Transaction Summary

**Purpose:** Get summary statistics for transaction history screen

**Request:** `GET /api/transactions/summary`

**Response:**
```json
{
  "total_transactions": 45,
  "total_spent": 1250.00,
  "total_savings": 350.00,
  "by_type": {
    "redemption": {
      "count": 30,
      "total_spent": 750.00,
      "total_savings": 350.00
    },
    "one_time_gift": {
      "count": 10,
      "total_amount": 500.00
    },
    "monthly_donation": {
      "count": 5,
      "total_amount": 75.00
    }
  },
  "this_month": {
    "transactions": 8,
    "spent": 200.00,
    "savings": 50.00
  }
}
```

---

## 🔄 Integration Points

### 1. Discount Redemption

**File:** Backend - Discount redemption endpoint

**Update:** After successful redemption, create transaction:

```javascript
// After discount redemption succeeds
await db.query(`
  INSERT INTO transactions (
    user_id, type, amount, description,
    discount_id, vendor_id, discount_code,
    savings, spending, reference_id, reference_type,
    status
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
`, [
  userId,
  'redemption',
  totalBill || 0,
  `${vendor.name} - ${discount.title}`,
  discountId,
  vendorId,
  discount.discount_code,
  totalSavings || 0,
  totalBill || 0,
  discountId,
  'discount',
  'completed'
]);
```

---

### 2. One-Time Gift

**File:** Backend - One-time gift confirmation endpoint

**Update:** After payment succeeds, create transaction:

```javascript
// After one-time gift payment succeeds
await db.query(`
  INSERT INTO transactions (
    user_id, type, amount, description,
    gift_id, beneficiary_id, reference_id, reference_type,
    status
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`, [
  userId,
  'one_time_gift',
  giftAmount,
  `One-time gift to ${beneficiary.name}`,
  giftId,
  beneficiaryId,
  giftId,
  'gift',
  'completed'
]);
```

---

### 3. Monthly Donation

**File:** Backend - Stripe webhook handler

**Update:** When invoice payment succeeds, create transaction:

```javascript
// In Stripe webhook handler for invoice.payment_succeeded
await db.query(`
  INSERT INTO transactions (
    user_id, type, amount, description,
    donation_id, beneficiary_id, reference_id, reference_type,
    status
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`, [
  userId,
  'monthly_donation',
  invoiceAmount,
  `Monthly donation to ${beneficiary.name}`,
  donationId,
  beneficiaryId,
  donationId,
  'donation',
  'completed'
]);
```

---

## 📱 Frontend Integration

### Update `app/lib/api.js`

Add these methods:

```javascript
// Transactions
getTransactions: async (filters = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (filters.page) queryParams.append('page', filters.page);
    if (filters.limit) queryParams.append('limit', filters.limit);
    if (filters.type) queryParams.append('type', filters.type);
    if (filters.start_date) queryParams.append('start_date', filters.start_date);
    if (filters.end_date) queryParams.append('end_date', filters.end_date);
    
    const response = await api.get(`/api/transactions?${queryParams.toString()}`);
    return response.data;
  } catch (error) {
    console.error('Get transactions failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to load transactions.');
  }
},

createTransaction: async (transactionData) => {
  try {
    const response = await api.post('/api/transactions', transactionData);
    return response.data;
  } catch (error) {
    console.error('Create transaction failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to create transaction.');
  }
},

updateTransaction: async (transactionId, updates) => {
  try {
    const response = await api.put(`/api/transactions/${transactionId}`, updates);
    return response.data;
  } catch (error) {
    console.error('Update transaction failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to update transaction.');
  }
},

deleteTransaction: async (transactionId) => {
  try {
    const response = await api.delete(`/api/transactions/${transactionId}`);
    return response.data;
  } catch (error) {
    console.error('Delete transaction failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete transaction.');
  }
},

getTransactionSummary: async () => {
  try {
    const response = await api.get('/api/transactions/summary');
    return response.data;
  } catch (error) {
    console.error('Get transaction summary failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to load transaction summary.');
  }
},
```

---

### Update `app/(tabs)/menu/transactionHistory.js`

Replace AsyncStorage with API calls:

```javascript
const [transactions, setTransactions] = useState([]);
const [loading, setLoading] = useState(true);
const [summary, setSummary] = useState(null);

// Load transactions from backend
const loadTransactions = async () => {
  try {
    setLoading(true);
    const data = await API.getTransactions({
      page: 1,
      limit: 50
    });
    setTransactions(data.transactions || []);
    setSummary(data.summary);
  } catch (error) {
    console.error('Failed to load transactions:', error);
    // Fallback to local storage if API fails
    const localTransactions = await AsyncStorage.getItem('userTransactions');
    if (localTransactions) {
      setTransactions(JSON.parse(localTransactions));
    }
  } finally {
    setLoading(false);
  }
};

// Update transaction
const handleUpdateTransaction = async (transactionId, updates) => {
  try {
    await API.updateTransaction(transactionId, updates);
    // Reload transactions
    await loadTransactions();
  } catch (error) {
    Alert.alert('Error', error.message);
  }
};

// Delete transaction
const handleDeleteTransaction = async (transactionId) => {
  try {
    await API.deleteTransaction(transactionId);
    // Reload transactions
    await loadTransactions();
  } catch (error) {
    Alert.alert('Error', error.message);
  }
};

useEffect(() => {
  loadTransactions();
}, []);
```

---

## 🔄 Migration Strategy

### Migrate Existing Local Transactions

**Option 1: One-time Migration Script**

```javascript
// Run once to migrate existing transactions
const migrateLocalTransactions = async () => {
  try {
    const localTransactions = await AsyncStorage.getItem('userTransactions');
    if (!localTransactions) return;
    
    const transactions = JSON.parse(localTransactions);
    
    // Send each transaction to backend
    for (const transaction of transactions) {
      try {
        await API.createTransaction({
          type: transaction.type || 'redemption',
          amount: transaction.amount || transaction.spending,
          description: transaction.description,
          savings: transaction.savings,
          spending: transaction.spending,
          created_at: transaction.created_at || transaction.date
        });
      } catch (error) {
        console.error('Failed to migrate transaction:', error);
      }
    }
    
    // Clear local storage after successful migration
    await AsyncStorage.removeItem('userTransactions');
  } catch (error) {
    console.error('Migration failed:', error);
  }
};
```

**Option 2: Sync on App Start**

```javascript
// In UserContext or App initialization
useEffect(() => {
  syncLocalTransactions();
}, []);

const syncLocalTransactions = async () => {
  try {
    const localTransactions = await AsyncStorage.getItem('userTransactions');
    if (!localTransactions) return;
    
    const transactions = JSON.parse(localTransactions);
    
    // Check if already synced
    const lastSync = await AsyncStorage.getItem('transactionsLastSync');
    if (lastSync) {
      // Only sync new transactions
      const lastSyncDate = new Date(lastSync);
      const newTransactions = transactions.filter(t => 
        new Date(t.created_at || t.date) > lastSyncDate
      );
      
      for (const transaction of newTransactions) {
        await API.createTransaction(transaction);
      }
    } else {
      // First sync - migrate all
      for (const transaction of transactions) {
        await API.createTransaction(transaction);
      }
    }
    
    // Update last sync time
    await AsyncStorage.setItem('transactionsLastSync', new Date().toISOString());
  } catch (error) {
    console.error('Sync failed:', error);
  }
};
```

---

## 🧪 Testing Checklist

- [ ] Create transaction from discount redemption
- [ ] Create transaction from one-time gift
- [ ] Create transaction from monthly donation
- [ ] Get transaction history with filters
- [ ] Update transaction (edit savings)
- [ ] Delete transaction
- [ ] Get transaction summary
- [ ] Test pagination
- [ ] Test date filtering
- [ ] Test type filtering
- [ ] Verify data persists after app restart
- [ ] Verify cross-device sync

---

## 🚨 Critical Notes

1. **Backward Compatibility:** Keep local storage as fallback during migration
2. **Data Integrity:** Ensure transactions are created atomically with their source (redemption, gift, donation)
3. **Performance:** Use pagination for large transaction lists
4. **Audit Trail:** Consider soft delete instead of hard delete
5. **Error Handling:** Gracefully handle API failures, fallback to local storage

---

**Status:** ⚠️ **CRITICAL** - Implement immediately to prevent data loss


