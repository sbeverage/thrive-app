// Charity Portal — authenticated, charity-scoped endpoints.
//
// Mirrors routes/vendorPortal.ts: the caller signs in with the same custom
// JWT the donor app uses, their charity is found by charities.auth_user_id,
// and every query is scoped to it.
//
// Routes:
//   GET  /charity/lookup?ein=|q=   is this charity already in the catalogue?
//   POST /charity/signup           register a charity that is not
//   POST /charity/claim            ask for access to one that is
//   GET  /charity/me               current charity + where the request is up to
//   PUT  /charity/me               update the profile
//   POST /charity/me/resubmit      send it back for review after a rejection
//
// Two ways in, deliberately not the same:
//
//   signup  the row did not exist a moment ago, so there is nobody to
//           impersonate and the link is made immediately. An admin still
//           decides whether the charity goes live to donors, which is the
//           existing verification flow and not this file's business.
//
//   claim   the row already exists and donors already see it. The link waits
//           for an admin, so auth_user_id is NOT set until approval.
//
// The lookup endpoint is what joins them: a signup has to check for a
// duplicate EIN before inserting, and when it finds one the honest next step
// is to offer the claim. There is no separate "find my charity" path.

import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { corsHeaders } from "../lib/cors.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";
import { formatCharityResponse } from "../lib/charities.ts";

type JSONResponse = Response;

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function json(body: unknown, status = 200): JSONResponse {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function getUserIdFromJwt(req: Request): Promise<number | null> {
  const header = getAppAuthHeader(req);
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.substring(7);
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const decoded: any = await verifyJWT(token, key);
    return decoded.id ?? decoded.userId ?? null;
  } catch {
    return null;
  }
}

// ============================================================================
// EIN + domain helpers
// ============================================================================

/**
 * Normalise an EIN to the stored "12-3456789" form.
 *
 * Matches what POST /charities/suggest does, so a charity registering itself
 * and a donor suggesting it land on the same string and dedupe against each
 * other. Returns null when it is not nine digits.
 */
function normalizeEin(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length !== 9) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/**
 * Mail hosts that prove nothing about who someone works for.
 *
 * Not exhaustive on purpose. Anything not listed still only counts when it
 * matches the charity's own website domain, so a missing entry here cannot
 * turn into a false positive: it would have to match the charity's site.
 */
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com",
  "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com",
  "mac.com", "proton.me", "protonmail.com", "gmx.com", "mail.com",
  "zoho.com", "yandex.com", "comcast.net", "att.net", "verizon.net",
]);

/** Reduce a URL or host to a bare registrable-ish host, lowercased. */
function hostOf(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  let host = raw;
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // strip scheme
  host = host.split("/")[0].split("?")[0].split("#")[0];
  host = host.split("@").pop() || host; // tolerate an email being passed in
  host = host.replace(/:\d+$/, ""); // strip port
  host = host.replace(/^www\./, "");
  return host || null;
}

/**
 * Does this email address belong to the charity's own domain?
 *
 * The strongest evidence available without asking for documents, and it costs
 * nothing because `website` is already stored on every charity. Someone who
 * can receive mail at the organisation's domain, and has verified that inbox,
 * is almost certainly connected to it.
 *
 * Deliberately conservative:
 *   - a free-mail address never matches, whatever the charity's site is
 *   - a charity with no website on file can never produce a match
 *   - "sub.example.org" counts for "example.org", but "notexample.org" does
 *     not count for "example.org", because the check is on a dot boundary
 */
export function emailMatchesCharityDomain(
  email: unknown,
  website: unknown,
): boolean {
  const mailHost = hostOf(String(email ?? "").split("@").pop());
  const siteHost = hostOf(website);
  if (!mailHost || !siteHost) return false;
  if (FREE_MAIL_DOMAINS.has(mailHost)) return false;
  return mailHost === siteHost || mailHost.endsWith(`.${siteHost}`);
}

// ============================================================================
// Loading
// ============================================================================

async function loadCharityForUser(supabase: any, userId: number) {
  const { data } = await supabase
    .from("charities")
    .select("*")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return data ?? null;
}

