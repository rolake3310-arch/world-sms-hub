import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIVESIM_BASE = "https://5sim.net/v1";

async function fivesim(path: string, method = "GET") {
  const key = process.env.FIVESIM_API_KEY;
  if (!key) throw new Error("FIVESIM_API_KEY is not configured");
  const resp = await fetch(`${FIVESIM_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`5sim error ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Get available countries + products from 5sim ─────────────────────────────
export const getVerifyCountries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const data = await fivesim("/guest/countries");
    // data is { countryName: { iso: "xx", prefix: "1", ... }, ... }
    return Object.entries(data as Record<string, any>).map(([name, info]) => ({
      name,
      iso: info.iso ?? name,
      prefix: info.prefix ?? "",
    })).sort((a, b) => a.name.localeCompare(b.name));
  });

export const getVerifyProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ country: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const result = await fivesim(`/guest/products/${encodeURIComponent(data.country)}/any`);
    // result is { productName: { Category, Qty, Price }, ... }
    return Object.entries(result as Record<string, any>)
      .filter(([, info]) => info.Qty > 0)
      .map(([name, info]) => ({
        name,
        qty: info.Qty,
        price: Number(info.Price),  // in USD
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

// ── Buy a number ──────────────────────────────────────────────────────────────
const BuyInput = z.object({
  country: z.string().min(1).max(60),
  product: z.string().min(1).max(60),
  price_usd: z.number().positive(),
});

export const buyVerifyNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BuyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Debit user balance first
    const { error: debitErr } = await supabaseAdmin.rpc("debit_balance", {
      _user_id: context.userId,
      _amount: data.price_usd,
    });
    if (debitErr) throw new Error(debitErr.message || "Insufficient balance");

    let order: any;
    try {
      order = await fivesim(
        `/user/buy/activation/${encodeURIComponent(data.country)}/any/${encodeURIComponent(data.product)}`
      );
    } catch (e) {
      // Refund if 5sim call failed
      await supabaseAdmin.rpc("credit_balance", { _user_id: context.userId, _amount: data.price_usd });
      throw e;
    }

    // Save to DB
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20 min
    const { data: row, error } = await supabaseAdmin
      .from("sms_verifications" as any)
      .insert({
        user_id: context.userId,
        sim_order_id: String(order.id),
        phone: order.phone,
        country: data.country,
        service: data.product,
        cost_usd: data.price_usd,
        status: order.status ?? "PENDING",
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return {
      id: (row as any).id,
      sim_order_id: String(order.id),
      phone: order.phone as string,
      status: order.status as string,
      expires_at: expiresAt,
    };
  });

// ── Poll for SMS ──────────────────────────────────────────────────────────────
export const checkVerifyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Get order from DB
    const { data: order, error: oErr } = await supabaseAdmin
      .from("sms_verifications" as any)
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (oErr || !order) throw new Error("Order not found");

    const o = order as any;
    if (o.status === "RECEIVED" || o.status === "FINISHED" || o.status === "CANCELED") {
      return { status: o.status, sms_code: o.sms_code, phone: o.phone };
    }

    // Poll 5sim
    const result = await fivesim(`/user/check/${o.sim_order_id}`);
    const newStatus: string = result.status ?? o.status;
    const smsCode: string | null = result.sms?.[0]?.code ?? null;

    await supabaseAdmin
      .from("sms_verifications" as any)
      .update({ status: newStatus, sms_code: smsCode })
      .eq("id", data.id);

    return { status: newStatus, sms_code: smsCode, phone: o.phone };
  });

// ── Cancel order ──────────────────────────────────────────────────────────────
export const cancelVerifyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error: oErr } = await supabaseAdmin
      .from("sms_verifications" as any)
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (oErr || !order) throw new Error("Order not found");

    const o = order as any;
    if (o.status !== "PENDING") throw new Error("Can only cancel pending orders");

    await fivesim(`/user/cancel/${o.sim_order_id}`);

    // Refund user
    await supabaseAdmin.rpc("credit_balance", { _user_id: context.userId, _amount: o.cost_usd });
    await supabaseAdmin
      .from("sms_verifications" as any)
      .update({ status: "CANCELED" })
      .eq("id", data.id);

    return { ok: true };
  });

// ── My verifications history ──────────────────────────────────────────────────
export const getMyVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("sms_verifications" as any)
      .select("id, phone, country, service, cost_usd, status, sms_code, expires_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []) as any[];
  });
