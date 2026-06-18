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
    // Impact metrics - return as camelCase (now supports full sentences, not just numbers)
    livesImpacted: charity.lives_impacted || null,
    programsActive: charity.programs_active || null,
    directToProgramsPercentage: charity.direct_to_programs_percentage || null,
    createdAt: charity.created_at,
    updatedAt: charity.updated_at,
  };
}