async function loadPendingRequest(supabase: any, userId: number) {
  const { data } = await supabase
    .from("charity_access_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// ============================================================================
// GET /charity/lookup
// ============================================================================

/**
 * Is this charity already in the catalogue?
 *
 * Called before a signup so two people cannot create two rows for one EIN,
 * and called by the claim screen for the same reason in reverse. The response
 * tells the client which of the two paths it is on, so the portal never has
 * to guess.
 */
async function handleLookup(
  supabase: any,
  url: URL,
  userId: number,
): Promise<JSONResponse> {
  const ein = normalizeEin(url.searchParams.get("ein"));
  const q = (url.searchParams.get("q") || "").trim();

  if (!ein && q.length < 3) {
    return json(
      { error: "Give us an EIN, or at least three letters of the name." },
      400,
    );
  }

  let query = supabase
    .from("charities")
    .select("id, name, ein, location, website, logo_url, is_active, auth_user_id")
    .limit(10);

  query = ein ? query.eq("ein", ein) : query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) {
    console.error("charity/lookup error:", error);
    return json({ error: "That search did not run. Give it another try?" }, 500);
  }

  const matches = (data || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    ein: c.ein,
    location: c.location,
    website: c.website,
    logoUrl: c.logo_url,
    // Never leak who manages it, only that it is spoken for. Someone probing
    // for a charity's admin should learn nothing from this endpoint.
    alreadyClaimed: !!c.auth_user_id,
    isYours: c.auth_user_id === userId,
  }));

  return json({ matches, searchedEin: ein });
}

// ============================================================================
// POST /charity/signup
// ============================================================================

async function handleSignup(
  req: Request,
  supabase: any,
  userId: number,
): Promise<JSONResponse> {
  const existing = await loadCharityForUser(supabase, userId);
  if (existing) {
    // Already manages one. Let the portal update it via PUT /charity/me
    // rather than creating a second.
    return json({ charity: formatCharityResponse(existing) }, 200);
  }

  const body = await req.json().catch(() => ({}));
  const ein = normalizeEin(body.ein);
  const name = String(body.name ?? "").trim();

  if (!ein) {
    return json({ error: "That EIN does not look right. It should be nine digits." }, 400);
  }
  if (!name) {
    return json({ error: "Your charity needs a name." }, 400);
  }

  // Dedupe on EIN, the same key /charities/suggest uses. If the row exists
  // this is a claim, not a signup, and saying so is more useful than a
  // duplicate-key error.
  const { data: byEin } = await supabase
    .from("charities")
    .select("id, name, auth_user_id")
    .eq("ein", ein)
    .maybeSingle();

  if (byEin) {
    return json(
      {
        error:
          "That charity is already on THRIVE. You can ask for access to it instead.",
        code: "charity_exists",
        charity: { id: byEin.id, name: byEin.name, alreadyClaimed: !!byEin.auth_user_id },
      },
      409,
    );
  }

  const { data: user } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const website = body.website ? String(body.website).trim() : null;

  const { data: charity, error } = await supabase
    .from("charities")
    .insert({
      name,
      ein,
      category: body.category ?? null,
      about: body.about ?? null,
      description: body.about ?? null,
      website,
      phone: body.phone ?? null,
      location: body.location ?? null,
      email: user?.email ?? null,
      contact_name: body.contactName ?? null,
      logo_url: body.logoUrl ?? null,
      highlight_url: body.highlightUrl ?? null,
      image_url: body.coverUrl ?? null,
      // The person who registered it manages it from the start: the row did
      // not exist a second ago, so there is nobody to impersonate.
      auth_user_id: userId,
      created_by_user_id: userId,
      // Hidden from donors until an admin verifies it. These are the existing
      // flags the approvals queue already reads, so a self-registered charity
      // appears there next to donor-suggested ones with no new plumbing.
      is_active: false,
      is_pending_verification: true,
      verification_status: false,
    })
    .select("*")
    .single();

  if (error) {
    console.error("charity/signup insert error:", error);
    return json({ error: "That did not save. Give it another try?" }, 500);
  }

  // Recorded even though the link is already made, so the admin queue and the
  // audit trail have one shape for both ways in.
  await supabase.from("charity_access_requests").insert({
    charity_id: charity.id,
    user_id: userId,
    kind: "signup",
    status: "approved",
    contact_name: body.contactName ?? null,
    contact_title: body.contactTitle ?? null,
    contact_phone: body.phone ?? null,
    work_email: user?.email ?? null,
    domain_verified: emailMatchesCharityDomain(user?.email, website),
    reviewed_at: new Date().toISOString(),
  });

  return json({ charity: formatCharityResponse(charity) }, 201);
}

