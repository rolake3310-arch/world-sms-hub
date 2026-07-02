import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp, Search, RefreshCw, ArrowLeft } from "lucide-react";
import {
  getSmmServices,
  quoteSmmOrder,
  createSmmOrder,
  checkSmmOrder,
  getMySmmOrders,
} from "@/lib/smm.functions";
import { getMyProfile } from "@/lib/sms.functions";
import { useCurrency } from "@/lib/currency";

export const Route = createFileRoute("/_authenticated/app/smm")({
  head: () => ({ meta: [{ title: "Grow Socials" }] }),
  component: SmmPage,
});

type Service = {
  service_id: string;
  name: string;
  category: string;
  min: number;
  max: number;
  price_per_1000: number;
  refill: boolean;
  dripfeed: boolean;
};

function SmmPage() {
  const qc = useQueryClient();
  const { fmt } = useCurrency();

  const fetchServices = useServerFn(getSmmServices);
  const fetchQuote = useServerFn(quoteSmmOrder);
  const fetchOrder = useServerFn(createSmmOrder);
  const fetchCheck = useServerFn(checkSmmOrder);
  const fetchHistory = useServerFn(getMySmmOrders);
  const getMe = useServerFn(getMyProfile);

  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Service | null>(null);
  const [search, setSearch] = useState("");
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const balance = Number(me?.profile?.balance_usd ?? 0);

  const { data, isLoading } = useQuery({
    queryKey: ["smm-services"],
    queryFn: () => fetchServices(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["my-smm-orders"],
    queryFn: () => fetchHistory(),
  });

  const services: Service[] = (data as any)?.services ?? [];
  const enabled = (data as any)?.enabled !== false;

  const categories = useMemo(() => {
    const set = new Set(services.map((s) => s.category));
    return Array.from(set).sort();
  }, [services]);

  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      if (category && s.category !== category) return false;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [services, category, search]);

  const qty = Number(quantity);
  const validQty = selected && qty >= selected.min && qty <= selected.max;
  const cost = selected && validQty ? (selected.price_per_1000 / 1000) * qty : 0;

  const orderMutation = useMutation({
    mutationFn: () =>
      fetchOrder({
        data: {
          service_id: selected!.service_id,
          service_name: selected!.name,
          category: selected!.category,
          link,
          quantity: qty,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Order placed for ${fmt(r.charge_usd)}`);
      setSelected(null);
      setLink("");
      setQuantity("");
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["my-smm-orders"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to place order"),
  });

  const checkMutation = useMutation({
    mutationFn: (id: string) => fetchCheck({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-smm-orders"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to refresh"),
  });

  if (!isLoading && !enabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Grow Socials</h1>
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Social growth services aren't available right now. Please check back later.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Grow Socials</h1>
        <p className="text-sm text-muted-foreground">
          Boost followers, likes, views and more across Instagram, TikTok, YouTube, and other
          platforms.
        </p>
      </div>

      {!selected ? (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <Card className="h-fit p-3">
            <button
              onClick={() => setCategory(null)}
              className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                category === null ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              All platforms
            </button>
            <div className="max-h-[60vh] overflow-y-auto">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`mb-1 w-full truncate rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    category === c ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Search services (e.g. Instagram followers)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="h-[55vh] overflow-y-auto rounded-md border border-border">
              {isLoading ? (
                <p className="p-4 text-sm text-muted-foreground">Loading services...</p>
              ) : filteredServices.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No services found.</p>
              ) : (
                filteredServices.map((s) => (
                  <button
                    key={s.service_id}
                    onClick={() => {
                      setSelected(s);
                      setQuantity(String(s.min));
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.category} · min {s.min.toLocaleString()} · max {s.max.toLocaleString()}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs font-semibold text-muted-foreground">
                      {fmt(s.price_per_1000)} / 1000
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : (
        <Card className="max-w-xl space-y-4 p-5">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to services
          </button>
          <div>
            <div className="font-semibold">{selected.name}</div>
            <div className="text-xs text-muted-foreground">
              {selected.category} · {fmt(selected.price_per_1000)} per 1000
            </div>
          </div>

          <div>
            <Label htmlFor="link">Profile / post link</Label>
            <Input
              id="link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://instagram.com/yourprofile"
            />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={`${selected.min} - ${selected.max}`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Min {selected.min.toLocaleString()} · Max {selected.max.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-secondary/50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total cost</span>
              <span className="font-bold text-lg">{fmt(cost)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Balance</span>
              <span>{fmt(balance)}</span>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full"
            disabled={!validQty || !link.trim() || orderMutation.isPending || cost > balance}
            onClick={() => orderMutation.mutate()}
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            {orderMutation.isPending
              ? "Placing order..."
              : cost > balance
                ? "Insufficient balance"
                : `Order for ${fmt(cost)}`}
          </Button>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Recent Orders</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {(history as any[]).map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{h.service_name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {h.quantity.toLocaleString()} · {fmt(Number(h.charge_usd))}
                    {h.remains != null ? ` · ${h.remains} remaining` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={h.status} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => checkMutation.mutate(h.id)}
                    disabled={checkMutation.isPending}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
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
    pending: "bg-warning/10 text-warning",
    "in progress": "bg-primary/10 text-primary",
    processing: "bg-primary/10 text-primary",
    completed: "bg-success/10 text-success",
    partial: "bg-warning/10 text-warning",
    canceled: "bg-destructive/10 text-destructive",
    cancelled: "bg-destructive/10 text-destructive",
    failed: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${map[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}
