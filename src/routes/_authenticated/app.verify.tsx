import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import {
  getVerifyCountries,
  getVerifyProducts,
  getVerifyOperators,
  buyVerifyNumber,
  checkVerifyOrder,
  cancelVerifyOrder,
  getMyVerifications,
} from "@/lib/verify.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Smartphone, Copy, RefreshCw, XCircle, Clock, Search, ArrowLeft, ChevronRight } from "lucide-react";
import { useCurrency } from "@/lib/currency";

export const Route = createFileRoute("/_authenticated/app/verify")({
  head: () => ({ meta: [{ title: "SMS Verification" }] }),
  component: VerifyPage,
});

// Step-based flow: country → operator → service → buy
type Step = "mode" | "country" | "operator" | "service";

const OPERATOR_TIPS: Record<string, string> = {
  any: "Auto — best available",
  virtual: "Best for WhatsApp / Telegram",
  virtual1: "Good delivery",
  virtual2: "Good delivery",
  virtual3: "Good delivery",
  virtual4: "Good delivery",
  virtual5: "Good delivery",
  virtual9: "Good delivery",
  virtual11: "Good delivery",
  virtual16: "Good delivery",
  virtual20: "Good delivery",
  beeline: "Good for Telegram",
  mts: "Good for Russian services",
  megafon: "Good for Russian services",
  tele2: "Decent delivery",
};

