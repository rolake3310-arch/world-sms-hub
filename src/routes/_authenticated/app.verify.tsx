import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import {
  getVerifyCountries, getVerifyProducts, getVerifyOperators,
  buyVerifyNumber, checkVerifyOrder, cancelVerifyOrder, getMyVerifications,
} from "@/lib/verify.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Smartphone, Copy, RefreshCw, XCircle, Clock, Search, ArrowLeft } from "lucide-react";
import { useCurrency } from "@/lib/currency";

export const Route = createFileRoute("/_authenticated/app/verify")({
  head: () => ({ meta: [{ title: "SMS Verification" }] }),
  component: VerifyPage,
});

type Mode = null | "us" | "all";

const OPERATOR_TIPS: Record<string, string> = {
  any: "Auto-pick best available",
  virtual: "✅ Best for WhatsApp & Telegram",
  virtual1: "✅ Good delivery",
  virtual2: "✅ Good delivery",
  virtual3: "✅ Good delivery",
  virtual4: "✅ Good delivery",
  virtual5: "✅ Good delivery",
  virtual9: "✅ Good delivery",
  virtual11: "✅ Good delivery",
  virtual16: "✅ Good delivery",
  virtual20: "✅ Good delivery",
  beeline: "Good for Telegram",
  mts: "Good for Russia services",
  megafon: "Good for Russia services",
  tele2: "Decent delivery",
};

