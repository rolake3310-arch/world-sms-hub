import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── Provider client ─────────────────────────────────────────────────────────
// Speaks the de-facto standard "SMM panel API" contract (action=services /
// add / status / balance) shared by virtually every reseller panel —
// JustAnotherPanel, Peakerr, SMMKings, GoDaddy-style panels, etc. Swapping
// providers later only requires changing SMM_API_URL / SMM_API_KEY, no code
// changes.
async function smmApi(baseUrl: string, params: Record<string, string>) {
  const key = process.env.SMM_API_KEY;
  if (!key) throw new Error("SMM_API_KEY is not configured. Add it as a secret.");

  const body = new URLSearchParams({ key, ...params });
  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`SMM provider error ${resp.status}: ${text.slice(0, 200)}`);
  }
  const json = await resp.json().catch(() => null);
  if (json && typeof json === "object" && "error" in json && json.error) {
    throw new Error(String(json.error));
  }
  return json;
}

async function getSmmSettings(supabase: any) {
  const { data } = await supabase
    .from("app_settings")
    .select("smm_enabled, smm_api_url, smm_markup")
    .eq("id", 1)
    .maybeSingle();
  return {
    enabled: !!data?.smm_enabled,
    baseUrl: data?.smm_api_url || "https://justanotherpanel.com/api/v2",
    markup: Number(data?.smm_markup ?? 1.3),
  };
}

async function getCustomPriceMap(supabase: any): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("smm_prices" as any)
    .select("service_id, price_per_1000_usd");
  return new Map(
    (data ?? []).map((p: any) => [String(p.service_id), Number(p.price_per_1000_usd)]),
  );
}

function calcPricePer1000(
  rawRate: number,
  serviceId: string,
  markup: number,
  customPrices: Map<string, number>,
): number {
  const custom = customPrices.get(String(serviceId));
  return custom !== undefined ? custom : Number((rawRate * markup).toFixed(4));
}

// ── Services list ─────────────────────────────────────────────────────────
export const getSmmServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { enabled, baseUrl, markup } = await getSmmSettings(context.supabase);
    if (!enabled) return { enabled: false, services: [] as any[] };

    const raw = await smmApi(baseUrl, { action: "services" });
    const customPrices = await getCustomPriceMap(context.supabase);

    const services = (Array.isArray(raw) ? raw : []).map((s: any) => {
      const rawRate = Number(s.rate); // provider price per 1000
      const pricePer1000 = calcPricePer1000(rawRate, String(s.service), markup, customPrices);
      return {
        service_id: String(s.service),
        name: String(s.name ?? ""),
        category: String(s.category ?? "Other"),
        type: String(s.type ?? "Default"),
        min: Number(s.min ?? 1),
        max: Number(s.max ?? 1000000),
        price_per_1000: pricePer1000,
        refill: !!s.refill,
        dripfeed: !!s.dripfeed,
        cancel: !!s.cancel,
      };
    });

    return { enabled: true, services };
  });

// ── Quote ─────────────────────────────────────────────────────────────────
const QuoteInput = z.object({
  service_id: z.string().min(1),
  quantity: z.number().int().positive(),
});

export const quoteSmmOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QuoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { enabled, baseUrl, markup } = await getSmmSettings(context.supabase);
    if (!enabled) throw new Error("Social growth services are currently unavailable");

    const raw = await smmApi(baseUrl, { action: "services" });
    const svc = (Array.isArray(raw) ? raw : []).find(
      (s: any) => String(s.service) === data.service_id,
    );
    if (!svc) throw new Error("Service not found");

    const min = Number(svc.min ?? 1);
    const max = Number(svc.max ?? 1000000);
    if (data.quantity < min || data.quantity > max) {
      throw new Error(`Quantity must be between ${min} and ${max}`);
    }

    const customPrices = await getCustomPriceMap(context.supabase);
    const pricePer1000 = calcPricePer1000(Number(svc.rate), data.service_id, markup, customPrices);
    const charge = Number(((pricePer1000 / 1000) * data.quantity).toFixed(4));

    return {
      service_id: data.service_id,
      name: String(svc.name ?? ""),
      quantity: data.quantity,
      price_per_1000: pricePer1000,
      charge_usd: charge,
      min,
      max,
    };
  });