// ============================================================================
// POST /charity/claim
// ============================================================================

/**
 * Ask for access to a charity that is already in the catalogue.
 *
 * Does not grant anything. It records the request and the evidence behind it,
 * and an admin decides. auth_user_id stays untouched until then, because what
 * is being handed over is a profile donors already see.
 */
async function handleClaim(
  req: Request,
  supabase: any,
  userId: number,
): Promise<JSONResponse> {
  const already = await loadCharityForUser(supabase, userId);
  if (already) {
    return json(
      { error: "You already manage a charity on THRIVE.", code: "already_manages" },
      409,
    );
  }

  const body = await req.json().catch(() => ({}));
  const charityId = parseInt(String(body.charityId ?? ""), 10);
  const contactName = String(body.contactName ?? "").trim();
  const contactTitle = String(body.contactTitle ?? "").trim();

  if (!Number.isFinite(charityId)) {
    return json({ error: "Pick the charity you are asking about." }, 400);
  }
  if (!contactName || !contactTitle) {
    return json({ error: "Tell us your name and your role there." }, 400);
  }

  const { data: charity } = await supabase
    .from("charities")
    .select("id, name, website, email, auth_user_id")
    .eq("id", charityId)
    .maybeSingle();

  if (!charity) return json({ error: "We could not find that charity." }, 404);

  if (charity.auth_user_id) {
    // Someone already manages it. Not a flat no, because staff change, but it
    // is a different conversation and should not look like a normal request.
    return json(
      {
        error:
          "Someone at that charity already manages this profile. Get in touch and we will help sort it out.",
        code: "already_claimed",
      },
      409,
    );
  }

  const { data: user } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const workEmail = String(body.workEmail ?? user?.email ?? "").trim() || null;
  const domainVerified = emailMatchesCharityDomain(workEmail, charity.website);

  const { data: request, error } = await supabase
    .from("charity_access_requests")
    .insert({
      charity_id: charityId,
      user_id: userId,
      kind: "claim",
      status: "pending",
      contact_name: contactName,
      contact_title: contactTitle,
      contact_phone: body.contactPhone ?? null,
      work_email: workEmail,
      domain_verified: domainVerified,
      note: body.note ?? null,
    })
    .select("*")
    .single();

  if (error) {
    // The partial unique index means a second pending request for the same
    // charity collides rather than stacking up.
    if (String(error.code) === "23505") {
      return json(
        {
          error: "You have already asked for access to that charity. We are looking at it.",
          code: "request_pending",
        },
        409,
      );
    }
    console.error("charity/claim insert error:", error);
    return json({ error: "That did not send. Give it another try?" }, 500);
  }

  return json(
    {
      request: {
        id: request.id,
        status: request.status,
        domainVerified,
        charity: { id: charity.id, name: charity.name },
      },
      // What the portal should tell them next. Domain evidence does not skip
      // the admin, it only changes how much checking the admin has to do.
      message: domainVerified
        ? "Thanks. Your email is on their domain, so this should be quick."
        : "Thanks. We will check with the charity and come back to you.",
    },
    201,
  );
}

// ============================================================================
// GET / PUT /charity/me
// ============================================================================

async function handleMeGet(supabase: any, userId: number): Promise<JSONResponse> {
  const charity = await loadCharityForUser(supabase, userId);
  if (charity) {
    return json({
      charity: formatCharityResponse(charity),
      // Portal banner state. awaiting_profile_completion and
      // is_pending_verification are the existing flags the admin side sets.
      review: {
        liveToDonors: charity.is_active === true && charity.verification_status === true,
        pendingVerification: !!charity.is_pending_verification,
        awaitingProfile: !!charity.awaiting_profile_completion,
        rejectedAt: charity.verification_rejected_at ?? null,
        rejectedReason: charity.verification_rejected_reason ?? null,
      },
    });
  }

  // No charity yet. If they have asked for one, say where that is up to,
  // so the portal has something to show besides an empty screen.
  const request = await loadPendingRequest(supabase, userId);
  if (request) {
    const { data: c } = await supabase
      .from("charities")
      .select("id, name")
      .eq("id", request.charity_id)
      .maybeSingle();
    return json({
      charity: null,
      request: {
        id: request.id,
        kind: request.kind,
        status: request.status,
        domainVerified: request.domain_verified,
        rejectionReason: request.rejection_reason ?? null,
        charity: c ? { id: c.id, name: c.name } : null,
      },
    });
  }

  return json({ charity: null, request: null });
}