function VerifyPage() {
  const qc = useQueryClient();
  const { fmt } = useCurrency();

  const fetchCountries = useServerFn(getVerifyCountries);
  const fetchProducts = useServerFn(getVerifyProducts);
  const fetchOperators = useServerFn(getVerifyOperators);
  const fetchBuy = useServerFn(buyVerifyNumber);
  const fetchCheck = useServerFn(checkVerifyOrder);
  const fetchCancel = useServerFn(cancelVerifyOrder);
  const fetchHistory = useServerFn(getMyVerifications);

  const [mode, setMode] = useState<Mode>(null);
  const [country, setCountry] = useState("");
  const [operator, setOperator] = useState("any");
  const [product, setProduct] = useState("");
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (mode === "us") { setCountry("usa"); setOperator("any"); setProduct(""); }
    if (mode === "all") { setCountry(""); setOperator("any"); setProduct(""); }
  }, [mode]);

  useEffect(() => {
    if (!activeOrder?.expires_at) return;
    timerRef.current = setInterval(() => {
      const secs = Math.max(0, Math.floor((new Date(activeOrder.expires_at).getTime() - Date.now()) / 1000));
      setTimeLeft(secs);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeOrder?.expires_at]);

  const { data: countries = [] } = useQuery({
    queryKey: ["verify-countries"],
    queryFn: () => fetchCountries(),
    enabled: mode === "all",
    staleTime: 5 * 60 * 1000,
  });

  const { data: operators = ["any"] } = useQuery({
    queryKey: ["verify-operators", country],
    queryFn: () => fetchOperators({ data: { country } }),
    enabled: !!country,
    staleTime: 5 * 60 * 1000,
  });

  const { data: products = [], isFetching: loadingProducts } = useQuery({
    queryKey: ["verify-products", country, operator],
    queryFn: () => fetchProducts({ data: { country, operator } }),
    enabled: !!country && !!operator,
    staleTime: 0, // always fresh — so markup changes reflect immediately
  });

  const { data: history = [] } = useQuery({
    queryKey: ["my-verifications"],
    queryFn: () => fetchHistory(),
  });

  const buyMutation = useMutation({
    mutationFn: (vars: { country: string; product: string; operator: string }) =>
      fetchBuy({ data: vars }),
    onSuccess: (order) => {
      setActiveOrder(order);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["my-verifications"] });
      toast.success("Number rented! Waiting for SMS...");
      startPolling(order.id, order.expires_at);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to rent number"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => fetchCancel({ data: { id } }),
    onSuccess: () => {
      stopPolling();
      const prevProduct = activeOrder?.service;
      setActiveOrder(null);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["my-verifications"] });
      toast.success("Cancelled & refunded. Try a different operator for better delivery.");
      if (prevProduct) setProduct(prevProduct);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to cancel"),
  });

  function startPolling(id: string, expiresAt: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        if (new Date() > new Date(expiresAt)) {
          stopPolling();
          try { await fetchCancel({ data: { id } }); } catch (_) {}
          setActiveOrder(null);
          qc.invalidateQueries({ queryKey: ["me"] });
          qc.invalidateQueries({ queryKey: ["my-verifications"] });
          toast.info("Order expired — balance refunded automatically.");
          return;
        }
        const result = await fetchCheck({ data: { id } });
        setActiveOrder((prev: any) => ({ ...prev, ...result }));
        if (result.status === "RECEIVED" || result.status === "FINISHED") {
          stopPolling();
          qc.invalidateQueries({ queryKey: ["my-verifications"] });
          toast.success("SMS received!");
        }
        if (result.status === "CANCELED") {
          stopPolling();
          setActiveOrder(null);
        }
      } catch (_) {}
    }, 5000);
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  useEffect(() => () => stopPolling(), []);

  function reset() {
    setMode(null); setCountry(""); setOperator("any"); setProduct("");
  }

  function pickCountry(name: string) {
    setCountry(name); setOperator("any"); setProduct("");
  }

  function pickOperator(op: string) {
    setOperator(op); setProduct("");
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied!"));
  }

  const selectedProduct = products.find((p) => p.name === product);
  const filteredCountries = (countries as any[]).filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">SMS Verification</h1>
        <p className="text-sm text-muted-foreground">
          Purchase a number, receive your one-time code. Cancel any time before the code arrives for a refund.
        </p>
      </div>

      {/* Active Order */}
      {activeOrder && (
        <Card className="border-primary/40 bg-primary/5 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Your rented number
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold tabular-nums">+{activeOrder.phone}</span>
                <button onClick={() => copyText(activeOrder.phone)} className="rounded-md p-1.5 hover:bg-accent">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Expires in: <span className={`font-bold tabular-nums ${timeLeft < 60 ? "text-destructive" : "text-foreground"}`}>
                  {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              {activeOrder.sms_code ? (
                <div className="rounded-xl border border-success bg-success/10 px-5 py-3 text-center">
                  <div className="text-xs font-medium text-success">Code received</div>
                  <div className="text-3xl font-bold tabular-nums text-success tracking-widest">{activeOrder.sms_code}</div>
                  <button onClick={() => copyText(activeOrder.sms_code)} className="mt-1 text-xs text-success hover:underline">Copy code</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Waiting for SMS...
                </div>
              )}
              <Button variant="destructive" size="sm"
                onClick={() => cancelMutation.mutate(activeOrder.id)}
                disabled={cancelMutation.isPending}>
                <XCircle className="mr-1.5 h-4 w-4" />
                {cancelMutation.isPending ? "Cancelling..." : "Cancel & Refund"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Mode selector */}
      {!activeOrder && mode === null && (
        <div className="grid gap-4 md:grid-cols-2">
          <button onClick={() => setMode("us")}
            className="rounded-2xl border-2 border-border bg-card p-8 text-left transition-all hover:border-primary hover:shadow-lg">
            <div className="text-5xl mb-3">🇺🇸</div>
            <div className="text-xl font-bold">US Numbers</div>
            <div className="mt-1 text-sm text-muted-foreground">Get a United States virtual number instantly.</div>
          </button>
          <button onClick={() => setMode("all")}
            className="rounded-2xl border-2 border-border bg-card p-8 text-left transition-all hover:border-primary hover:shadow-lg">
            <div className="text-5xl mb-3">🌍</div>
            <div className="text-xl font-bold">All Countries</div>
            <div className="mt-1 text-sm text-muted-foreground">Choose from 180+ countries worldwide.</div>
          </button>
        </div>
      )}

      {/* Order form */}
      {!activeOrder && mode !== null && (
        <div className="space-y-4">
          <button onClick={reset} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Country picker */}
            {mode === "all" && (
              <Card className="p-5">
                <h3 className="mb-3 font-semibold">1. Choose Country</h3>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Search country..."
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                  />
                </div>
                <div className="h-64 overflow-y-auto rounded-md border border-border">
                  {filteredCountries.map((c: any) => (
                    <button key={c.iso} onClick={() => pickCountry(c.name)}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${country === c.name ? "bg-primary text-primary-foreground" : ""}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* US selected */}
            {mode === "us" && (
              <Card className="flex items-center gap-4 p-5">
                <div className="text-4xl">🇺🇸</div>
                <div>
                  <div className="font-semibold text-lg">United States</div>
                  <div className="text-sm text-muted-foreground">Select a service below</div>
                </div>
              </Card>
            )}

            {/* Service picker */}
            <Card className="p-5">
              <h3 className="mb-3 font-semibold">{mode === "us" ? "1." : "2."} Choose Service</h3>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Search (e.g. whatsapp)..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  disabled={!country}
                />
              </div>
              <div className="h-64 overflow-y-auto rounded-md border border-border">
                {!country ? (
                  <p className="p-4 text-sm text-muted-foreground">Select a country first</p>
                ) : loadingProducts ? (
                  <p className="p-4 text-sm text-muted-foreground">Loading services...</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No services available for this operator</p>
                ) : (
                  filteredProducts.map((p) => (
                    <button key={p.name} onClick={() => setProduct(p.name)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${product === p.name ? "bg-primary text-primary-foreground" : ""}`}>
                      <span className="capitalize">{p.name}</span>
                      <span className="text-xs font-medium">{fmt(p.price)}</span>
                    </button>
                  ))
                )}
              </div>
            </Card>
          </div>

          {/* Operator selector */}
          {country && operators.length > 1 && (
            <Card className="p-4">
              <h3 className="mb-1 text-sm font-semibold">Operator</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                💡 Virtual operators work best for WhatsApp, Telegram, Instagram & TikTok.
              </p>
              <div className="flex flex-wrap gap-2">
                {operators.map((op: string) => {
                  const tip = OPERATOR_TIPS[op.toLowerCase()];
                  const isVirtual = op.toLowerCase().startsWith("virtual");
                  return (
                    <button key={op} onClick={() => pickOperator(op)}
                      className={`flex flex-col rounded-lg border px-3 py-2 text-left text-xs font-medium capitalize transition-colors ${
                        operator === op
                          ? "bg-primary text-primary-foreground border-primary"
                          : isVirtual
                          ? "border-success/40 bg-success/5 hover:bg-success/10"
                          : "border-border hover:bg-accent"
                      }`}>
                      <span>{op}</span>
                      {tip && <span className={`mt-0.5 text-[10px] font-normal ${operator === op ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{tip}</span>}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Buy button */}
          <Card className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                {selectedProduct ? (
                  <>
                    <div className="font-semibold capitalize">{selectedProduct.name} — {mode === "us" ? "🇺🇸 United States" : country}</div>
                    <div className="text-sm text-muted-foreground">
                      Cost: <span className="font-bold text-foreground">{fmt(selectedProduct.price)}</span>
                      {" "}· {selectedProduct.qty} numbers available · Operator: {operator}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">Select a service to continue</div>
                )}
              </div>
              <Button
                disabled={!selectedProduct || buyMutation.isPending}
                onClick={() => buyMutation.mutate({ country, product, operator })}
                size="lg" className="shadow-glow">
                <Smartphone className="mr-2 h-4 w-4" />
                {buyMutation.isPending ? "Renting..." : "Get Number"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* History */}
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Recent Orders</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {(history as any[]).slice(0, 20).map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">+{h.phone}</span>
                    {h.sms_code && (
                      <span className="rounded bg-success/10 px-1.5 py-0.5 text-xs font-bold text-success">{h.sms_code}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {h.service} · {h.country} · {fmt(Number(h.cost_usd))}
                  </div>
                </div>
                <StatusBadge status={h.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-warning/10 text-warning",
    RECEIVED: "bg-success/10 text-success",
    FINISHED: "bg-success/10 text-success",
    CANCELED: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}
