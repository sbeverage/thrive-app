export function formatCharityResponse(charity: any) {
  return {
    id: charity.id,
    name: charity.name,
    category: charity.category || null,
    type: charity.type || null,
    description: charity.description || null,
    about: charity.about || charity.description || null,
    // Impact & Story fields
    whyThisMatters: charity.why_this_matters || null,
    successStory: charity.success_story || null,
    storyAuthor: charity.story_author || null,
    // Impact statements
    impactStatement1: charity.impact_statement_1 || null,
    impactStatement2: charity.impact_statement_2 || null,
    // Note: These fields don't exist in database schema, always return null
    familiesHelped: null,
    communitiesServed: null,
    directToPrograms: null,
    imageUrl: charity.image_url || charity.logo_url || null,
    logoUrl: charity.logo_url || charity.image_url || null,
    // Photo gallery (max 5, enforced by a CHECK constraint) + one video.
    // videoUrl holds either an uploaded .mp4/.mov in the charity-images
    // bucket, played inline, or a YouTube/Vimeo link, opened externally.
    imageUrls: Array.isArray(charity.image_urls) ? charity.image_urls : [],
    videoUrl: charity.video_url || null,
    location: charity.location || null,
    latitude: charity.latitude ? parseFloat(charity.latitude) : null,
    longitude: charity.longitude ? parseFloat(charity.longitude) : null,
    ein: charity.ein || null,
    website: charity.website || null,
    phone: charity.phone || null,
    email: charity.email || null,
    contactName: charity.contact_name || null,
    social: charity.social || null,
    profileLinks: charity.profile_links || [],
    likes: charity.likes || 0,
    mutual: charity.mutual || 0,
    isActive: charity.is_active !== false,
    verificationStatus: charity.verification_status !== false, // Default to true if null
    // Used by the donor app to find the THRIVE Initiative row for the
    // Support-THRIVE panel + held-funds flow.
    isThrive: !!charity.is_thrive,
    // Donor-suggested charities awaiting team verification. The donor app
    // renders these with a placeholder image and a "Pending verification"
    // badge; held-funds flow treats them as not-yet-receiving.
    isPendingVerification: !!charity.is_pending_verification,
    verificationRejectedAt: charity.verification_rejected_at || null,
    verificationRejectedReason: charity.verification_rejected_reason || null,
    // Impact metrics - return as camelCase (now supports full sentences, not just numbers)
    livesImpacted: charity.lives_impacted || null,
    programsActive: charity.programs_active || null,
    directToProgramsPercentage: charity.direct_to_programs_percentage || null,
    // Approved but hidden until an admin fills in the profile. Exposed so the
    // admin panel can show what is still missing.
    awaitingProfileCompletion: !!charity.awaiting_profile_completion,
    createdAt: charity.created_at,
    updatedAt: charity.updated_at,
  };
}

// ─── Profile completeness ────────────────────────────────────────────────
//
// A donor-suggested charity arrives from the ProPublica registry with a name,
// EIN, city/state and an NTEE-derived category — and nothing else. The suggest
// endpoint fills `about` with placeholder copy and sets `type` to "Pending"
// so the row is valid, which means "field is non-empty" is not a usable test
// for whether the profile is presentable.
//
// Approval keeps such a charity hidden until these gaps are closed, so this is
// the single definition of "ready for donors" shared by the approvals queue
// (which decides whether to publish) and the charity PUT (which publishes once
// the gaps close).

// Placeholder copy written by POST /charities/suggest. Two different strings
// with different capitalisation — `about` gets "...is pending verification by
// the THRIVE team...", `description` gets "Pending verification by the THRIVE
// team." — so this matches the shared phrase case-insensitively. A
// case-sensitive check on the `about` wording missed the description entirely
// and reported a placeholder profile as complete.
const SUGGEST_PLACEHOLDER_MARKER = "pending verification by the thrive team";

function isPlaceholderCopy(v: unknown): boolean {
  return String(v ?? "").toLowerCase().includes(SUGGEST_PLACEHOLDER_MARKER);
}

function isBlank(v: unknown): boolean {
  return v == null || String(v).trim() === "";
}

/**
 * Human-readable list of what still needs filling in before a charity can be
 * shown to donors. Empty array means ready to publish.
 */
export function charityProfileGaps(charity: any): string[] {
  const gaps: string[] = [];
  if (!charity) return ["Charity record"];

  if (isBlank(charity.name)) gaps.push("Name");
  if (isBlank(charity.category)) gaps.push("Category");

  // "Pending" is what the suggest endpoint sets; it is a status, not a type.
  const type = String(charity.type ?? "").trim();
  if (!type || type.toLowerCase() === "pending") gaps.push("Type");

  // Either field can carry the body copy the profile renders, but placeholder
  // text counts as absent.
  const about = charity.about;
  const description = charity.description;
  const hasRealAbout = !isBlank(about) && !isPlaceholderCopy(about);
  const hasRealDescription =
    !isBlank(description) && !isPlaceholderCopy(description);
  if (!hasRealAbout && !hasRealDescription) gaps.push("About / description");

  // Without a hero image the profile renders a generic stock photo, which is
  // the exact thing that made suggested charities look broken.
  if (isBlank(charity.image_url) && isBlank(charity.logo_url)) {
    gaps.push("Hero image or logo");
  }

  if (isBlank(charity.website)) gaps.push("Website");
  if (isBlank(charity.location)) gaps.push("Location");

  return gaps;
}

/** True when nothing is missing and the charity can be published. */
export function isCharityProfileComplete(charity: any): boolean {
  return charityProfileGaps(charity).length === 0;
}
