/**
 * emailMatchesCharityDomain decides whether a claim on an existing charity
 * arrives pre-verified or has to be checked by hand, so a false positive here
 * is how someone gets handed a charity profile they do not work for.
 *
 * Run with Deno:   deno run --allow-read supabase/functions/api/tests/emailMatchesCharityDomain.test.ts
 * Or bundle it for node, which is what was used while writing it, since the
 * module imports a remote djwt the function under test never touches.
 */
import { emailMatchesCharityDomain } from "../routes/charityPortal.ts";

const cases: [string, unknown, unknown, boolean][] = [
  // --- should MATCH ---
  ["plain host",            "maria@hopecenter.org",    "hopecenter.org",              true],
  ["https + www site",      "maria@hopecenter.org",    "https://www.hopecenter.org",  true],
  ["site with path",        "maria@hopecenter.org",    "https://hopecenter.org/about",true],
  ["subdomain mail",        "m@mail.hopecenter.org",   "https://hopecenter.org",      true],
  ["uppercase email",       "MARIA@HopeCenter.ORG",    "hopecenter.org",              true],
  ["site with port",        "m@hopecenter.org",        "http://hopecenter.org:8080",  true],
  ["trailing space",        " maria@hopecenter.org ",  " hopecenter.org ",            true],

  // --- must NOT match: these are the ones that matter ---
  ["lookalike suffix",      "a@nothopecenter.org",     "hopecenter.org",              false],
  ["attacker owns prefix",  "a@hopecenter.org.evil.com","hopecenter.org",             false],
  ["different tld",         "a@hopecenter.com",        "hopecenter.org",              false],
  ["gmail",                 "maria@gmail.com",         "hopecenter.org",              false],
  ["charity site IS gmail", "maria@gmail.com",         "gmail.com",                   false],
  ["icloud",                "m@icloud.com",            "hopecenter.org",              false],
  ["no website on file",    "maria@hopecenter.org",    null,                          false],
  ["empty website",         "maria@hopecenter.org",    "",                            false],
  ["no email",              null,                      "hopecenter.org",              false],
  ["garbage email",         "not-an-email",            "hopecenter.org",              false],
  // The website column holding an email is bad data, not an attack. hostOf
  // strips the local part deliberately, and the result is still the right
  // answer: an org address in there matches that org...
  ["website holds org email",  "maria@hopecenter.org", "contact@hopecenter.org",   true],
  // ...and a free-mail address in there matches nobody, which is the case
  // that would actually be dangerous if it did.
  ["website holds free mail",  "attacker@gmail.com",   "someone@gmail.com",        false],
  ["website is bare free mail","attacker@gmail.com",   "gmail.com",                false],
];

let pass = 0, fail = 0;
for (const [label, email, site, want] of cases) {
  const got = emailMatchesCharityDomain(email, site);
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL  ${label}: ${JSON.stringify(email)} vs ${JSON.stringify(site)} -> got ${got}, want ${want}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  // Works under Deno and under a node bundle.
  const exit = (globalThis as any).Deno?.exit ?? (globalThis as any).process?.exit;
  exit?.(1);
}
