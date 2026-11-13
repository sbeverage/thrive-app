-- Make a redemption answerable: where did it come from, and what did it save?
--
-- Two gaps today, both of which make the question unanswerable rather than
-- merely hard.
--
-- 1. THE MONEY IS IN A DIFFERENT TABLE WITH NOTHING JOINING IT.
--    `redemptions` is written by POST /discounts/:id/redeem the moment the
--    code is revealed. The amounts are written by the savings form, which
--    calls POST /transactions and lands in `transactions`. There is no key
--    between them. You cannot even join on the code: redemption_code is set
--    to `discount.discount_code`, so every redemption of the same discount
--    carries an identical code. Pairing them today means matching on donor +
--    discount + a time window, which silently mispairs anyone who redeems the
--    same discount twice in an hour.
--
-- 2. NOTHING RECORDS WHY A REDEMPTION HAPPENED.
--    A donor who redeemed because a reminder told them they were standing in
--    the shop looks exactly like one who went hunting through the list. The
--    nearby-reminder log exists but writes to AsyncStorage on the device, so
--    it never reaches a server and no report can ever read it.
--
-- Everything here is additive and nullable. No existing row changes, no
-- existing query breaks, and rows written before this stay valid with NULLs
-- that honestly mean "we were not recording that yet".

-- ---------------------------------------------------------------- 1. the link
-- transactions.redemption_id, typed to match redemptions.id rather than
-- assumed. Guessing bigint against an integer key fails at the FK, after the
-- column already exists, which is a mess to unpick by hand.
DO $$
DECLARE
  id_type text;
BEGIN
  SELECT data_type INTO id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'redemptions' AND column_name = 'id';

  IF id_type IS NULL THEN
    RAISE EXCEPTION 'redemptions.id not found; refusing to guess';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
      AND column_name = 'redemption_id'
  ) THEN
    EXECUTE format('ALTER TABLE public.transactions ADD COLUMN redemption_id %s', id_type);
  END IF;
END $$;

-- ON DELETE SET NULL, not CASCADE. A redemption should never be deleted, but
-- if one ever is, losing the money record with it would quietly shrink the
-- savings totals a donor has already been shown. Same reasoning as the
-- RESTRICT rules on the money tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_redemption_id_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_redemption_id_fkey
      FOREIGN KEY (redemption_id) REFERENCES public.redemptions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transactions_redemption_id_idx
  ON public.transactions (redemption_id) WHERE redemption_id IS NOT NULL;

-- ------------------------------------------------------------ 2. attribution
-- Deliberately free text, no CHECK constraint. A CHECK here means every new
-- entry point needs a migration before it can be measured, and the first time
-- that is inconvenient somebody will send 'other' forever. The admin panel
-- maps known values to labels and shows anything unexpected verbatim.
--
-- Values the app sends today:
--   'notification'   a nearby reminder was tapped and led here
--   'browse'         the discounts list
--   'favorites'      the followed-businesses filter
--   'search'         the search field
--   'vendor_profile' opened from a specific business
--   'map'            tapped a pin
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Whatever the entry point knows that is worth keeping: which notification,
-- when it fired, which cluster. Lets us answer "how long between the reminder
-- and the till" without another table.
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS source_context JSONB;

CREATE INDEX IF NOT EXISTS redemptions_source_idx
  ON public.redemptions (source) WHERE source IS NOT NULL;

-- The admin view sorts and filters by time constantly, and this table only
-- grows. Cheap now, awkward to add once it is big.
CREATE INDEX IF NOT EXISTS redemptions_redeemed_at_idx ON public.redemptions (redeemed_at DESC);
CREATE INDEX IF NOT EXISTS redemptions_user_id_idx     ON public.redemptions (user_id);
CREATE INDEX IF NOT EXISTS redemptions_vendor_id_idx   ON public.redemptions (vendor_id);

-- ------------------------------------------------- 3. the missing denominator
-- Attribution on the redemption tells you which reminders worked. It cannot
-- tell you how many were sent, so it cannot give you a conversion rate, and a
-- conversion rate is the only thing that says whether reminders are helping
-- or quietly annoying people. One row per event.
CREATE TABLE IF NOT EXISTS public.notification_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL,              -- 'nearby_reminder', 'push', ...
  event         TEXT NOT NULL,              -- 'scheduled' | 'shown' | 'opened'
  vendor_id     INTEGER REFERENCES public.vendors(id) ON DELETE SET NULL,
  cluster_id    TEXT,                       -- the geofence region, where relevant
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  context       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_events_user_idx     ON public.notification_events (user_id);
CREATE INDEX IF NOT EXISTS notification_events_occurred_idx ON public.notification_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS notification_events_kind_idx     ON public.notification_events (kind, event);

-- Default deny for the anon key. The Edge Function uses the service role and
-- bypasses this; nothing else should read it.
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
