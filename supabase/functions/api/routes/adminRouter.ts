import { corsHeaders } from "../lib/cors.ts";
import { handleAdminApprovals } from "./adminApprovals.ts";

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
  deps: { sendInvitationEmail: (args: { to: string; name: string; verificationToken: string; donorId: number }) => Promise<void> },
) => Promise<Response>;

type InvitationsHandler = (
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: { sendInvitationEmail: (args: { to: string; name: string; verificationToken: string; donorId: number }) => Promise<void> },
) => Promise<Response>;

export type AdminRouteDeps = {
  handleAdminVendors: RouteHandler;
  handleAdminDiscounts: RouteHandler;
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
  sendInvitationEmail: (args: { to: string; name: string; verificationToken: string; donorId: number }) => Promise<void>;
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
  // Check admin secret
  const adminSecret = req.headers.get("x-admin-secret");
  const expectedSecret = Deno.env.get("ADMIN_SECRET_KEY");

  if (!adminSecret || adminSecret !== expectedSecret) {
    return new Response(JSON.stringify({error: "Unauthorized admin access"}), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      status: 401,
    });
  }

  // Pending vendor-portal submissions awaiting admin review.
  if (route.startsWith("/admin/approvals")) {
    return await handleAdminApprovals(req, supabase, route, method);
  }

  // Vendors routes under /admin/vendors
  if (route.startsWith("/admin/vendors")) {
    return await handleAdminVendors(req, supabase, route, method);
  }

  // Discounts routes under /admin/discounts
  if (route.startsWith("/admin/discounts")) {
    return await handleAdminDiscounts(req, supabase, route, method);
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
