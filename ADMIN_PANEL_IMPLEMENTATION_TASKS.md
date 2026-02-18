# 🎛️ Admin Panel Implementation Tasks

**Target:** React/Next.js Admin Panel  
**Priority:** Critical → High → Medium

---

## 🔴 CRITICAL: Monthly Donations Dashboard

### Create Route

**File:** `admin-panel/src/pages/admin/monthly-donations/index.tsx`

**Features:**
- [ ] Display all active subscriptions in table
- [ ] Columns: User, Amount, Beneficiary, Status, Next Payment, Created
- [ ] Filter by status (active, paused, cancelled)
- [ ] Filter by beneficiary
- [ ] Filter by date range
- [ ] Search by user email/name
- [ ] Pagination
- [ ] Export to CSV

**Components Needed:**
- `MonthlyDonationsTable.tsx`
- `MonthlyDonationsFilters.tsx`
- `MonthlyDonationsStats.tsx`

**API Endpoints to Use:**
- `GET /api/admin/monthly-donations` - List all subscriptions
- `GET /api/admin/monthly-donations/stats` - Get statistics

---

### Subscription Details Page

**File:** `admin-panel/src/pages/admin/monthly-donations/[id].tsx`

**Features:**
- [ ] Display subscription details
- [ ] Show user information
- [ ] Show beneficiary information
- [ ] Show payment history
- [ ] Show subscription timeline
- [ ] Admin actions:
  - [ ] Pause subscription
  - [ ] Resume subscription
  - [ ] Cancel subscription
  - [ ] Update amount (admin override)
  - [ ] Change beneficiary

**API Endpoints to Use:**
- `GET /api/admin/monthly-donations/:id` - Get subscription details
- `POST /api/admin/monthly-donations/:id/pause` - Pause subscription
- `POST /api/admin/monthly-donations/:id/resume` - Resume subscription
- `DELETE /api/admin/monthly-donations/:id` - Cancel subscription

---

### Statistics Dashboard

**Component:** `MonthlyDonationsStats.tsx`

**Metrics to Display:**
- [ ] Total Monthly Recurring Revenue (MRR)
- [ ] Active subscriptions count
- [ ] Cancelled subscriptions count
- [ ] Churn rate
- [ ] Average donation amount
- [ ] Revenue by beneficiary (chart)
- [ ] Revenue trends (chart)
- [ ] New subscriptions this month

---

## 🔴 CRITICAL: Transaction Dashboard

### Create Route

**File:** `admin-panel/src/pages/admin/transactions/index.tsx`

**Features:**
- [ ] Display all transactions in table
- [ ] Columns: User, Type, Amount, Description, Date, Status
- [ ] Filter by type (redemption, one_time_gift, monthly_donation)
- [ ] Filter by user
- [ ] Filter by date range
- [ ] Filter by status
- [ ] Search by user, vendor, beneficiary
- [ ] Pagination
- [ ] Export to CSV

**Components Needed:**
- `TransactionsTable.tsx`
- `TransactionsFilters.tsx`
- `TransactionsStats.tsx`

**API Endpoints to Use:**
- `GET /api/admin/transactions` - List all transactions
- `GET /api/admin/transactions/stats` - Get statistics

---

### Transaction Details Page

**File:** `admin-panel/src/pages/admin/transactions/[id].tsx`

**Features:**
- [ ] Display transaction details
- [ ] Show user information
- [ ] Show related data (discount, gift, donation)
- [ ] Show transaction metadata
- [ ] Admin actions:
  - [ ] Edit transaction (admin override)
  - [ ] Delete transaction (with confirmation)
  - [ ] Refund transaction (if applicable)

**API Endpoints to Use:**
- `GET /api/admin/transactions/:id` - Get transaction details
- `PUT /api/admin/transactions/:id` - Update transaction
- `DELETE /api/admin/transactions/:id` - Delete transaction

---

### Statistics Dashboard

**Component:** `TransactionsStats.tsx`

**Metrics to Display:**
- [ ] Total transactions count
- [ ] Total revenue
- [ ] Total savings
- [ ] Transactions by type (chart)
- [ ] Revenue trends (chart)
- [ ] Top users by spending
- [ ] Top vendors by redemptions
- [ ] Top beneficiaries by donations

---

## 🟡 HIGH: Beneficiary/Charity Management

### Create Route

**File:** `admin-panel/src/pages/admin/beneficiaries/index.tsx`

**Features:**
- [ ] Display all beneficiaries in table
- [ ] Columns: Name, Category, Location, Status, Created
- [ ] Filter by category
- [ ] Filter by location
- [ ] Search by name
- [ ] Pagination
- [ ] Create new beneficiary button

