import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIVESIM_BASE = "https://5sim.net/v1";

async function fivesim(path: string, method = "GET") {
  const key = process.env.FIVESIM_API_KEY;
  if (!key) throw new Error("FIVESIM_API_KEY is not configured");
  const resp = await fetch(`${FIVESIM_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`5sim error ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// Helper: get markup + custom prices from DB
async function getPricing(supabase: any) {
  const { data: settings } = await supabase
    .from("app_settings").select("verify_markup").eq("id", 1).maybeSingle();
  const markup = Number(settings?.verify_markup ?? 1.5);

  const { data: customPrices } = await supabase
    .from("verify_prices").select("service, operator, price_usd");

  const priceMap = new Map(
    (customPrices ?? []).map((p: any) => [
      `${p.service.toLowerCase()}::${(p.operator ?? "any").toLowerCase()}`,
      Number(p.price_usd),
    ])
  );

  function lookupCustom(service: string, operator: string): number | undefined {
    return priceMap.get(`${service.toLowerCase()}::${operator.toLowerCase()}`)
      ?? priceMap.get(`${service.toLowerCase()}::any`);
  }

  function calcPrice(rawCost: number, service: string, operator: string): number {
    const custom = lookupCustom(service, operator);
    return custom !== undefined
      ? custom
      : Number((rawCost * markup).toFixed(6));
  }

  return { markup, lookupCustom, calcPrice };
}

// ── Countries ─────────────────────────────────────────────────────────────────
export const getVerifyCountries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const data = await fivesim("/guest/countries");
    return Object.entries(data as Record<string, any>)
      .map(([name, info]) => ({ name, iso: info.iso ?? name, prefix: info.prefix ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

// ── Operators ─────────────────────────────────────────────────────────────────
export const getVerifyOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ country: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const result = await fivesim(`/guest/operators/${encodeURIComponent(data.country)}`);
      const ops = Object.keys(result as Record<string, any>);
      return ["any", ...ops.filter((o) => o !== "any").sort()];
    } catch {
      return ["any"];
    }
  });

// ── Products ──────────────────────────────────────────────────────────────────
export const getVerifyProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    country: z.string().min(1),
    operator: z.string().default("any"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { calcPrice } = await getPricing(context.supabase);

    let result = await fivesim(
      `/guest/products/${encodeURIComponent(data.country)}/${encodeURIComponent(data.operator || "any")}`
    );
    let entries = Object.entries(result as Record<string, any>).filter(([, info]) => info.Qty > 0);

    // Fallback to "any" if chosen operator has no stock
    if (entries.length === 0 && data.operator !== "any") {
      result = await fivesim(`/guest/products/${encodeURIComponent(data.country)}/any`);
      entries = Object.entries(result as Record<string, any>).filter(([, info]) => info.Qty > 0);
    }

    if (entries.length === 0) return [];

    return entries
      .map(([name, info]) => {
        const rawCost = Number(info.Price);
        const price = calcPrice(rawCost, name, data.operator || "any");
        return { name, qty: info.Qty, price, price_usd: price, raw_cost: rawCost };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

// ── Buy ───────────────────────────────────────────────────────────────────────
const BuyInput = z.object({
  country: z.string().min(1).max(60),
  operator: z.string().min(1).max(60).default("any"),
  product: z.string().min(1).max(60),
});

export const buyVerifyNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BuyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { calcPrice } = await getPricing(context.supabase);

    // Get real price from 5sim
    const products = await fivesim(
      `/guest/products/${encodeURIComponent(data.country)}/${encodeURIComponent(data.operator || "any")}`
    ) as Record<string, any>;

    const productInfo = products[data.product];
    if (!productInfo || productInfo.Qty <= 0) throw new Error("Service not available right now");

    const rawCost = Number(productInfo.Price);
    const chargeAmount = calcPrice(rawCost, data.product, data.operator || "any");

    // Debit balance
    const { error: debitErr } = await supabaseAdmin.rpc("debit_balance", {
      _user_id: context.userId,
      _amount: chargeAmount,
    });
    if (debitErr) throw new Error(debitErr.message || "Insufficient balance");

    // Buy from 5sim
    let order: any;
    try {
      order = await fivesim(
        `/user/buy/activation/${encodeURIComponent(data.country)}/${encodeURIComponent(data.operator || "any")}/${encodeURIComponent(data.product)}`
      );
    } catch (e) {
      await supabaseAdmin.rpc("credit_balance", { _user_id: context.userId, _amount: chargeAmount });
      throw e;
    }

    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const { data: row, error } = await supabaseAdmin
      .from("sms_verifications" as any)
      .insert({
        user_id: context.userId,
        sim_order_id: String(order.id),
        phone: order.phone,
        country: data.country,
        service: data.product,
        cost_usd: chargeAmount,
        status: "PENDING",
        expires_at: expiresAt,
      })
      .select("id").single();
    if (error) throw new Error(error.message);

    return {
      id: (row as any).id,
      sim_order_id: String(order.id),
      phone: order.phone as string,
      status: "PENDING",
      expires_at: expiresAt,
    };
  });

// ── Check / Poll ──────────────────────────────────────────────────────────────
export const checkVerifyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error: oErr } = await supabaseAdmin
      .from("sms_verifications" as any).select("*")
      .eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (oErr || !order) throw new Error("Order not found");

    const o = order as any;

    if (o.status === "CANCELED" || o.status === "BANNED") {
      return { status: o.status, sms_code: o.sms_code, phone: o.phone };
    }
    if ((o.status === "RECEIVED" || o.status === "FINISHED") && o.sms_code) {
      return { status: o.status, sms_code: o.sms_code, phone: o.phone };
    }

    const result = await fivesim(`/user/check/${o.sim_order_id}`);
    const firstSms = result.sms?.[0];
    const smsCode: string | null = firstSms?.code ?? firstSms?.text ?? null;

    let newStatus: string;
    if (smsCode) {
      newStatus = "RECEIVED";
    } else if (result.status === "CANCELED" || result.status === "BANNED") {
      newStatus = result.status;
    } else {
      newStatus = "PENDING";
    }

    await supabaseAdmin.from("sms_verifications" as any)
      .update({ status: newStatus, sms_code: smsCode }).eq("id", data.id);

    return { status: newStatus, sms_code: smsCode, phone: o.phone };
  });