// ── Place order ──────────────────────────────────────────────────────────
const OrderInput = z.object({
  service_id: z.string().min(1),
  service_name: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  link: z.string().url().max(500),
  quantity: z.number().int().positive(),
});

export const createSmmOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enabled, baseUrl, markup } = await getSmmSettings(context.supabase);
    if (!enabled) throw new Error("Social growth services are currently unavailable");

    // Re-verify price & bounds server-side against the live provider list
    const raw = await smmApi(baseUrl, { action: "services" });
    const svc = (Array.isArray(raw) ? raw : []).find(
      (s: any) => String(s.service) === data.service_id,
    );
    if (!svc) throw new Error("Service not found");

    const min = Number(svc.min ?? 1);
    const max = Number(svc.max ?? 1000000);
    if (data.quantity < min || data.quantity > max) {
      throw new Error(`Quantity must be between ${min} and ${max}`);
    }

    const customPrices = await getCustomPriceMap(context.supabase);
    const pricePer1000 = calcPricePer1000(Number(svc.rate), data.service_id, markup, customPrices);
    const charge = Number(((pricePer1000 / 1000) * data.quantity).toFixed(4));

    // Debit balance atomically
    const { error: debitErr } = await supabaseAdmin.rpc("debit_balance", {
      _user_id: context.userId,
      _amount: charge,
    });
    if (debitErr) throw new Error(debitErr.message || "Insufficient balance");

    // Place with provider
    let providerResp: any;
    try {
      providerResp = await smmApi(baseUrl, {
        action: "add",
        service: data.service_id,
        link: data.link,
        quantity: String(data.quantity),
      });
    } catch (e) {
      await supabaseAdmin.rpc("credit_balance", { _user_id: context.userId, _amount: charge });
      throw e;
    }

    const providerOrderId = providerResp?.order ? String(providerResp.order) : null;
    if (!providerOrderId) {
      await supabaseAdmin.rpc("credit_balance", { _user_id: context.userId, _amount: charge });
      throw new Error("Provider did not return an order id");
    }

    const { data: row, error } = await supabaseAdmin
      .from("smm_orders" as any)
      .insert({
        user_id: context.userId,
        provider_order_id: providerOrderId,
        service_id: data.service_id,
        service_name: data.service_name,
        category: data.category ?? null,
        link: data.link,
        quantity: data.quantity,
        charge_usd: charge,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return {
      id: (row as any).id,
      provider_order_id: providerOrderId,
      status: "pending",
      charge_usd: charge,
    };
  });

// ── Status check (single order) ─────────────────────────────────────────
export const checkSmmOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { baseUrl } = await getSmmSettings(context.supabase);

    const { data: order, error: oErr } = await supabaseAdmin
      .from("smm_orders" as any)
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (oErr || !order) throw new Error("Order not found");

    const o = order as any;
    if (!o.provider_order_id)
      return { status: o.status, remains: o.remains, start_count: o.start_count };

    const result = await smmApi(baseUrl, { action: "status", order: o.provider_order_id });
    const status = String(result?.status ?? o.status).toLowerCase();
    const startCount = result?.start_count != null ? Number(result.start_count) : o.start_count;
    const remains = result?.remains != null ? Number(result.remains) : o.remains;

    await supabaseAdmin
      .from("smm_orders" as any)
      .update({
        status,
        start_count: startCount,
        remains,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    return { status, start_count: startCount, remains };
  });

// ── History ───────────────────────────────────────────────────────────────
export const getMySmmOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("smm_orders" as any)
      .select(
        "id, service_name, category, link, quantity, charge_usd, status, start_count, remains, created_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []) as any[];
  });
