import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";

export async function handleTransactionRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // Get user ID from JWT token
  const authHeader = getAppAuthHeader(req);
  let userId: number | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const jwtSecret = Deno.env.get("JWT_SECRET");

    if (jwtSecret) {
      try {
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );

        const payload = await verifyJWT(token, secretKey);
        userId = payload.id as number;
      } catch (error) {
        // Invalid token
      }
    }
  }

  if (!userId) {
    return new Response(JSON.stringify({error: "Unauthorized"}), {
      headers: {"Content-Type": "application/json"},
      status: 401,
    });
  }

  // GET /transactions
  if (method === "GET" && route === "/transactions") {
    try {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const type = url.searchParams.get("type");
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");

      let query = supabase
        .from("transactions")
        .select("*, vendors(id, name, logo_url)", {count: "exact"})
        .eq("user_id", userId)
        .order("created_at", {ascending: false})
        .range((page - 1) * limit, page * limit - 1);

      if (type) {
        query = query.eq("type", type);
      }
      if (startDate) {
        query = query.gte("created_at", startDate);
      }
      if (endDate) {
        query = query.lte("created_at", endDate);
      }

      const {data: transactions, error, count} = await query;

      if (error) {
        return new Response(
          JSON.stringify({error: "Failed to fetch transactions"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          transactions: transactions || [],
          pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit),
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching transactions:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch transactions"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /transactions
  if (method === "POST" && route === "/transactions") {
    try {
      const body = await req.json();
      const {
        type,
        amount,
        description,
        reference_id,
        reference_type,
        metadata,
        ...otherFields
      } = body;

      if (!type) {
        return new Response(JSON.stringify({error: "type is required"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      const {data: transaction, error} = await supabase
        .from("transactions")
        .insert([
          {
            user_id: userId,
            type,
            amount: amount ? parseFloat(amount) : null,
            description,
            reference_id,
            reference_type,
            metadata: metadata || {},
            ...otherFields,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creating transaction:", error);
        return new Response(
          JSON.stringify({error: "Failed to create transaction"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          transaction,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error) {
      console.error("Error creating transaction:", error);
      return new Response(
        JSON.stringify({error: "Failed to create transaction"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // PATCH or PUT /transactions/:id — update redemption amounts (spent / saved) for Savings Tracker edits
  // (PUT is used from the app: some clients/gateways handle PATCH less reliably than PUT.)
  const patchTxMatch = route.match(/^\/transactions\/([^/]+)$/);
  if ((method === "PATCH" || method === "PUT") && patchTxMatch) {
    const transactionId = patchTxMatch[1];
    if (transactionId === "summary") {
      // not a transaction id
    } else {
      try {
        const body = await req.json();
        const parseMoney = (v: unknown): number | undefined => {
          if (v === undefined || v === null || v === "") return undefined;
          const n = parseFloat(String(v).replace(/[$,]/g, ""));
          return Number.isFinite(n) ? n : undefined;
        };
        const spending = parseMoney(body.spending);
        const savings = parseMoney(body.savings);

        if (spending === undefined && savings === undefined) {
          return new Response(
            JSON.stringify({
              error: "At least one of spending or savings is required",
            }),
            {
              headers: {"Content-Type": "application/json"},
              status: 400,
            },
          );
        }

        const {data: existing, error: fetchError} = await supabase
          .from("transactions")
          .select("id, user_id, metadata, type")
          .eq("id", transactionId)
          .maybeSingle();

        if (fetchError || !existing) {
          return new Response(
            JSON.stringify({error: "Transaction not found"}),
            {
              headers: {"Content-Type": "application/json"},
              status: 404,
            },
          );
        }
        if (Number(existing.user_id) !== Number(userId)) {
          return new Response(JSON.stringify({error: "Forbidden"}), {
            headers: {"Content-Type": "application/json"},
            status: 403,
          });
        }

        let meta: Record<string, unknown> = {};
        const rawMeta = existing.metadata;
        if (rawMeta != null) {
          if (typeof rawMeta === "string") {
            try {
              meta = JSON.parse(rawMeta) as Record<string, unknown>;
            } catch {
              meta = {};
            }
          } else if (typeof rawMeta === "object" && !Array.isArray(rawMeta)) {
            meta = {...(rawMeta as Record<string, unknown>)};
          }
        }

        const updates: Record<string, unknown> = {};
        if (spending !== undefined) {
          updates.spending = spending;
          updates.amount = spending;
          meta.spending = String(spending);
        }
        if (savings !== undefined) {
          updates.savings = savings;
          meta.savings = String(savings);
        }
        updates.metadata = meta;

        const {data: updated, error: updateError} = await supabase
          .from("transactions")
          .update(updates)
          .eq("id", transactionId)
          .eq("user_id", userId)
          .select("*, vendors(id, name, logo_url)")
          .single();

        if (updateError) {
          console.error("PATCH transaction error:", updateError);
          return new Response(
            JSON.stringify({error: "Failed to update transaction"}),
            {
              headers: {"Content-Type": "application/json"},
              status: 500,
            },
          );
        }

        return new Response(
          JSON.stringify({success: true, transaction: updated}),
          {
            headers: {"Content-Type": "application/json"},
            status: 200,
          },
        );
      } catch (error) {
        console.error("Error patching transaction:", error);
        return new Response(
          JSON.stringify({error: "Failed to update transaction"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }
    }
  }

  // GET /transactions/summary
  if (method === "GET" && route === "/transactions/summary") {
    try {
      const {data: transactions, error} = await supabase
        .from("transactions")
        .select("type, amount, status")
        .eq("user_id", userId);

      if (error) {
        return new Response(
          JSON.stringify({error: "Failed to fetch transactions"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const summary: any = {
        total: 0,
        by_type: {},
      };

      (transactions || []).forEach((t: any) => {
        if (t.status === "completed" && t.amount) {
          summary.total += parseFloat(t.amount);
          if (!summary.by_type[t.type]) {
            summary.by_type[t.type] = 0;
          }
          summary.by_type[t.type] += parseFloat(t.amount);
        }
      });

      return new Response(
        JSON.stringify({
          success: true,
          summary,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching summary:", error);
      return new Response(JSON.stringify({error: "Failed to fetch summary"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  return new Response(JSON.stringify({error: "Transaction route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Payment method route handler (placeholder - uses Stripe directly)
