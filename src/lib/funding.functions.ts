import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CryptoInput = z.object({
  amount_usd: z.number().positive().max(1_000_000),
  asset: z.string().min(1).max(40),
  tx_reference: z.string().min(3).max(200),
  proof_url: z.string().url().max(500).optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
});

export const submitCryptoDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CryptoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: settings } = await context.supabase
      .from("app_settings").select("crypto_enabled, min_fund_usd").eq("id", 1).maybeSingle();
    if (!settings?.crypto_enabled) throw new Error("Crypto funding is disabled");
    const min = Number((settings as any)?.min_fund_usd ?? 0);
    if (data.amount_usd < min) throw new Error(`Minimum deposit is $${min.toFixed(2)}`);
    const { data: row, error } = await context.supabase
      .from("deposits")
      .insert({
        user_id: context.userId,
        method: "crypto",
        amount_usd: data.amount_usd,
        asset: data.asset,
        tx_reference: data.tx_reference,
        proof_url: data.proof_url || null,
        notes: data.notes || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// Bank input — user enters NAIRA amount
const BankInput = z.object({
  amount_ngn: z.number().positive().max(1_000_000_000),
  bank_account_id: z.string().uuid(),
  sender_name: z.string().min(1).max(120),
  tx_reference: z.string().min(2).max(200),
  notes: z.string().max(500).optional(),
});

export const submitBankDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BankInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: settings } = await context.supabase
      .from("app_settings").select("bank_enabled, min_fund_usd, usd_to_ngn").eq("id", 1).maybeSingle();
    if (!(settings as any)?.bank_enabled) throw new Error("Bank transfer is disabled");

    const rate = Number((settings as any)?.usd_to_ngn ?? 1600);
    const amount_usd = data.amount_ngn / rate; // convert NGN to USD for storage
    const min_usd = Number((settings as any)?.min_fund_usd ?? 0);
    const min_ngn = min_usd * rate;
    if (data.amount_ngn < min_ngn) throw new Error(`Minimum deposit is ₦${min_ngn.toLocaleString()}`);

    const { data: bank } = await context.supabase
      .from("bank_accounts" as any).select("label, bank_name").eq("id", data.bank_account_id).maybeSingle();
    const noteLines = [
      `Bank: ${(bank as any)?.bank_name ?? ""} (${(bank as any)?.label ?? ""})`,
      `Sender: ${data.sender_name}`,
      `NGN Amount: ₦${data.amount_ngn.toLocaleString()}`,
      `Rate used: ₦${rate}/USD`,
      data.notes ? `Note: ${data.notes}` : "",
    ].filter(Boolean).join(" | ");

    const { data: row, error } = await context.supabase
      .from("deposits")
      .insert({
        user_id: context.userId,
        method: "bank_transfer" as any,
        amount_usd,
        asset: "BANK_NGN",
        tx_reference: data.tx_reference,
        notes: noteLines,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// Squad input — user enters NAIRA amount
const SquadInput = z.object({
  amount_ngn: z.number().positive().max(1_000_000_000),
  callback_url: z.string().url(),
});

export const createSquadCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SquadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: settings } = await context.supabase
      .from("app_settings").select("squad_enabled, squad_environment, min_fund_usd, usd_to_ngn").eq("id", 1).maybeSingle();
    if (!settings?.squad_enabled) throw new Error("Squad funding is disabled");

    const rate = Number((settings as any)?.usd_to_ngn ?? 1600);
    const min_usd = Number((settings as any)?.min_fund_usd ?? 0);
    const min_ngn = min_usd * rate;
    if (data.amount_ngn < min_ngn) throw new Error(`Minimum deposit is ₦${min_ngn.toLocaleString()}`);

    const SQUAD_SECRET_KEY = process.env.SQUAD_SECRET_KEY;
    if (!SQUAD_SECRET_KEY) throw new Error("Squad is not configured.");

    const base = settings.squad_environment === "live"
      ? "https://api-d.squadco.com"
      : "https://sandbox-api-d.squadco.com";

    const { data: profile } = await context.supabase
      .from("profiles").select("email").eq("id", context.userId).maybeSingle();

    const reference = `sms_${context.userId.slice(0, 8)}_${Date.now()}`;
    const amount_usd = data.amount_ngn / rate;

    // Squad amount is in kobo (NGN * 100)
    const resp = await fetch(`${base}/transaction/initiate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SQUAD_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(data.amount_ngn * 100), // kobo
        email: profile?.email ?? "user@example.com",
        currency: "NGN",
        initiate_type: "inline",
        transaction_ref: reference,
        callback_url: data.callback_url,
        customer_name: profile?.email ?? "",
      }),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok || !json?.data?.checkout_url) {
      throw new Error(json?.message || `Squad init failed (${resp.status})`);
    }

    await context.supabase.from("deposits").insert({
      user_id: context.userId,
      method: "squad",
      amount_usd,
      squad_ref: reference,
      tx_reference: json?.data?.transaction_ref ?? reference,
      notes: `NGN: ₦${data.amount_ngn.toLocaleString()} at rate ₦${rate}/USD`,
    });

    return { checkout_url: json.data.checkout_url as string, reference };
  });

const VerifyInput = z.object({ reference: z.string().min(3).max(200) });

export const verifySquadDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VerifyInput.parse(d))
  .handler(async ({ data, context }) => {
    const SQUAD_SECRET_KEY = process.env.SQUAD_SECRET_KEY;
    if (!SQUAD_SECRET_KEY) throw new Error("Squad is not configured.");
    const { data: settings } = await context.supabase
      .from("app_settings").select("squad_environment").eq("id", 1).maybeSingle();
    const base = settings?.squad_environment === "live"
      ? "https://api-d.squadco.com"
      : "https://sandbox-api-d.squadco.com";
    const resp = await fetch(`${base}/transaction/verify/${encodeURIComponent(data.reference)}`, {
      headers: { Authorization: `Bearer ${SQUAD_SECRET_KEY}` },
    });
    const json: any = await resp.json().catch(() => ({}));
    const status = json?.data?.transaction_status ?? json?.data?.status;
    const success = String(status).toLowerCase() === "success" || String(status).toLowerCase() === "successful";

    if (success) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: dep } = await supabaseAdmin.from("deposits")
        .select("id, user_id, amount_usd, status").eq("squad_ref", data.reference).maybeSingle();
      if (dep && dep.status === "pending") {
        await supabaseAdmin.from("deposits").update({
          status: "approved", reviewed_at: new Date().toISOString(),
        }).eq("id", dep.id);
        await supabaseAdmin.rpc("credit_balance", { _user_id: dep.user_id, _amount: Number(dep.amount_usd) });
      }
    }
    return { success };
  });

export const getMyDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("deposits")
      .select("id, method, amount_usd, status, asset, tx_reference, created_at, reviewed_at, notes")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });
