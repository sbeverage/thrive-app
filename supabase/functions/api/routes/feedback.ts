import { corsHeaders } from "../lib/cors.ts";
import { blobToBase64 } from "../lib/encoding.ts";

export async function handleFeedbackRoute(
  req: Request,
  supabase: any,
  userId: number | null,
): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  const contentType = req.headers.get("content-type") || "";
  let rating: unknown;
  let feedbackType: unknown;
  let message: string;
  /** Client may send JSON `{ attachments: [{ filename, content }] }` with base64 content (RN). */
  const jsonAttachments: { filename: string; content: string }[] = [];
  /** RN/axios multipart often yields Blob parts that are not `instanceof File` in Deno. */
  const attachmentBlobs: { blob: Blob; filename: string }[] = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    rating = formData.get("rating") ?? undefined;
    feedbackType = formData.get("feedbackType") ?? undefined;
    const msg = formData.get("message");
    message = typeof msg === "string" ? msg : "";
    let attachmentIndex = 0;
    for (const entry of formData.getAll("attachments")) {
      if (!(entry instanceof Blob) || entry.size === 0) continue;
      attachmentIndex += 1;
      const filename = entry instanceof File && entry.name?.trim()
        ? entry.name
        : `attachment_${attachmentIndex}.jpg`;
      attachmentBlobs.push({ blob: entry, filename });
    }
    console.log(
      `📎 Feedback multipart: ${attachmentBlobs.length} file part(s), keys=${[...new Set([...formData.keys()])].join(",")}`,
    );
  } else {
    const body = await req.json();
    rating = body.rating;
    feedbackType = body.feedbackType;
    message = typeof body.message === "string" ? body.message : "";
    const rawAtt = body.attachments;
    if (Array.isArray(rawAtt)) {
      const MAX_FILES = 5;
      const MAX_B64_CHARS = 16 * 1024 * 1024;
      for (let i = 0; i < Math.min(rawAtt.length, MAX_FILES); i++) {
        const item = rawAtt[i];
        if (!item || typeof item.content !== "string" || typeof item.filename !== "string") {
          continue;
        }
        const fn = String(item.filename).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
        const c = String(item.content).replace(/\s/g, "");
        if (!c || c.length > MAX_B64_CHARS) continue;
        jsonAttachments.push({
          filename: fn || `attachment_${i + 1}.jpg`,
          content: c,
        });
      }
      console.log(`📎 Feedback JSON: ${jsonAttachments.length} base64 attachment(s)`);
    }
  }

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "Message is required." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const type = (feedbackType || "general") as string;
  const ratingRequired = type === "general";
  const ratingNum =
    rating === undefined || rating === null || rating === ""
      ? 0
      : Number(rating);
  if (ratingRequired && (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5)) {
    return new Response(JSON.stringify({ error: "A rating from 1–5 is required for general feedback." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  let userName = "App User";
  let userEmail = "unknown";
  if (userId != null) {
    const { data: userData } = await supabase
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", userId)
      .single();
    if (userData) {
      userName = `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || "App User";
      userEmail = userData.email || "unknown";
    }
  }

  const ratingLabel =
    ratingNum >= 1 && ratingNum <= 5
      ? (["", "Poor", "Fair", "Good", "Very Good", "Excellent"][ratingNum] || String(ratingNum))
      : "Not provided";
  const typeLabel = type;

  const ratingRowHtml =
    ratingNum >= 1 && ratingNum <= 5
      ? `<tr><td style="padding:8px;font-weight:600;color:#324E58">Rating</td><td style="padding:8px;color:#555">${ratingNum}/5 — ${ratingLabel}</td></tr>`
      : `<tr><td style="padding:8px;font-weight:600;color:#324E58">Rating</td><td style="padding:8px;color:#555">${ratingLabel}</td></tr>`;

  const safeMessageHtml = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#DB8633">New App Feedback</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:8px;font-weight:600;color:#324E58;width:140px">From</td><td style="padding:8px;color:#555">${userName} (${userEmail})</td></tr>
        <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:600;color:#324E58">Type</td><td style="padding:8px;color:#555">${typeLabel}</td></tr>
        ${ratingRowHtml}
      </table>
      <div style="background:#fafafa;border-left:4px solid #DB8633;padding:16px;border-radius:4px">
        <p style="margin:0;color:#324E58;line-height:1.6">${safeMessageHtml}</p>
      </div>
      <p style="margin-top:24px;font-size:12px;color:#aaa">Sent from THRIVE app</p>
    </div>
  `;

  const emailService = Deno.env.get("EMAIL_SERVICE") || "resend";
  const toEmail = "info@jointhriveinitiative.org";

  try {
    if (emailService === "resend") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.warn("⚠️ RESEND_API_KEY not set — feedback not emailed");
      } else {
        const attachmentsPayload: { filename: string; content: string }[] = [
          ...jsonAttachments,
        ];
        for (const { blob, filename } of attachmentBlobs) {
          try {
            const content = await blobToBase64(blob);
            attachmentsPayload.push({ filename, content });
          } catch (attErr) {
            console.error("Feedback attachment encode failed:", attErr);
          }
        }
        console.log(`📎 Resend: attaching ${attachmentsPayload.length} file(s) to feedback email`);
        const emailPayload: Record<string, unknown> = {
          from: "THRIVE App <noreply@jointhriveinitiative.org>",
          to: [toEmail],
          subject: `[THRIVE Feedback] ${typeLabel} — ${
            ratingNum >= 1 && ratingNum <= 5 ? `${ratingLabel} (${ratingNum}/5)` : ratingLabel
          }`,
          html: emailHtml,
        };
        if (attachmentsPayload.length > 0) {
          emailPayload.attachments = attachmentsPayload;
        }
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(emailPayload),
        });
        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error("Resend API error:", resendRes.status, errText);
        }
      }
    }
  } catch (e) {
    console.error("Failed to send feedback email:", e);
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}