// ── Cancel ────────────────────────────────────────────────────────────────────
export const cancelVerifyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error: oErr } = await supabaseAdmin
      .from("sms_verifications" as any).select("*")
      .eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (oErr || !order) throw new Error("Order not found");

    const o = order as any;
    if (o.sms_code) throw new Error("Cannot cancel — SMS code already received");

    try { await fivesim(`/user/cancel/${o.sim_order_id}`); } catch (_) {}

    await supabaseAdmin.rpc("credit_balance", { _user_id: context.userId, _amount: o.cost_usd });
    await supabaseAdmin.from("sms_verifications" as any)
      .update({ status: "CANCELED" }).eq("id", data.id);

    return { ok: true };
  });

// ── History ───────────────────────────────────────────────────────────────────
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

// ── Get operators for a specific service with prices ──────────────────────────
export const getServiceOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    country: z.string().min(1),
    service: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { calcPrice } = await getPricing(context.supabase);

    // Fetch all operators for this country
    let operatorList: string[] = ["any"];
    try {
      const ops = await fivesim(`/guest/operators/${encodeURIComponent(data.country)}`);
      operatorList = ["any", ...Object.keys(ops as Record<string, any>).filter(o => o !== "any").sort()];
    } catch {}

    // For each operator, get the price and qty for this specific service
    const results: { operator: string; price: number; qty: number; raw_cost: number }[] = [];

    await Promise.all(operatorList.map(async (op) => {
      try {
        const products = await fivesim(
          `/guest/products/${encodeURIComponent(data.country)}/${encodeURIComponent(op)}`
        ) as Record<string, any>;
        const info = products[data.service];
        if (info && info.Qty > 0) {
          const rawCost = Number(info.Price);
          const price = calcPrice(rawCost, data.service, op);
          results.push({ operator: op, price, qty: Number(info.Qty), raw_cost: rawCost });
        }
      } catch {}
    }));

    // Sort: any first, then by price ascending
    return results.sort((a, b) => {
      if (a.operator === "any") return -1;
      if (b.operator === "any") return 1;
      return a.price - b.price;
    });
  });
