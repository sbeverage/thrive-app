import { corsHeaders } from "../lib/cors.ts";

/**
 * Every redemption, with enough context to learn something from it.
 *
 * GET /admin/redemptions
 *
 * The hard part is not the list, it is that a redemption's money lives in a
 * different table. `redemptions` is written when the code is revealed;
 * `transactions` is written by the savings form afterwards, which the donor
 * can skip. Rows written since the attribution migration carry
 * transactions.redemption_id and pair exactly. Older rows have no key at all,
 * not even a usable code (redemption_code is the discount's own code, shared
 * by every redemption of it), so they are paired on donor + discount within an
 * hour. That fallback is approximate and says so in the response: `pairing`
 * is "exact", "inferred" or "none" on every row, because a number nobody can
 * trace is worse than a blank.
 *
 * Aggregation happens in JS rather than SQL. PostgREST cannot express these
 * grouped counts without a view, and the table is in the low thousands at
 * most. MAX_ROWS caps it so this degrades into a visible error rather than a
 * slow mystery; revisit with a materialised view when that cap is reached.
 */

const MAX_ROWS = 5000;

/** Label map for the free-text `source` column. Unknown values pass through. */
const SOURCE_LABELS: Record<string, string> = {
  notification: "Nearby reminder",
  browse: "Discounts list",
  favorites: "Following",
  search: "Search",
  vendor_profile: "Business page",
  map: "Map",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function handleAdminRedemptions(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  if (method !== "GET" || !route.startsWith("/admin/redemptions")) return null;

  try {
    const url = new URL(req.url);
    const q = url.searchParams;
    const from = q.get("from");          // ISO date, inclusive
    const to = q.get("to");              // ISO date, inclusive
    const vendorId = num(q.get("vendorId"));
    const donorId = num(q.get("donorId"));
    const source = q.get("source");

    // ---------------------------------------------------------- redemptions
    let rq = supabase
      .from("redemptions")
      .select(
        "id, user_id, discount_id, vendor_id, redeemed_at, total_bill, total_savings, redemption_code, source, source_context",
      )
      .order("redeemed_at", { ascending: false })
      .limit(MAX_ROWS + 1);

    if (from) rq = rq.gte("redeemed_at", new Date(from).toISOString());
    if (to) {
      // `to` is a date the user picked; make it inclusive of that whole day.
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      rq = rq.lte("redeemed_at", end.toISOString());
    }
    if (vendorId !== null) rq = rq.eq("vendor_id", vendorId);
    if (donorId !== null) rq = rq.eq("user_id", donorId);
    if (source) rq = rq.eq("source", source);

    const { data: redemptions, error } = await rq;
    if (error) {
      console.error("admin/redemptions query failed:", error);
      return json({ error: "Could not load redemptions." }, 500);
    }

    const rows = redemptions || [];
    const truncated = rows.length > MAX_ROWS;
    const list = truncated ? rows.slice(0, MAX_ROWS) : rows;

    // -------------------------------------------------------------- lookups
    // Names come from separate queries. Each degrades to an empty map and
    // logs rather than failing the page: a redemption list with a missing
    // vendor name is still useful, a 500 is not.
    const userIds = [...new Set(list.map((r: any) => r.user_id).filter(Boolean))];
    const vendorIds = [...new Set(list.map((r: any) => r.vendor_id).filter(Boolean))];
    const discountIds = [...new Set(list.map((r: any) => r.discount_id).filter(Boolean))];

    const lookup = async (
      table: string,
      ids: unknown[],
      columns: string,
    ): Promise<Map<number, any>> => {
      if (!ids.length) return new Map();
      const { data, error: e } = await supabase.from(table).select(columns).in("id", ids);
      if (e) {
        console.warn(`admin/redemptions ${table} lookup failed:`, e);
        return new Map();
      }
      return new Map((data || []).map((d: any) => [d.id, d]));
    };

    const [users, vendors, discounts] = await Promise.all([
      lookup("users", userIds, "id, first_name, last_name, email, created_at"),
      lookup("vendors", vendorIds, "id, name, category"),
      lookup("discounts", discountIds, "id, title, discount_code"),
    ]);

    // ---------------------------------------------------- money, paired back
    // Exact pairing where the link exists, inferred where it does not.
    const txByRedemption = new Map<number, any>();
    const txLoose: any[] = [];
    if (list.length) {
      const { data: txs, error: txErr } = await supabase
        .from("transactions")
        .select("id, user_id, discount_id, savings, spending, created_at, redemption_id")
        .eq("type", "redemption")
        .in("user_id", userIds.length ? userIds : [-1]);

      if (txErr) {
        console.warn("admin/redemptions transaction lookup failed:", txErr);
      } else {
        for (const t of txs || []) {
          if (t.redemption_id != null) txByRedemption.set(t.redemption_id, t);
          else txLoose.push(t);
        }
      }
    }

    const HOUR = 60 * 60 * 1000;
    const pairLoose = (r: any) => {
      const at = new Date(r.redeemed_at).getTime();
      let best: any = null;
      let bestGap = Infinity;
      for (const t of txLoose) {
        if (t.user_id !== r.user_id) continue;
        if (t.discount_id !== r.discount_id) continue;
        const gap = Math.abs(new Date(t.created_at).getTime() - at);
        if (gap <= HOUR && gap < bestGap) {
          best = t;
          bestGap = gap;
        }
      }
      return best;
    };

    // --------------------------------------------------------------- shape
    const shaped = list.map((r: any) => {
      const u = users.get(r.user_id);
      const v = vendors.get(r.vendor_id);
      const d = discounts.get(r.discount_id);

      let pairing: "exact" | "inferred" | "none" = "none";
      let tx = txByRedemption.get(r.id) || null;
      if (tx) pairing = "exact";
      else {
        tx = pairLoose(r);
        if (tx) pairing = "inferred";
      }

      // The redemption's own columns win when present: they were recorded at
      // the moment of redemption rather than reconstructed.
      const savings = num(r.total_savings) ?? num(tx?.savings);
      const bill = num(r.total_bill) ?? num(tx?.spending);
      if (num(r.total_savings) !== null) pairing = "exact";

      const at = new Date(r.redeemed_at);
      const ctx = r.source_context || null;
      // Minutes from the reminder firing to the code being revealed. Only
      // meaningful when the app recorded when it fired.
      const sentAt = ctx?.notification_sent_at ? new Date(ctx.notification_sent_at) : null;

      return {
        id: r.id,
        redeemed_at: r.redeemed_at,
        hour_of_day: at.getUTCHours(),
        day_of_week: at.getUTCDay(),
        donor: u
          ? {
              id: u.id,
              name: [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
              email: u.email,
              days_since_signup: u.created_at
                ? Math.floor((at.getTime() - new Date(u.created_at).getTime()) / 86400000)
                : null,
            }
          : { id: r.user_id, name: null, email: null, days_since_signup: null },
        vendor: v
          ? { id: v.id, name: v.name, category: v.category }
          : { id: r.vendor_id, name: null, category: null },
        discount: d
          ? { id: d.id, title: d.title }
          : { id: r.discount_id, title: null },
        total_bill: bill,
        total_savings: savings,
        // What fraction of the bill the discount covered. Null rather than 0
        // when either side is missing, so empty never reads as "saved nothing".
        savings_rate:
          bill !== null && savings !== null && bill > 0
            ? Math.round((savings / bill) * 1000) / 10
            : null,
        pairing,
        source: r.source || null,
        source_label: r.source ? SOURCE_LABELS[r.source] || r.source : null,
        source_context: ctx,
        minutes_from_reminder:
          sentAt && !Number.isNaN(sentAt.getTime())
            ? Math.round((at.getTime() - sentAt.getTime()) / 60000)
            : null,
      };
    });

    // ------------------------------------------------------------- summary
    const withSavings = shaped.filter((r) => r.total_savings !== null);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const savingsValues = withSavings.map((r) => r.total_savings as number);
    const billValues = shaped.filter((r) => r.total_bill !== null).map((r) => r.total_bill as number);

    const countBy = (key: (r: any) => string | null) => {
      const m = new Map<string, number>();
      for (const r of shaped) {
        const k = key(r);
        if (k === null) continue;
        m.set(k, (m.get(k) || 0) + 1);
      }
      return [...m.entries()]
        .map(([k, count]) => ({ key: k, count }))
        .sort((a, b) => b.count - a.count);
    };

    // Donors who redeemed more than once, which is the signal that a discount
    // became a habit rather than a novelty.
    const perDonor = new Map<number, number>();
    for (const r of shaped) {
      if (r.donor.id == null) continue;
      perDonor.set(r.donor.id, (perDonor.get(r.donor.id) || 0) + 1);
    }
    const repeatDonors = [...perDonor.values()].filter((n) => n > 1).length;

    const summary = {
      redemptions: shaped.length,
      distinct_donors: perDonor.size,
      distinct_vendors: new Set(shaped.map((r) => r.vendor.id).filter(Boolean)).size,
      repeat_donors: repeatDonors,
      repeat_rate: perDonor.size ? Math.round((repeatDonors / perDonor.size) * 1000) / 10 : null,

      // The completion rate of the savings form. Everything money-shaped below
      // is computed over this subset only, never over the whole list, or the
      // averages quietly understate by however many donors skipped the form.
      with_savings: withSavings.length,
      savings_capture_rate: shaped.length
        ? Math.round((withSavings.length / shaped.length) * 1000) / 10
        : null,

      total_savings: savingsValues.length ? Math.round(sum(savingsValues) * 100) / 100 : null,
      total_spend: billValues.length ? Math.round(sum(billValues) * 100) / 100 : null,
      average_savings: savingsValues.length
        ? Math.round((sum(savingsValues) / savingsValues.length) * 100) / 100
        : null,

      by_source: countBy((r) => r.source_label),
      by_vendor: countBy((r) => r.vendor.name).slice(0, 10),
      by_hour: countBy((r) => String(r.hour_of_day)),
      by_day_of_week: countBy((r) => String(r.day_of_week)),

      // Attribution is only as old as the migration that added it. Saying so
      // stops a 2% notification share being read as "reminders do not work"
      // when it really means "most of these rows predate the column".
      attributed: shaped.filter((r) => r.source !== null).length,
    };

    return json({
      redemptions: shaped,
      summary,
      truncated,
      max_rows: MAX_ROWS,
    });
  } catch (e) {
    console.error("admin/redemptions failed:", e);
    return json({ error: "Could not load redemptions." }, 500);
  }
}
