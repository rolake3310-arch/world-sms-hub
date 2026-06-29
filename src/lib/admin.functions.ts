import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const adminGetStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, sms, deposits] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("sms_messages").select("cost_usd", { count: "exact" }),
      supabaseAdmin.from("deposits").select("amount_usd, status"),
    ]);
    const revenue = (sms.data ?? []).reduce((s, r: any) => s + Number(r.cost_usd), 0);
    const approved = (deposits.data ?? []).filter((d: any) => d.status === "approved")
      .reduce((s, r: any) => s + Number(r.amount_usd), 0);
    const pending = (deposits.data ?? []).filter((d: any) => d.status === "pending").length;
    return {
      userCount: users.count ?? 0,
      smsCount: sms.count ?? 0,
      revenueUsd: revenue,
      depositsApprovedUsd: approved,
      depositsPending: pending,
    };
  });

const SettingsInput = z.object({
  crypto_enabled: z.boolean(),
  squad_enabled: z.boolean(),
  bank_enabled: z.boolean(),
  bank_instructions: z.string().max(2000).optional().nullable(),
  min_fund_usd: z.number().min(0).max(1_000_000),
  default_price_usd: z.number().min(0).max(100),
  squad_public_key: z.string().max(200).optional().nullable(),
  squad_environment: z.enum(["sandbox", "live"]),
  verify_markup: z.number().min(1).max(100),
  site_currency: z.enum(["USD", "NGN"]),
  usd_to_ngn: z.number().min(1),
});

export const adminUpdateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("app_settings").update({
      ...data,
      updated_at: new Date().toISOString(),
    } as any).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BankAccountInput = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(80),
  bank_name: z.string().min(1).max(120),
  account_name: z.string().min(1).max(120),
  account_number: z.string().min(1).max(80),
  extra: z.string().max(500).optional().nullable(),
  active: z.boolean(),
});

export const adminUpsertBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BankAccountInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...payload } = data;
    const tbl = context.supabase.from("bank_accounts" as any);
    const { error } = id
      ? await tbl.update(payload).eq("id", id)
      : await tbl.insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("bank_accounts" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase.from("bank_accounts" as any).select("*").order("created_at");
    return (data ?? []) as any[];
  });


const WalletInput = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(80),
  asset: z.string().min(1).max(40),
  network: z.string().max(40).optional().nullable(),
  address: z.string().min(4).max(300),
  active: z.boolean(),
});

export const adminUpsertWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WalletInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...payload } = data;
    if (id) {
      const { error } = await context.supabase.from("crypto_wallets").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("crypto_wallets").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeleteWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("crypto_wallets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListWallets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase.from("crypto_wallets").select("*").order("created_at");
    return data ?? [];
  });

const CountryPriceInput = z.object({
  country_code: z.string().length(2).toUpperCase(),
  country_name: z.string().min(1).max(80),
  price_usd: z.number().min(0).max(100),
});

export const adminUpsertCountryPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CountryPriceInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("country_prices")
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: "country_code" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteCountryPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ country_code: z.string().length(2) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("country_prices").delete().eq("country_code", data.country_code);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: deposits } = await supabaseAdmin
      .from("deposits").select("*").order("created_at", { ascending: false }).limit(200);
    const userIds = Array.from(new Set((deposits ?? []).map((d) => d.user_id)));
    let emails = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, email").in("id", userIds);
      emails = new Map((profs ?? []).map((p) => [p.id, p.email]));
    }
    return (deposits ?? []).map((d) => ({ ...d, user_email: emails.get(d.user_id) ?? "" }));
  });

const ReviewInput = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  notes: z.string().max(500).optional(),
});

export const adminReviewDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReviewInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dep, error: fErr } = await supabaseAdmin.from("deposits")
      .select("id, user_id, amount_usd, status").eq("id", data.id).maybeSingle();
    if (fErr || !dep) throw new Error("Deposit not found");
    if (dep.status !== "pending") throw new Error("Already reviewed");
    if (data.action === "approve") {
      await supabaseAdmin.rpc("credit_balance", { _user_id: dep.user_id, _amount: Number(dep.amount_usd) });
    }
    const { error } = await supabaseAdmin.from("deposits").update({
      status: data.action === "approve" ? "approved" : "rejected",
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
      notes: data.notes ?? null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin.from("profiles")
      .select("id, email, full_name, balance_usd, status, created_at")
      .order("created_at", { ascending: false }).limit(500);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p) => ({ ...p, roles: roleMap.get(p.id) ?? [] }));
  });

const AdjustInput = z.object({
  user_id: z.string().uuid(),
  delta_usd: z.number(),
  reason: z.string().max(200).optional(),
});

export const adminAdjustBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdjustInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("credit_balance", { _user_id: data.user_id, _amount: data.delta_usd });
    return { ok: true };
  });

export const adminSetUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    user_id: z.string().uuid(),
    status: z.enum(["active", "suspended"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ status: data.status }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    user_id: z.string().uuid(),
    role: z.enum(["admin", "user"]),
    grant: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: data.user_id, role: data.role },
        { onConflict: "user_id,role" },
      );
    } else {
      await supabaseAdmin.from("user_roles").delete()
        .eq("user_id", data.user_id).eq("role", data.role);
    }
    return { ok: true };
  });

export const adminListMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: msgs } = await supabaseAdmin.from("sms_messages")
      .select("*").order("created_at", { ascending: false }).limit(200);
    const userIds = Array.from(new Set((msgs ?? []).map((m) => m.user_id)));
    let emails = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, email").in("id", userIds);
      emails = new Map((profs ?? []).map((p) => [p.id, p.email]));
    }
    return (msgs ?? []).map((m) => ({ ...m, user_email: emails.get(m.user_id) ?? "" }));
  });


// ── Verify Prices ─────────────────────────────────────────────────────────────
export const adminListVerifyPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("verify_prices" as any)
      .select("id, service, price_usd, created_at")
      .order("service");
    return (data ?? []) as any[];
  });

const VerifyPriceInput = z.object({
  service: z.string().min(1).max(80).toLowerCase(),
  price_usd: z.number().min(0).max(1000),
});

export const adminUpsertVerifyPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VerifyPriceInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("verify_prices" as any)
      .upsert({ service: data.service.toLowerCase(), price_usd: data.price_usd }, { onConflict: "service" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteVerifyPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("verify_prices" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
