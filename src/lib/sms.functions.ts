import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export const getPublicSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const { data: settings, error: sErr } = await sb
      .from("app_settings")
      .select("crypto_enabled, squad_enabled, bank_enabled, bank_instructions, min_fund_usd, default_price_usd, currency, squad_environment")
      .eq("id", 1)
      .maybeSingle();
    if (sErr) console.error("settings err", sErr);
    const { data: wallets, error: wErr } = await sb
      .from("crypto_wallets")
      .select("id, label, asset, network, address")
      .eq("active", true)
      .order("created_at");
    if (wErr) console.error("wallets err", wErr);
    const { data: banks, error: bErr } = await sb
      .from("bank_accounts")
      .select("id, label, bank_name, account_name, account_number, extra")
      .eq("active", true)
      .order("created_at");
    if (bErr) console.error("banks err", bErr);
    return {
      settings: settings ?? { crypto_enabled: false, squad_enabled: false, bank_enabled: false, bank_instructions: "", min_fund_usd: 0, default_price_usd: 0.05, currency: "USD", squad_environment: "sandbox" },
      wallets: wallets ?? [],
      banks: banks ?? [],
    };
  });



export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, balance_usd, status, created_at")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    return {
      profile,
      isAdmin: (roles ?? []).some((r) => r.role === "admin"),
    };
  });

export const getCountryPrices = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data } = await sb.from("country_prices").select("country_code, country_name, price_usd").order("country_name");
  return data ?? [];
});

const QuoteInput = z.object({
  recipients: z.array(z.string()).min(1).max(5000),
  message: z.string().min(1).max(2000),
});

export const quoteSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QuoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { parseRecipient, smsSegments } = await import("@/lib/phone-utils");
    const seg = smsSegments(data.message);
    const { data: settings } = await context.supabase
      .from("app_settings").select("default_price_usd").eq("id", 1).maybeSingle();
    const defaultPrice = Number(settings?.default_price_usd ?? 0.05);
    const { data: prices } = await context.supabase
      .from("country_prices").select("country_code, price_usd");
    const priceMap = new Map((prices ?? []).map((p) => [p.country_code, Number(p.price_usd)]));

    const lines = data.recipients.map((r) => {
      const p = parseRecipient(r);
      const unit = p.country ? priceMap.get(p.country) ?? defaultPrice : defaultPrice;
      const cost = p.e164 ? unit * seg.segments : 0;
      return { raw: r, e164: p.e164, country: p.country, valid: !!p.e164, unit, cost, error: p.error };
    });
    const total = lines.reduce((s, l) => s + l.cost, 0);
    return { segments: seg.segments, encoding: seg.encoding, chars: seg.chars, lines, total, defaultPrice };
  });

const SendInput = z.object({
  sender: z.string().trim().min(1).max(11),
  recipients: z.array(z.string()).min(1).max(5000),
  message: z.string().min(1).max(2000),
});

export const sendSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { parseRecipient, smsSegments } = await import("@/lib/phone-utils");
    const seg = smsSegments(data.message);

    // Pricing
    const { data: settings } = await context.supabase
      .from("app_settings").select("default_price_usd").eq("id", 1).maybeSingle();
    const defaultPrice = Number(settings?.default_price_usd ?? 0.05);
    const { data: prices } = await context.supabase
      .from("country_prices").select("country_code, price_usd");
    const priceMap = new Map((prices ?? []).map((p) => [p.country_code, Number(p.price_usd)]));

    const valid = data.recipients
      .map((r) => parseRecipient(r))
      .filter((p) => p.msisdn !== null) as { raw: string; e164: string; msisdn: number; country: string | null }[];

    if (valid.length === 0) throw new Error("No valid recipients");

    const lines = valid.map((p) => {
      const unit = p.country ? priceMap.get(p.country) ?? defaultPrice : defaultPrice;
      return { ...p, unit, cost: unit * seg.segments };
    });
    const total = lines.reduce((s, l) => s + l.cost, 0);

    // Atomic debit via RPC (service role)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: debitErr } = await supabaseAdmin.rpc("debit_balance", {
      _user_id: context.userId,
      _amount: total,
    });
    if (debitErr) throw new Error(debitErr.message || "Insufficient balance");

    // Call GatewayAPI
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GATEWAYAPI_API_KEY = process.env.GATEWAYAPI_API_KEY;
    let gatewayOk = false;
    let gatewayError: string | null = null;
    let gatewayIds: Record<string, string> = {};

    if (!LOVABLE_API_KEY || !GATEWAYAPI_API_KEY) {
      gatewayError = "SMS provider not configured. Connect GatewayAPI.";
    } else {
      try {
        const resp = await fetch("https://connector-gateway.lovable.dev/gatewayapi/mobile/multi", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GATEWAYAPI_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: lines.map((l) => ({
              sender: data.sender,
              recipient: l.msisdn,
              message: data.message,
            })),
          }),
        });
        const json: unknown = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          gatewayError = `Provider error ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`;
        } else {
          gatewayOk = true;
          // best-effort id mapping
          const ids = (json as { ids?: unknown }).ids;
          if (Array.isArray(ids)) {
            lines.forEach((l, i) => { if (ids[i] != null) gatewayIds[l.e164] = String(ids[i]); });
          }
        }
      } catch (e) {
        gatewayError = e instanceof Error ? e.message : "Network error";
      }
    }

    if (!gatewayOk) {
      // refund
      await supabaseAdmin.rpc("credit_balance", { _user_id: context.userId, _amount: total });
    }

    // Log messages
    const rows = lines.map((l) => ({
      user_id: context.userId,
      sender: data.sender,
      recipient: l.e164,
      country_code: l.country,
      message: data.message,
      segments: seg.segments,
      cost_usd: l.cost,
      gateway_id: gatewayIds[l.e164] ?? null,
      status: gatewayOk ? ("sent" as const) : ("failed" as const),
      error: gatewayOk ? null : gatewayError,
    }));
    await supabaseAdmin.from("sms_messages").insert(rows);

    if (!gatewayOk) throw new Error(gatewayError ?? "Failed to send");

    return { sent: lines.length, total };
  });

export const getMyMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("sms_messages")
      .select("id, sender, recipient, country_code, message, segments, cost_usd, status, error, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });
