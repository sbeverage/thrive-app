# Discount Redeemed → Transaction History: Complete Setup Guide

**Your setup: Supabase is the main backend.**

The mobile app uses Supabase Edge Functions (`https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1`). The transactions API is implemented in Supabase, not in the Express thrive-backend. You do **not** need to move to Express.

---

## 📋 What's Already in Place

### Mobile app (thrive-app)
- **DiscountApproved**: Calls `API.createTransaction()` when you save; falls back to local storage if the API fails.
- **Transaction History**: Loads from the backend, merges in local-only transactions when the API is unavailable.
- **API calls**: `GET /api/transactions`, `POST /api/transactions`, `GET /api/transactions/summary` via `api.js`.

### Supabase
- **Transactions table** is defined in migration `supabase/migrations/20250124000002_add_transactions.sql`.
- **Edge Function** `api` implements the transactions endpoints.
- **Admin panel** reads from the transactions table via the Supabase client (it does not expose transactions API for the mobile app).

---

## ✅ What to Do (Concrete Steps)

### 1. Keep the app pointing at Supabase

In **`app/utils/constants.js`**, keep:

```javascript
export const BACKEND_URL = 'https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1';
```

The app will call:
- `GET {BACKEND_URL}/api/transactions`
- `POST {BACKEND_URL}/api/transactions`
- `GET {BACKEND_URL}/api/transactions/summary`

(i.e. full URLs like `https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1/api/transactions`)

### 2. Ensure the transactions table exists in Supabase

In **Supabase Dashboard** → **SQL Editor**, run the contents of:

```
supabase/migrations/20250124000002_add_transactions.sql
```

(Or run `supabase db push` / your usual migration process so that migration is applied.)

> **Note:** The `supabase` folder may be in a parent directory or different repo. Run the migration from wherever your Supabase project lives.

### 3. Deploy the Edge Function

From the repo that contains your Supabase config:

```bash
supabase functions deploy api
```

### 4. Match the app's API calls to Supabase

**POST /api/transactions** (create) expects a JSON body with at least:

| Field     | Required | Description                                      |
|-----------|----------|--------------------------------------------------|
| `type`    | ✅       | `'redemption'`, `'one_time_gift'`, `'monthly_donation'` |
| `amount`  |          | Transaction amount                               |
| `description` |    | e.g. discount title                             |
| `reference_id` |    | Related entity ID                           |
| `reference_type` |    | e.g. `'discount'`                          |
| `metadata` |       | Extra data (e.g. `{ vendor_name: "..." }`)      |
| `discount_id`, `vendor_id`, `savings`, `spending` | | Discount-specific fields |

**GET /api/transactions** supports query params: `page`, `limit`, `type`, `start_date`, `end_date`.

**Auth:** Authenticated requests must send the JWT in the `Authorization: Bearer <token>` header (same as your other Supabase API calls).

**Current app payload** (from `DiscountApproved.js`):
- `type`, `description`, `discount_code`, `savings`, `spending`, `discount_id`, `vendor_id`, `metadata`
- ✅ Matches what Supabase expects.

### 5. Test

1. **Create a transaction**: Redeem a discount → enter total bill and savings → save (app sends `POST /api/transactions`).
2. **View history**: Open Transaction History (app sends `GET /api/transactions`).
3. **Verify**: Records appear and look correct.

---

## Checklist

- [ ] `BACKEND_URL` in `constants.js` is the Supabase functions URL (no change needed if already correct)
- [ ] Migration `20250124000002_add_transactions.sql` has been applied in Supabase
- [ ] Edge Function deployed: `supabase functions deploy api`
- [ ] User is logged in (auth token in `AsyncStorage`) when testing
- [ ] Test: Redeem discount → save → check Transaction History

---

## Troubleshooting

| Problem | Things to check |
|---------|------------------|
| Transaction not in history | Migration applied? Edge function deployed? Auth token sent? Check Supabase logs. |
| 401 Unauthorized | User logged in? `authToken` in AsyncStorage? Token valid? |
| 404 Not Found | Edge function `api` deployed? URL uses correct project ref? |
| 500 Server error | Supabase Edge Function logs; table schema vs. request body. |

---

## Path A (Express) – Only if you move off Supabase

Use the Express `thrive-backend` only if you decide to point the app at an Express server (e.g. Elastic Beanstalk) instead of Supabase. You would then:

- Add Express routes for `GET/POST /api/transactions` and `GET /api/transactions/summary`
- Have that server talk to Supabase DB (or another DB)
- Change `BACKEND_URL` in the app to the Express URL

**Recommendation:** Keep Supabase as the main backend and follow the steps above.