async function handleMePut(
  req: Request,
  supabase: any,
  userId: number,
): Promise<JSONResponse> {
  const charity = await loadCharityForUser(supabase, userId);
  if (!charity) return json({ error: "You do not manage a charity yet." }, 404);

  const body = await req.json().catch(() => ({}));

  // Whitelist. A charity must never be able to flip its own verification,
  // activate itself, or rewrite audit columns, so those are simply not here.
  const editable: Record<string, string> = {
    name: "name",
    about: "about",
    description: "description",
    category: "category",
    website: "website",
    phone: "phone",
    location: "location",
    contactName: "contact_name",
    social: "social",
    logoUrl: "logo_url",
    highlightUrl: "highlight_url",
    coverUrl: "image_url",
    videoUrl: "video_url",
    livesImpacted: "lives_impacted",
    programsActive: "programs_active",
    directToProgramsPercentage: "direct_to_programs_percentage",
  };

  const updates: Record<string, unknown> = {};
  for (const [inKey, column] of Object.entries(editable)) {
    if (inKey in body) updates[column] = body[inKey] === "" ? null : body[inKey];
  }

  if ("imageUrls" in body) {
    if (!Array.isArray(body.imageUrls)) {
      return json({ error: "imageUrls has to be a list of links." }, 400);
    }
    // Matches the charities_image_urls_max_5 CHECK, so a client bug fails
    // here with a readable message instead of as a constraint violation.
    updates.image_urls = body.imageUrls
      .filter((u: unknown) => typeof u === "string" && u.trim())
      .slice(0, 5);
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: "Nothing to save." }, 400);
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("charities")
    .update(updates)
    .eq("id", charity.id)
    .eq("auth_user_id", userId) // belt and braces: scope the write to the owner
    .select("*")
    .single();

  if (error || !updated) {
    console.error("charity/me update error:", error);
    return json({ error: "That did not save. Give it another try?" }, 500);
  }

  return json({ charity: formatCharityResponse(updated) });
}

// ============================================================================
// POST /charity/me/resubmit
// ============================================================================

async function handleResubmit(supabase: any, userId: number): Promise<JSONResponse> {
  const charity = await loadCharityForUser(supabase, userId);
  if (!charity) return json({ error: "You do not manage a charity yet." }, 404);

  const { error } = await supabase
    .from("charities")
    .update({
      is_pending_verification: true,
      verification_rejected_at: null,
      verification_rejected_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", charity.id)
    .eq("auth_user_id", userId);

  if (error) {
    console.error("charity/me/resubmit error:", error);
    return json({ error: "That did not send. Give it another try?" }, 500);
  }

  return json({ success: true, message: "Sent back to us for another look." });
}

// ============================================================================
// Router entry point — called from index.ts for any /charity/* route.
// ============================================================================

export async function handleCharityPortalRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
): Promise<JSONResponse> {
  const userId = await getUserIdFromJwt(req);
  if (!userId) return json({ error: "Authentication required" }, 401);

  if (method === "GET" && route.startsWith("/charity/lookup")) {
    return handleLookup(supabase, new URL(req.url), userId);
  }

  if (method === "POST" && route === "/charity/signup") {
    return handleSignup(req, supabase, userId);
  }

  if (method === "POST" && route === "/charity/claim") {
    return handleClaim(req, supabase, userId);
  }

  if (route === "/charity/me") {
    if (method === "GET") return handleMeGet(supabase, userId);
    if (method === "PUT") return handleMePut(req, supabase, userId);
  }

  if (method === "POST" && route === "/charity/me/resubmit") {
    return handleResubmit(supabase, userId);
  }

  return json({ error: "Not found" }, 404);
}
