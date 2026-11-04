/**
 * The vetting check is the one hard gate on submitting a charity profile, so
 * a false pass here puts an unvetted organisation in front of donors and a
 * false fail stops a legitimate charity from ever reaching review.
 *
 * The lookalike cases matter most: charitynavigator.org.evil.com is a domain
 * anyone can register, and a naive "contains" test would accept it as the
 * single strongest source.
 *
 * Run with Deno:
 *   deno run --allow-read supabase/functions/api/tests/vettingLinks.test.ts
 */
import { checkVettingReady, describeVettingLinks } from "../routes/charityPortal.ts";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) { pass++; } else { fail++; console.log("  FAIL:", name); }
};
const ready = (links: unknown) => checkVettingReady(links) === null;

// The rule
ok("CN alone is enough", ready(["https://www.charitynavigator.org/ein/123456789"]));
ok("CN without scheme", ready(["charitynavigator.org/ein/123"]));
ok("one non-CN is not enough", !ready(["https://www.give.org/charity-reviews/x"]));
ok("two distinct non-CN is enough", ready(["https://give.org/a", "https://charitywatch.org/b"]));
ok("same site twice is not enough", !ready(["https://give.org/a", "https://www.give.org/b"]));
ok("guidestar + charitywatch", ready(["https://guidestar.org/p/1", "https://charitywatch.org/c"]));
ok("nothing", !ready([]));
ok("null", !ready(null));

// Host matching
ok("subdomain accepted", ready(["https://apps.candid.org/x", "https://www.give.org/y"]));
ok("lookalike domain rejected", !ready(["https://notcharitynavigator.org/x"]));
ok("suffix attack rejected", !ready(["https://charitynavigator.org.evil.com/x"]));
ok("random site rejected", !ready(["https://example.com/we-are-great"]));
ok("CN lookalike does not satisfy alone",
   !ready(["https://charitynavigator.org.evil.com/x"]));

// describe
const d = describeVettingLinks(["https://give.org/a", "https://evil.com/b", "https://www.give.org/c"]);
ok("accepted dedupes by host", d.accepted.length === 1);
ok("unknown host is rejected, not silently dropped", d.rejected.length === 1);
ok("site label attached", d.accepted[0].site === "BBB Wise Giving Alliance");

// Message quality: no em/en dashes anywhere (project copy rule)
const msgs = [checkVettingReady([]), checkVettingReady(["https://give.org/a"])].filter(Boolean) as string[];
ok("messages carry no long dashes", msgs.every((m) => !m.includes("—") && !m.includes("–")));
ok("one-site message names the site", msgs.some((m) => m.includes("BBB Wise Giving Alliance")));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
