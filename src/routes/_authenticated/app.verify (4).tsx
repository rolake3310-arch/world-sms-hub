import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import {
  getVerifyCountries,
  getVerifyProducts,
  buyVerifyNumber,
  checkVerifyOrder,
  cancelVerifyOrder,
  getMyVerifications,
} from "@/lib/verify.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Smartphone, Copy, RefreshCw, XCircle, Clock, CheckCircle2, Search } from "lucide-react";
import { useCurrency } from "@/lib/currency";

export const Route = createFileRoute("/_authenticated/app/verify")({
  head: () => ({ meta: [{ title: "SMS Verify — Rent a Number" }] }),
  component: VerifyPage,
});

function VerifyPage() {
  const qc = useQueryClient();
  const fetchCountries = useServerFn(getVerifyCountries);
  const fetchProducts = useServerFn(getVerifyProducts);
  const fetchBuy = useServerFn(buyVerifyNumber);
  const fetchCheck = useServerFn(checkVerifyOrder);
  const fetchCancel = useServerFn(cancelVerifyOrder);
  const fetchHistory = useServerFn(getMyVerifications);

  const [country, setCountry] = useState("");
  const [product, setProduct] = useState("");
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  });

  const { data: products = [], isFetching: loadingProducts } = useQuery({
    queryKey: ["verify-products", country],
    queryFn: () => fetchProducts({ data: { country } }),
    enabled: !!country,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["my-verifications"],
    queryFn: () => fetchHistory(),
  });

  const buyMutation = useMutation({
    mutationFn: (vars: { country: string; product: string; price_usd: number }) =>
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
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["my-verifications"] });
      toast.success("Order cancelled and balance refunded");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to cancel"),
  });

  function startPolling(id: string, expiresAt: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        // Auto-cancel + refund if expired
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

  const { fmt } = useCurrency();

  const selectedProduct = products.find((p) => p.name === product);
  const filteredCountries = countries.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  function copyPhone(phone: string) {
    navigator.clipboard.writeText(phone).then(() => toast.success("Number copied!"));
  }

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">SMS Verify</h1>
        <p className="text-sm text-muted-foreground">
          Rent a virtual number and receive one-time verification codes.
        </p>
      </div>

      {/* Active Order Banner */}
      {activeOrder && (
        <Card className="border-primary/40 bg-primary/5 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                Your rented number
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold tabular-nums tracking-wider">
                  +{activeOrder.phone}
                </span>
                <button
                  onClick={() => copyPhone(activeOrder.phone)}
                  className="rounded-md p-1.5 hover:bg-accent"
                >
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
                  <div className="text-3xl font-bold tabular-nums text-success tracking-widest">
                    {activeOrder.sms_code}
                  </div>
                  <button
                    onClick={() => copyPhone(activeOrder.sms_code)}
                    className="mt-1 text-xs text-success hover:underline"
                  >
                    Copy code
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Waiting for SMS...
                </div>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => cancelMutation.mutate(activeOrder.id)}
                disabled={cancelMutation.isPending}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                Cancel & Refund
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* New Order Form */}
      {!activeOrder && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Country */}
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
              {filteredCountries.map((c) => (
                <button
                  key={c.iso}
                  onClick={() => { setCountry(c.name); setProduct(""); }}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    country === c.name ? "bg-primary text-primary-foreground" : ""
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </Card>

          {/* Service / Product */}
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">2. Choose Service</h3>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Search service..."
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
                <p className="p-4 text-sm text-muted-foreground">No services available</p>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setProduct(p.name)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                      product === p.name ? "bg-primary text-primary-foreground" : ""
                    }`}
                  >
                    <span className="capitalize">{p.name}</span>
                    <span className="text-xs font-medium">{fmt(p.price)}</span>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Buy Button */}
      {!activeOrder && (
        <Card className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              {selectedProduct ? (
                <>
                  <div className="font-semibold">
                    {selectedProduct.name} — {country}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Cost: <span className="font-bold text-foreground">{fmt(selectedProduct.price)}</span>
                    {" "}· {selectedProduct.qty} numbers available
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Select a country and service to continue
                </div>
              )}
            </div>
            <Button
              disabled={!selectedProduct || buyMutation.isPending}
              onClick={() =>
                buyMutation.mutate({
                  country,
                  product,
                  price_usd: selectedProduct!.price_usd,  // always USD, never converted
                })
              }
              size="lg"
              className="shadow-glow"
            >
              <Smartphone className="mr-2 h-4 w-4" />
              {buyMutation.isPending ? "Renting..." : "Rent Number"}
            </Button>
          </div>
        </Card>
      )}

      {/* History */}
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Recent Orders</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {history.slice(0, 20).map((h: any) => (
              <div key={h.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">+{h.phone}</span>
                    {h.sms_code && (
                      <span className="rounded bg-success/10 px-1.5 py-0.5 text-xs font-bold text-success">
                        {h.sms_code}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {h.service} · {h.country} · {fmt(Number(h.cost_usd))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={h.status} />
                </div>
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
