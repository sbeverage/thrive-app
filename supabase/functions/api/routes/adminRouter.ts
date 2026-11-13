import { corsHeaders } from "../lib/cors.ts";
import { verifyAdminToken } from "../lib/adminAuth.ts";
import { handleAdminApprovals } from "./adminApprovals.ts";
import { handleAdminCron } from "./adminCron.ts";
import { handleAdminDashboard } from "./adminDashboard.ts";

type RouteHandler = (
  req: Request,
  supabase: any,
  route: string,
  method: string,
) => Promise<Response>;

type AnalyticsHandler = (
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: { sendReferralReminderEmail: (args: { to: string; name: string; referrerName?: string }) => Promise<void> },
) => Promise<Response>;

type SettingsHandler = (
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: { sendAdminTempPasswordEmail: (args: { to: string; name: string; tempPassword: string }) => Promise<void> },
) => Promise<Response>;

type DonorsHandler = (
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: { sendInvitationEmail: (args: { to: string; name: string; verificationToken: string; donorId: number; inviteType?: string }) => Promise<void> },
) => Promise<Response>;

type InvitationsHandler = (
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: { sendInvitationEmail: (args: { to: string; name: string; verificationToken: string; donorId: number; inviteType?: string }) => Promise<void> },
) => Promise<Response>;

export type AdminRouteDeps = {
  handleAdminVendors: RouteHandler;
  handleAdminDiscounts: RouteHandler;
  handleAdminRedemptions: RouteHandler;
  handleAdminAnalytics: AnalyticsHandler;
  handleAdminNotifications: RouteHandler;
  handleAdminSettings: SettingsHandler;
  handleAdminDonors: DonorsHandler;
  handleAdminCharities: RouteHandler;
  handleAdminOneTimeGifts: RouteHandler;
  handleAdminStorageRoute: RouteHandler;
  handleAdminUsers: RouteHandler;
  handleAdminCredits: RouteHandler;
  handleAdminReporting: RouteHandler;
  handleAdminInvitations: InvitationsHandler;
  sendReferralReminderEmail: (args: { to: string; name: string; referrerName?: string }) => Promise<void>;
  sendAdminTempPasswordEmail: (args: { to: string; name: string; tempPassword: string }) => Promise<void>;
  sendInvitationEmail: (args: { to: string; name: string; verificationToken: string; donorId: number; inviteType?: string }) => Promise<void>;
};

