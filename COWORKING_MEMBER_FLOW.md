# Coworking Member Donor Flow

## Overview
Coworking members are invited from the admin panel and complete a special signup flow:
- Email + name prefilled from invite
- Set password, phone number, and optional photo
- Select a charity
- $15/month sponsor contribution is applied
- Optional extra donation starts at $5 (charged to user card)
- Total donation = sponsor + extra
- If no extra, skip payment and show welcome modal + tutorial

---

## Frontend Steps (thrive-app)

### 1) Invite verification + profile completion
Screen: `app/donorInvitationVerify.js`
- Prefills email + name
- Collects password, phone, optional photo
- If coworking invite, routes to `signupFlow/explainerDonate` with params

### 2) Explainer -> Charity selection
Screen: `app/signupFlow/explainerDonate.js`
- Passes `flow=coworking` + sponsor amount to `beneficiarySignupCause`

### 3) Charity selection
Screen: `app/signupFlow/beneficiarySignupCause.js`
- If `flow=coworking`, routes to `coworkingDonationPrompt`
- Else, normal donation flow

### 4) Coworking donation prompt
Screen: `app/signupFlow/coworkingDonationPrompt.js`
- Displays sponsor amount (default $15)
- "No thanks" -> save sponsor + show welcome modal
- "Yes, add more" -> `coworkingExtraDonation`

### 5) Extra donation (min $5)
Screen: `app/signupFlow/coworkingExtraDonation.js`
- Slider min $5, max $250
- Sends extra-only to payment screen (`stripeIntegration`)

### 6) Payment (only extra)
Screen: `app/signupFlow/stripeIntegration.js`
- Uses amount passed from coworking flow

---

## Backend Steps (thrive-backend)

### Required fields on `users`
Migration already exists:
`supabase/migrations/20260125000000_add_coworking_invite_fields.sql`

Fields:
- `coworking` (boolean)
- `invite_type` (text)
- `sponsor_amount`
- `external_billed`
- `extra_donation_amount`
- `total_monthly_donation`

### Invite creation (admin)
Endpoint: `POST /admin/donors`
Location: `supabase/functions/api/index.ts`
- Sets `invite_type='coworking'` when coworking selected
- Sets `sponsor_amount` (default 15)

### Verify invite
Endpoint: `GET /auth/verify-email`
Returns:
- `coworking`, `inviteType`, `sponsorAmount`

### Complete invited signup
Endpoint: `POST /auth/signup`
Accepts:
- `phone`, `profileImageUrl`
- `coworking`, `inviteType`, `sponsorAmount`
- `extraDonationAmount`, `totalMonthlyDonation`

---

## Admin Panel Steps (ti-admin-panel)

### Invite Donor
Screen: `src/components/InviteDonorModal.tsx`
- Select **Coworking Member = Yes**
- Sponsor Amount defaults to 15

### Create donor invite
Screen: `src/components/Donors.tsx`
Sends:
- `coworking`
-, `sponsorAmount`
- `inviteType: 'coworking'`

---

## UX Notes
- Extra donation minimum: **$5**
- Total monthly donation displayed as: **Coworking + You**
- If extra = 0: skip payment and show welcome modal + tutorial