**Components Needed:**
- `BeneficiariesTable.tsx`
- `BeneficiariesFilters.tsx`

**API Endpoints to Use:**
- `GET /api/admin/charities` - List all beneficiaries
- `POST /api/admin/charities` - Create beneficiary

**Reference:** `BENEFICIARY_ADMIN_PANEL_FIELDS.md`

---

### Beneficiary Form (Create/Edit)

**File:** `admin-panel/src/pages/admin/beneficiaries/new.tsx`  
**File:** `admin-panel/src/pages/admin/beneficiaries/[id]/edit.tsx`

**Form Fields:**
- [ ] Name (required)
- [ ] Category (dropdown)
- [ ] Description/About
- [ ] Location (with geocoding)
- [ ] Latitude/Longitude (auto-filled from location)
- [ ] Image upload
- [ ] EIN Number
- [ ] Website
- [ ] Phone
- [ ] Profile Links (array of channel + username)
- [ ] Status (active/inactive)

**Components Needed:**
- `BeneficiaryForm.tsx`
- `ImageUpload.tsx`
- `ProfileLinksInput.tsx`
- `LocationInput.tsx`

**API Endpoints to Use:**
- `POST /api/admin/charities` - Create beneficiary
- `PUT /api/admin/charities/:id` - Update beneficiary
- `POST /api/admin/storage/upload` - Upload image
- `DELETE /api/admin/storage/delete` - Delete image

**Reference:** `BENEFICIARY_ADMIN_PANEL_SCHEMA.md`

---

### Beneficiary Details Page

**File:** `admin-panel/src/pages/admin/beneficiaries/[id].tsx`

**Features:**
- [ ] Display beneficiary details
- [ ] Show image
- [ ] Show profile links
- [ ] Show donation statistics
- [ ] Show one-time gift statistics
- [ ] Admin actions:
  - [ ] Edit beneficiary
  - [ ] Delete beneficiary
  - [ ] Upload new image

---

## 🟡 HIGH: Donor Management

### Create Route

**File:** `admin-panel/src/pages/admin/donors/index.tsx`

**Features:**
- [ ] Display all donors in table
- [ ] Columns: Name, Email, Location, Total Donated, Status
- [ ] Filter by location
- [ ] Filter by status
- [ ] Search by name/email
- [ ] Pagination

**Components Needed:**
- `DonorsTable.tsx`
- `DonorsFilters.tsx`

**API Endpoints to Use:**
- `GET /api/admin/donors` - List all donors
- `GET /api/admin/donors/stats` - Get statistics

---

### Donor Details Page

**File:** `admin-panel/src/pages/admin/donors/[id].tsx`

**Features:**
- [ ] Display donor information
- [ ] Show address (object format: city, state, zipCode, street)
- [ ] Show donation history
- [ ] Show monthly subscription details
- [ ] Show one-time gifts
- [ ] Show transaction history
- [ ] Show points balance
- [ ] Admin actions:
  - [ ] Edit donor
  - [ ] View payment methods
  - [ ] Manually adjust points

---

## 🟡 HIGH: Invitation Management

### Create Route

**File:** `admin-panel/src/pages/admin/invitations/index.tsx`

**Features:**
- [ ] Display all invitations in table
- [ ] Columns: Type, Contact Name, Email, Status, Inviter, Date
- [ ] Filter by type (vendor, beneficiary)
- [ ] Filter by status (pending, approved, rejected)
- [ ] Filter by date range
- [ ] Search by contact name/email
- [ ] Pagination

**Components Needed:**
- `InvitationsTable.tsx`
- `InvitationsFilters.tsx`

**API Endpoints to Use:**
- `GET /api/admin/invitations` - List all invitations
- `POST /api/admin/invitations/:id/approve` - Approve invitation
- `POST /api/admin/invitations/:id/reject` - Reject invitation

---

### Invitation Details Page

**File:** `admin-panel/src/pages/admin/invitations/[id].tsx`

**Features:**
- [ ] Display invitation details
- [ ] Show inviter information
- [ ] Show invitation data (company name, email, etc.)
- [ ] Show invitation message
- [ ] Admin actions:
  - [ ] Approve invitation
  - [ ] Reject invitation (with reason)
  - [ ] Send notification email

---

## 🟡 HIGH: Referral Dashboard

### Create Route

**File:** `admin-panel/src/pages/admin/referrals/index.tsx`

**Features:**
- [ ] Display referral relationships
- [ ] Show referrer and referred users
- [ ] Show referral status
- [ ] Show milestone progress
- [ ] Filter by status
- [ ] Search by user
- [ ] Pagination