function VerifyPage() {
  const qc = useQueryClient();
  const fetchCountries = useServerFn(getVerifyCountries);
  const fetchProducts = useServerFn(getVerifyProducts);
  const fetchOperators = useServerFn(getVerifyOperators);
  const fetchBuy = useServerFn(buyVerifyNumber);
  const fetchCheck = useServerFn(checkVerifyOrder);
  const fetchCancel = useServerFn(cancelVerifyOrder);
  const fetchHistory = useServerFn(getMyVerifications);

  const [step, setStep] = useState<Step>("mode");
  const [usMode, setUsMode] = useState(false); // true = US numbers shortcut
  const [country, setCountry] = useState("");
  const [operator, setOperator] = useState("any");
  const [product, setProduct] = useState("");
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { fmt } = useCurrency();

  // Countdown timer
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
    enabled: step === "country",
  });

  const { data: operators = ["any"], isFetching: loadingOperators } = useQuery({
    queryKey: ["verify-operators", country],
    queryFn: () => fetchOperators({ data: { country } }),
    enabled: !!country,
    staleTime: 1000 * 60 * 5, // cache 5 mins
  });

  const { data: products = [], isFetching: loadingProducts } = useQuery({
    queryKey: ["verify-products", country, operator],
    queryFn: () => fetchProducts({ data: { country, operator } }),
    enabled: !!country && step === "service",
  });

  const { data: history = [] } = useQuery({
    queryKey: ["my-verifications"],
    queryFn: () => fetchHistory(),
  });

  // Restore active order on refresh
  useEffect(() => {
    if (activeOrder) return;
    const pending = (history as any[]).find(
      (h) => (h.status === "PENDING" || h.status === "RECEIVED") && new Date(h.expires_at) > new Date()
    );
    if (pending) {
      setActiveOrder(pending);
      if (pending.status === "PENDING") startPolling(pending.id, pending.expires_at);
    }
  }, [history]);

  const buyMutation = useMutation({
    mutationFn: (vars: { country: string; product: string; operator: string; price_usd: number }) =>
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
      setActiveOrder(null);
      setStep("service");
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["my-verifications"] });
      toast.success("Cancelled & refunded. Try a different operator.", { duration: 5000 });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to cancel"),
  });

  function startPolling(id: string, expiresAt: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      if (new Date() > new Date(expiresAt)) {
        stopPolling();
        try { await fetchCancel({ data: { id } }); } catch (_) {}
        setActiveOrder(null);
        qc.invalidateQueries({ queryKey: ["me"] });
        qc.invalidateQueries({ queryKey: ["my-verifications"] });
        toast.info("Order expired — balance refunded automatically.");
        return;
      }
      try {
        const result = await fetchCheck({ data: { id } });
        setActiveOrder((prev: any) => ({ ...prev, ...result }));
        if (result.status === "CANCELED" || result.status === "BANNED") { stopPolling(); setActiveOrder(null); return; }
        if (result.sms_code) { stopPolling(); qc.invalidateQueries({ queryKey: ["my-verifications"] }); toast.success("SMS code received!"); }
      } catch (err: any) { console.error("[poll error]", err?.message ?? err); }
    }, 3000);
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  useEffect(() => () => stopPolling(), []);

  function reset() {
    setStep("mode"); setCountry(""); setOperator("any"); setProduct("");
    setCountrySearch(""); setProductSearch(""); setUsMode(false);
  }

  function pickCountry(name: string) {
    setCountry(name); setOperator("any"); setProduct("");
    setStep("operator");
  }

  function pickOperator(op: string) {
    setOperator(op); setProduct("");
    setStep("service");
  }

  const selectedProduct = products.find((p) => p.name === product);
  const filteredCountries = (countries as any[]).filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  function copyPhone(phone: string) {
    navigator.clipboard.writeText(phone).then(() => toast.success("Copied!"));
  }

  // Breadcrumb display
  const crumbs = [
    { label: usMode ? "🇺🇸 US Numbers" : "🌍 All Countries", step: "mode" as Step },
    country && { label: country.charAt(0).toUpperCase() + country.slice(1), step: "country" as Step },
    (step === "operator" || step === "service") && { label: `Operator: ${operator}`, step: "operator" as Step },
    step === "service" && product && { label: product, step: "service" as Step },
  ].filter(Boolean) as { label: string; step: Step }[];

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">SMS Verification</h1>
        <p className="text-sm text-muted-foreground">
          Rent a number, receive your one-time code. Cancel any time for a full refund.
        </p>
      </div>

      {/* Active Order Banner */}
      {activeOrder && (
        <Card className="border-primary/40 bg-primary/5 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Smartphone className="h-4 w-4" /> Your rented number
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold tabular-nums tracking-wider">+{activeOrder.phone}</span>
                <button onClick={() => copyPhone(activeOrder.phone)} className="rounded-md p-1.5 hover:bg-accent">
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
                  <button onClick={() => copyPhone(activeOrder.sms_code)} className="mt-1 text-xs text-success hover:underline">Copy code</button>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Waiting for SMS...
                  </div>
                  <button className="text-xs text-primary underline hover:no-underline"
                    onClick={async () => {
                      try {
                        const result = await fetchCheck({ data: { id: activeOrder.id } });
                        setActiveOrder((prev: any) => ({ ...prev, ...result }));
                        if (result.sms_code) toast.success("SMS received!");
                        else toast.info("No code yet — still waiting");
                      } catch (e: any) { toast.error(e.message); }
                    }}>
                    Check now
                  </button>
                </div>
              )}
              <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate(activeOrder.id)} disabled={cancelMutation.isPending}>
                <XCircle className="mr-1.5 h-4 w-4" /> Cancel & Refund
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!activeOrder && (
        <>
          {/* Breadcrumb nav */}
          {step !== "mode" && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
              <button onClick={reset} className="hover:text-foreground hover:underline">Home</button>
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  <button
                    onClick={() => setStep(c.step)}
                    className="capitalize hover:text-foreground hover:underline"
                  >
                    {c.label}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* STEP 1 — Mode */}
          {step === "mode" && (
            <div className="grid gap-4 md:grid-cols-2">
              <button onClick={() => { setUsMode(true); setCountry("usa"); setStep("operator"); }}
                className="group rounded-2xl border-2 border-border bg-card p-8 text-left transition-all hover:border-primary hover:shadow-lg">
                <div className="text-5xl mb-3">🇺🇸</div>
                <div className="text-xl font-bold">US Numbers</div>
                <div className="mt-1 text-sm text-muted-foreground">Get a United States virtual number instantly.</div>
              </button>
              <button onClick={() => { setUsMode(false); setStep("country"); }}
                className="group rounded-2xl border-2 border-border bg-card p-8 text-left transition-all hover:border-primary hover:shadow-lg">
                <div className="text-5xl mb-3">🌍</div>
                <div className="text-xl font-bold">All Countries</div>
                <div className="mt-1 text-sm text-muted-foreground">Choose from 180+ countries worldwide.</div>
              </button>
            </div>
          )}

          {/* STEP 2 — Country picker (All Countries only) */}
          {step === "country" && (
            <Card className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <button onClick={reset} className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="font-semibold text-lg">Select Country</h2>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Search country..."
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {filteredCountries.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">No countries found</p>
                )}
                {filteredCountries.map((c: any) => (
                  <button key={c.iso} onClick={() => pickCountry(c.name)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-accent capitalize transition-colors">
                    <span>{c.name}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* STEP 3 — Operator selector */}
          {step === "operator" && country && (
            <Card className="p-5">
              <div className="flex items-center gap-3 mb-1">
                <button onClick={() => usMode ? reset() : setStep("country")} className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <h2 className="font-semibold text-lg">Select Operator</h2>
                  <p className="text-xs text-muted-foreground capitalize">Country: <strong>{country}</strong></p>
                </div>
              </div>

              <p className="mt-3 mb-4 text-xs text-muted-foreground rounded-md bg-secondary px-3 py-2">
                💡 <strong>virtual</strong> operators work best for WhatsApp, Telegram, Instagram & TikTok.
                Use <strong>any</strong> if unsure — it auto-picks. If your SMS is slow, come back and try a different operator.
              </p>

              {loadingOperators ? (
                <p className="text-sm text-muted-foreground">Loading operators...</p>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
                  {operators.map((op) => {
                    const tip = OPERATOR_TIPS[op.toLowerCase()] ?? "Available operator";
                    const isVirtual = op.toLowerCase().startsWith("virtual");
                    const isAny = op.toLowerCase() === "any";
                    return (
                      <button key={op} onClick={() => pickOperator(op)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-accent transition-colors">
                        <div>
                          <span className={`font-medium capitalize ${isVirtual ? "text-success" : ""}`}>{op}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{tip}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* STEP 4 — Service picker */}
          {step === "service" && country && (
            <Card className="p-5">
              <div className="flex items-center gap-3 mb-1">
                <button onClick={() => setStep("operator")} className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <h2 className="font-semibold text-lg">Select Service</h2>
                  <p className="text-xs text-muted-foreground capitalize">
                    {country} · Operator: <strong>{operator}</strong>
                    <button onClick={() => setStep("operator")} className="ml-2 text-primary hover:underline">change</button>
                  </p>
                </div>
              </div>

              <div className="relative my-3">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Search service (e.g. whatsapp)..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {loadingProducts ? (
                  <p className="p-4 text-sm text-muted-foreground">Loading services...</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No services available for this operator</p>
                ) : (
                  filteredProducts.map((p) => (
                    <button key={p.name} onClick={() => setProduct(p.name)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-accent ${product === p.name ? "bg-primary text-primary-foreground hover:bg-primary" : ""}`}>
                      <div>
                        <span className="font-medium capitalize">{p.name}</span>
                        <p className={`text-xs mt-0.5 ${product === p.name ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {p.qty} available
                        </p>
                      </div>
                      <span className="font-semibold text-sm tabular-nums">{fmt(p.price)}</span>
                    </button>
                  ))
                )}
              </div>

              {/* Buy button */}
              {selectedProduct && (
                <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold capitalize">{selectedProduct.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {country} · {operator} · <span className="font-bold text-foreground">{fmt(selectedProduct.price)}</span>
                      {" "}· {selectedProduct.qty} numbers available
                    </div>
                  </div>
                  <Button
                    disabled={buyMutation.isPending}
                    onClick={() => buyMutation.mutate({ country, product, operator, price_usd: selectedProduct.price_usd ?? selectedProduct.price })}
                    size="lg" className="shadow-glow shrink-0"
                  >
                    <Smartphone className="mr-2 h-4 w-4" />
                    {buyMutation.isPending ? "Renting..." : "Get Number"}
                  </Button>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* History */}
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Recent Orders</h3>
        {(history as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {(history as any[]).slice(0, 20).map((h: any) => (
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
