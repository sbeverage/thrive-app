# Updating the admin panel for non-monetary referral rewards

The mobile app and Edge API now use **three fixed recognition tiers** (no donor cash credits):

| Paid friends\* | Recognition |
|----------------|-------------|
| 1 | Supporter Badge |
| 3 | Champion Badge |
| 5 | Website spotlight |

\*A “paid friend” is a referral with status **`paid`** (first successful donation), same as before.

## What we changed in code (already in repo)

- **`app/constants/referralRewards.js`** — Single source of truth for tier counts and copy in the app.
- **`supabase/functions/api/index.ts`** — `GET /referrals/info` returns all three tiers with `unlocked` / `earnedAt`; `totalEarned` is always `"0"`; optional `tiersUnlocked` / `tiersTotal`.
- **`components/InviteFriendsModal.js`** & **`app/(tabs)/home.js`** — UI shows “Recognition tiers unlocked” instead of credits.

Deploy the API after pulling: `supabase functions deploy api`.

## Admin panel: recommended updates

Do these in whatever admin UI talks to your Supabase / `user_milestones` / `user_credits` / `check_referral_milestones` RPC.

### 1. Milestone configuration screen (if you have one)

- Set **three milestones** with counts **1, 3, and 5** (remove or ignore old 5/10/25 credit tiers if they only existed for cash).
- For each row:
  - **`credit_amount`**: set to **`0`** (no monetary reward).
  - **`badge_name`**: e.g. `supporter`, `champion`, `website_spotlight` (match whatever you store for reporting).
  - **`reward_description`**: optional override shown in the app if you want custom wording; otherwise the app uses the canonical strings from the API constants.

### 2. Database function `check_referral_milestones`

- Open the function in **Supabase Dashboard → SQL** (or your migration repo).
- Ensure it **inserts/updates `user_milestones`** for **`milestone_count` in (1, 3, 5)** when paid referral counts cross those thresholds.
- **Stop granting** or **zero out** any logic that adds **`user_credits`** for referrals (or leave credits unused; the app no longer displays them).

### 3. Reporting / finance views

- Remove or relabel columns that show “referral credit earned” for donors if they’re now always zero.
- Add or keep columns for **badge / milestone unlocked** and **eligible for website feature** (5+ paid referrals).

### 4. Website “featured ambassadors” workflow

- Tier 5 is **manual fulfillment**: when `user_milestones` (or referral count) shows a user hit **5 paid referrals**, your team adds them to the marketing site.
- Optionally: add an admin flag `featured_on_website` or a CRM step so content editors know whom to feature.

### 5. Copy / legal / email

- Update any admin-triggered or automated emails that still say “earn credit” or “cash rewards” for referrals—the Edge **`sendReferralReminderEmail`** template should be reviewed in `index.ts` to match the new program.

### 6. Testing checklist

1. User A refers User B; B reaches **paid** → A sees **tier 1** unlocked in the app.
2. Repeat until **3** and **5** paid referrals → **Champion** and **spotlight** tier show unlocked.
3. `GET /referrals/info` (with Bearer token) returns **3 milestones**, correct `unlocked`, no reliance on dollar amounts.

If your admin panel is a separate codebase, mirror the same **1 / 3 / 5** thresholds and **non-monetary** reward fields there; keep **`app/constants/referralRewards.js`** and **`REFERRAL_TIERS`** in `index.ts` aligned whenever marketing changes the copy.
