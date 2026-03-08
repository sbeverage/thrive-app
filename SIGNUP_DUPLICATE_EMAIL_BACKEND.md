# Sign Up: Duplicate Email Handling (Backend)

The mobile app now handles duplicate-email errors and supports an optional pre-check.

## Backend requirements

### 1. Signup endpoint must reject duplicate emails

When `POST /api/auth/signup` receives an email that already exists, it should return:

- **Status:** `409 Conflict` or `400 Bad Request`
- **Body (example):**
  ```json
  {
    "message": "Email already in use",
    "error": "Email already in use"
  }
  ```

The app shows: *"This email is already registered. Please log in or use a different email."*

Ensure your signup logic checks both:

- Supabase `auth.users` (or your auth provider)
- Any admin-managed users (e.g. users created in the Admin panel)

### 2. Optional: Check-email endpoint

For an immediate duplicate check before submit, implement:

**`GET /api/auth/check-email?email=user@example.com`**

- **If email is available:** `200` with `{ "available": true }`
- **If email is taken:** `409` or `200` with `{ "available": false }`
- **If endpoint is not implemented:** App still works; it will rely on the signup endpoint to reject duplicates.

Add this route to your Supabase Edge Functions (or Express) if you want the pre-check.