**Components Needed:**
- `ReferralsTable.tsx`
- `ReferralsFilters.tsx`
- `ReferralStats.tsx`

**API Endpoints to Use:**
- `GET /api/admin/referrals` - List all referrals
- `GET /api/admin/referrals/stats` - Get statistics

---

### Referral Statistics

**Component:** `ReferralStats.tsx`

**Metrics to Display:**
- [ ] Total referrals
- [ ] Active referrals
- [ ] Paid referrals count
- [ ] Total rewards given
- [ ] Top referrers
- [ ] Referral conversion rate

---

## 🟡 HIGH: Points Management

### Create Route

**File:** `admin-panel/src/pages/admin/points/index.tsx`

**Features:**
- [ ] Display user points balances
- [ ] Columns: User, Points Balance, Last Updated
- [ ] Search by user
- [ ] Filter by points range
- [ ] Pagination

**Components Needed:**
- `PointsTable.tsx`
- `PointsFilters.tsx`

---

### User Points Details

**File:** `admin-panel/src/pages/admin/points/[userId].tsx`

**Features:**
- [ ] Display user's points balance
- [ ] Show points transaction history
- [ ] Show points by source (redemption, referral, etc.)
- [ ] Admin actions:
  - [ ] Manually add points
  - [ ] Manually subtract points
  - [ ] Set points to specific amount

**API Endpoints to Use:**
- `GET /api/admin/users/:id/points` - Get user points
- `POST /api/admin/users/:id/points/add` - Add points (admin)
- `GET /api/admin/users/:id/points/history` - Get points history

---

## 📝 Common Components Needed

### Shared Components:

- [ ] `DataTable.tsx` - Reusable table component
- [ ] `Filters.tsx` - Reusable filter component
- [ ] `Pagination.tsx` - Reusable pagination
- [ ] `StatsCard.tsx` - Reusable stats card
- [ ] `Chart.tsx` - Reusable chart component
- [ ] `ImageUpload.tsx` - Image upload component
- [ ] `LocationInput.tsx` - Location input with geocoding
- [ ] `ProfileLinksInput.tsx` - Profile links array input

---

## 🔌 API Service Updates

### Update API Service

**File:** `admin-panel/src/services/api.ts`

**Add Methods:**

```typescript
// Monthly Donations
getMonthlyDonations(filters) 
getMonthlyDonation(id)
pauseMonthlyDonation(id)
resumeMonthlyDonation(id)
cancelMonthlyDonation(id)
getMonthlyDonationsStats()

// Transactions
getTransactions(filters)
getTransaction(id)
updateTransaction(id, data)
deleteTransaction(id)
getTransactionsStats()

// Beneficiaries
getBeneficiaries(filters)
getBeneficiary(id)
createBeneficiary(data)
updateBeneficiary(id, data)
deleteBeneficiary(id)
uploadBeneficiaryImage(id, file)

// Donors
getDonors(filters)
getDonor(id)
updateDonor(id, data)
getDonorStats()

// Invitations
getInvitations(filters)
getInvitation(id)
approveInvitation(id)
rejectInvitation(id, reason)

// Referrals
getReferrals(filters)
getReferralStats()

// Points
getUserPoints(userId)
addUserPoints(userId, points, reason)
getUserPointsHistory(userId)
```

---

## 🎨 UI/UX Considerations

### Design System:

- [ ] Use consistent color scheme
- [ ] Use consistent spacing
- [ ] Use consistent typography
- [ ] Use consistent button styles
- [ ] Use consistent form styles

### User Experience:

- [ ] Loading states for all async operations
- [ ] Error messages for failed operations
- [ ] Success messages for completed operations
- [ ] Confirmation dialogs for destructive actions
- [ ] Toast notifications for actions
- [ ] Responsive design for mobile/tablet

---

## 🧪 Testing

### Test Each Feature:

- [ ] Test CRUD operations
- [ ] Test filters and search
- [ ] Test pagination
- [ ] Test image uploads
- [ ] Test form validation
- [ ] Test error handling
- [ ] Test loading states
- [ ] Test responsive design

---

## 📋 Implementation Order

### Week 1-2:
1. ✅ Monthly Donations Dashboard
2. ✅ Transaction Dashboard

### Week 3:
3. ✅ Beneficiary Management
4. ✅ Donor Management

### Week 4:
5. ✅ Invitation Management
6. ✅ Referral Dashboard
7. ✅ Points Management

---

**Status:** Ready for implementation  
**Reference:** See `IMPLEMENTATION_CHECKLIST.md` for full details


