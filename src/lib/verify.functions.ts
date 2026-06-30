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
    return Object.entries(data as Record<string, any>).map(([name, info]) => ({
      name,
      iso: info.iso ?? name,
      prefix: info.prefix ?? "",
    })).sort((a, b) => a.name.localeCompare(b.name));
  });

export const getVerifyProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ country: z.string().min(1), operator: z.string().default("any") }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: settings } = await context.supabase
      .from("app_settings")
      .select("verify_markup")
      .eq("id", 1)
      .maybeSingle();
    const markup = Number((settings as any)?.verify_markup ?? 1.5);

    const { data: customPrices } = await context.supabase
      .from("verify_prices" as any)
      .select("service, operator, price_usd");
    // Build map keyed by "service::operator", fallback to "service::any"
    const priceMap = new Map(
      (customPrices ?? []).map((p: any) => [`${p.service.toLowerCase()}::${(p.operator ?? "any").toLowerCase()}`, Number(p.price_usd)])
    );
    function lookupPrice(service: string, operator: string): number | undefined {
      return priceMap.get(`${service}::${operator.toLowerCase()}`)
        ?? priceMap.get(`${service}::any`);
    }

    let result = await fivesim(`/guest/products/${encodeURIComponent(data.country)}/${encodeURIComponent(data.operator || "any")}`);
    let entries = Object.entries(result as Record<string, any>).filter(([, info]) => info.Qty > 0);

    // Fallback: if the chosen operator has zero stock, fall back to "any"
    if (entries.length === 0 && data.operator !== "any") {
      result = await fivesim(`/guest/products/${encodeURIComponent(data.country)}/any`);
      entries = Object.entries(result as Record<string, any>).filter(([, info]) => info.Qty > 0);
    }

    if (entries.length === 0) return [];
    return entries
      .map(([name, info]) => {
        const custom = lookupPrice(name.toLowerCase(), data.operator || "any");
        const price = custom !== undefined
          ? custom
          : Number((Number(info.Price) * markup).toFixed(4));
        return { name, qty: info.Qty, price, price_usd: price, raw_cost: Number(info.Price), custom: custom !== undefined };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

export const getVerifyOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ country: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const result = await fivesim(`/guest/operators/${encodeURIComponent(data.country)}`);
      // 5sim returns { "any": [...], "operator1": [...], ... } keyed by operator name
      const ops = Object.keys(result as Record<string, any>);
      const sorted = ["any", ...ops.filter((o) => o !== "any").sort()];
      return sorted;
    } catch {
      return ["any"];
    }
  });

// ── Buy a number ──────────────────────────────────────────────────────────────
const BuyInput = z.object({
  country: z.string().min(1).max(60),
  operator: z.string().min(1).max(60).default("any"),
  product: z.string().min(1).max(60),
  price_usd: z.number().positive(),
});

export const buyVerifyNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BuyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // ── Server-side price verification ──────────────────────────────────────
    // Never trust the price from the frontend — re-fetch the real 5sim price
    // and apply your markup. This prevents users sending a manipulated price.
    const { data: settings } = await context.supabase
      .from("app_settings").select("default_price_usd, verify_markup").eq("id", 1).maybeSingle();
    const markup = Number((settings as any)?.verify_markup ?? 1.5);

    const { data: customPrices } = await context.supabase
      .from("verify_prices" as any).select("service, operator, price_usd");
    const priceMap = new Map(
      (customPrices ?? []).map((p: any) => [`${p.service.toLowerCase()}::${(p.operator ?? "any").toLowerCase()}`, Number(p.price_usd)])
    );
    function lookupCustom(service: string, operator: string): number | undefined {
      return priceMap.get(`${service}::${operator.toLowerCase()}`)
        ?? priceMap.get(`${service}::any`);
    }

    const products = await fivesim(
      `/guest/products/${encodeURIComponent(data.country)}/${encodeURIComponent(data.operator || "any")}`
    ) as Record<string, any>;

    const productInfo = products[data.product];
    if (!productInfo || productInfo.Qty <= 0) throw new Error("Service not available right now");

    const rawCost = Number(productInfo.Price);
    const customPrice = lookupCustom(data.product.toLowerCase(), data.operator || "any");
    const correctPrice = customPrice !== undefined
      ? customPrice
      : Number((rawCost * markup).toFixed(4));

    if (data.price_usd < correctPrice - 0.0001) {
      throw new Error("Price mismatch — please refresh and try again");
    }

    const chargeAmount = correctPrice;
    // ────────────────────────────────────────────────────────────────────────

    // Debit user balance
    const { error: debitErr } = await supabaseAdmin.rpc("debit_balance", {
      _user_id: context.userId,
      _amount: chargeAmount,
    });
    if (debitErr) throw new Error(debitErr.message || "Insufficient balance");

    let order: any;
    try {
      order = await fivesim(
        `/user/buy/activation/${encodeURIComponent(data.country)}/${encodeURIComponent(data.operator || "any")}/${encodeURIComponent(data.product)}`
      );
    } catch (e) {
      // Refund if 5sim call failed
      await supabaseAdmin.rpc("credit_balance", { _user_id: context.userId, _amount: chargeAmount });
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
        cost_usd: chargeAmount,
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

    // If already canceled, no need to re-check
    if (o.status === "CANCELED" || o.status === "BANNED") {
      return { status: o.status, sms_code: o.sms_code, phone: o.phone };
    }

    // If RECEIVED/FINISHED AND we already have the code saved, return it
    if ((o.status === "RECEIVED" || o.status === "FINISHED") && o.sms_code) {
      return { status: o.status, sms_code: o.sms_code, phone: o.phone };
    }

    // Always re-poll 5sim if we don't have the code yet
    // (handles cases where status was RECEIVED but sms_code was never saved)
    const result = await fivesim(`/user/check/${o.sim_order_id}`);

    // Log raw result to help debug — visible in server logs
    console.log("[5sim check]", JSON.stringify(result));

    // 5sim returns sms as array of objects with .code and/or .text
    const firstSms = result.sms?.[0];
    const smsCode: string | null =
      firstSms?.code ?? firstSms?.text ?? null;

    let newStatus: string;
    if (smsCode) {
      newStatus = "RECEIVED";
    } else if (result.status === "CANCELED" || result.status === "BANNED") {
      newStatus = result.status;
    } else {
      newStatus = "PENDING";
    }

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

    // Allow cancel as long as no real SMS code was received
    if (o.sms_code) {
      throw new Error("Cannot cancel — SMS code already received");
    }

    // Try to cancel on 5sim side (may fail if already expired/finished, that's ok)
    try { await fivesim(`/user/cancel/${o.sim_order_id}`); } catch (_) {}

    // Always refund and mark canceled
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