export async function handleAdminRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: AdminRouteDeps,
) {
  const {
    handleAdminVendors,
    handleAdminDiscounts,
    handleAdminRedemptions,
    handleAdminAnalytics,
    handleAdminNotifications,
    handleAdminSettings,
    handleAdminDonors,
    handleAdminCharities,
    handleAdminOneTimeGifts,
    handleAdminStorageRoute,
    handleAdminUsers,
    handleAdminCredits,
    handleAdminReporting,
    handleAdminInvitations,
    sendReferralReminderEmail,
    sendAdminTempPasswordEmail,
    sendInvitationEmail,
  } = deps;
  // ---------------------------------------------------------------- auth
  //
  // Two accepted credentials, on purpose and only for now:
  //
  //   1. An admin token from POST /admin/settings/team/login. This is the one
  //      that should be used. It is per-person, expires in eight hours, and
  //      never exists anywhere but that person's tab.
  //   2. X-Admin-Secret matching ADMIN_SECRET_KEY. Legacy, and the reason this
  //      work exists: the panel bundled it into public JavaScript, so the key
  //      was readable by anyone who opened the site. It stays accepted so the
  //      function and the panel do not have to deploy in lockstep.
  //
  // Removing (2) is the last step, after the panel ships without the secret
  // and ADMIN_SECRET_KEY is rotated. Until then the exposure is unchanged, so
  // this is a bridge, not the fix.
  //
  // The login route is deliberately outside both checks. It did its own bcrypt
  // check all along, but it sat behind the secret, which meant you needed the
  // secret in order to log in — which is precisely why the secret had to be
  // shipped to the browser in the first place.
  const isAdminLoginRoute =
    method === "POST" && route === "/admin/settings/team/login";

  if (!isAdminLoginRoute) {
    const adminSecret = req.headers.get("x-admin-secret");
    const expectedSecret = Deno.env.get("ADMIN_SECRET_KEY");
    const hasLegacySecret = Boolean(
      adminSecret && expectedSecret && adminSecret === expectedSecret,
    );

    const adminToken = hasLegacySecret ? null : await verifyAdminToken(req);

    if (!hasLegacySecret && !adminToken) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized admin access",
          // Distinguishable from a wrong password so the panel can send the
          // person back to the login screen rather than showing a dead page.
          code: "admin_auth_required",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 401,
        },
      );
    }
  }

  // Admin homepage cards. This branch did not exist, so every
  // /admin/dashboard/stats request fell through to "Admin route not found"
  // and the money cards rendered "--".
  if (route.startsWith("/admin/dashboard")) {
    return await handleAdminDashboard(req, supabase, route, method);
  }

  // Pending vendor-portal submissions awaiting admin review.
  if (route.startsWith("/admin/approvals")) {
    return await handleAdminApprovals(req, supabase, route, method);
  }

  // Scheduled / cron-triggered admin tasks (e.g., monthly rotation reminder).
  if (route.startsWith("/admin/cron")) {
    return await handleAdminCron(req, supabase, route, method);
  }

  // Vendors routes under /admin/vendors
  if (route.startsWith("/admin/vendors")) {
    return await handleAdminVendors(req, supabase, route, method);
  }

  // Discounts routes under /admin/discounts
  if (route.startsWith("/admin/discounts")) {
    return await handleAdminDiscounts(req, supabase, route, method);
  }

  // Every redemption, with the donor, vendor, money and attribution attached.
  // Above /admin/discounts would be wrong and below it is fine: the prefixes
  // do not overlap, but keeping them adjacent keeps the two discount-shaped
  // pages together.
  if (route.startsWith("/admin/redemptions")) {
    return await handleAdminRedemptions(req, supabase, route, method);
  }

  // Analytics routes
  if (route.startsWith("/admin/analytics")) {
    return await handleAdminAnalytics(req, supabase, route, method, {
      sendReferralReminderEmail,
    });
  }

  // Notifications routes
  if (route.startsWith("/admin/notifications")) {
    return await handleAdminNotifications(req, supabase, route, method);
  }

  // Settings routes
  if (route.startsWith("/admin/settings")) {
    return await handleAdminSettings(req, supabase, route, method, {
      sendAdminTempPasswordEmail,
    });
  }

  // Donors routes
  if (route.startsWith("/admin/donors")) {
    return await handleAdminDonors(req, supabase, route, method, {
      sendInvitationEmail,
    });
  }

  // Charities routes under /admin/charities
  if (route.startsWith("/admin/charities")) {
    return await handleAdminCharities(req, supabase, route, method);
  }

  // One-time gifts routes under /admin/one-time-gifts
  if (route.startsWith("/admin/one-time-gifts")) {
    return await handleAdminOneTimeGifts(req, supabase, route, method);
  }

  // Storage routes under /admin/storage
  if (route.startsWith("/admin/storage")) {
    return await handleAdminStorageRoute(req, supabase, route, method);
  }

  // Users routes under /admin/users
  if (route.startsWith("/admin/users")) {
    return await handleAdminUsers(req, supabase, route, method);
  }

  // Credits routes under /admin/credits
  if (route.startsWith("/admin/credits")) {
    return await handleAdminCredits(req, supabase, route, method);
  }

  // Reporting routes under /admin/reporting
  if (route.startsWith("/admin/reporting")) {
    return await handleAdminReporting(req, supabase, route, method);
  }

  // Invitations routes under /admin/invitations
  if (route.startsWith("/admin/invitations")) {
    return await handleAdminInvitations(req, supabase, route, method, {
      sendInvitationEmail,
    });
  }

  return new Response(JSON.stringify({error: "Admin route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}
