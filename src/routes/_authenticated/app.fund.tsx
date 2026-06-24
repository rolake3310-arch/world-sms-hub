import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPublicSettings } from "@/lib/sms.functions";
import { submitCryptoDeposit, createSquadCheckout, verifySquadDeposit, getMyDeposits } from "@/lib/funding.functions";
import { Bitcoin, CreditCard, Copy, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/fund")({
  component: FundPage,
});

function FundPage() {
  const getSettings = useServerFn(getPublicSettings);
  const getDeps = useServerFn(getMyDeposits);
  const verifyFn = useServerFn(verifySquadDeposit);
  const { data } = useQuery({ queryKey: ["public-settings"], queryFn: () => getSettings() });
  const { data: deps } = useQuery({ queryKey: ["my-deps"], queryFn: () => getDeps() });
  const qc = useQueryClient();

  // Squad return flow: ?reference=...
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("reference") || url.searchParams.get("transaction_ref");
    if (!ref) return;
    verifyFn({ data: { reference: ref } }).then((r) => {
      if (r.success) toast.success("Payment confirmed — balance credited");
      else toast.info("Payment is being verified, refresh in a moment");
      window.history.replaceState({}, "", "/app/fund");
      qc.invalidateQueries({ queryKey: ["my-deps"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    }).catch((e) => toast.error(e.message));
  }, []);

  const cryptoOn = data?.settings.crypto_enabled;
  const squadOn = data?.settings.squad_enabled;
  const initial = cryptoOn ? "crypto" : squadOn ? "squad" : "crypto";

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Fund your wallet</h1>
        <p className="text-sm text-muted-foreground">Top up with crypto or card.</p>
      </div>

      {!cryptoOn && !squadOn && (
        <Card className="p-5 text-sm text-muted-foreground">No funding methods are enabled. Contact support.</Card>
      )}

      <Tabs defaultValue={initial}>
        <TabsList>
          {cryptoOn && <TabsTrigger value="crypto"><Bitcoin className="mr-2 h-4 w-4" /> Crypto</TabsTrigger>}
          {squadOn && <TabsTrigger value="squad"><CreditCard className="mr-2 h-4 w-4" /> Squad (Card / Bank)</TabsTrigger>}
        </TabsList>
        {cryptoOn && (
          <TabsContent value="crypto">
            <CryptoPanel wallets={data?.wallets ?? []} />
          </TabsContent>
        )}
        {squadOn && (
          <TabsContent value="squad">
            <SquadPanel />
          </TabsContent>
        )}
      </Tabs>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Your deposits</h3>
        {(deps ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No deposits yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(deps ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">${Number(d.amount_usd).toFixed(2)} · {d.method} {d.asset ? `(${d.asset})` : ""}</div>
                  <div className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()} · {d.tx_reference}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  d.status === "approved" ? "bg-success/10 text-success" :
                  d.status === "rejected" ? "bg-destructive/10 text-destructive" :
                  "bg-warning/10 text-warning"
                }`}>{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CryptoPanel({ wallets }: { wallets: { id: string; label: string; asset: string; network: string | null; address: string }[] }) {
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [txRef, setTxRef] = useState("");
  const [notes, setNotes] = useState("");
  const submit = useServerFn(submitCryptoDeposit);
  const qc = useQueryClient();
  const selected = wallets.find((w) => w.id === walletId) ?? wallets[0];

  const m = useMutation({
    mutationFn: () => submit({ data: {
      amount_usd: Number(amount),
      asset: selected?.asset ?? "",
      tx_reference: txRef,
      notes,
    }}),
    onSuccess: () => {
      toast.success("Deposit submitted. Admin will review & credit your balance shortly.");
      setAmount(""); setTxRef(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["my-deps"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (wallets.length === 0) {
    return <Card className="mt-4 p-5 text-sm text-muted-foreground">No crypto wallets configured. Ask the admin to add wallet addresses.</Card>;
  }

  return (
    <div className="mt-4 grid gap-6 md:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">1. Send to one of these addresses</h3>
        <div className="space-y-2">
          {wallets.map((w) => (
            <button
              key={w.id}
              onClick={() => setWalletId(w.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${walletId === w.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold">{w.label} · {w.asset}{w.network ? ` (${w.network})` : ""}</div>
                {walletId === w.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-secondary px-2 py-1 font-mono text-xs">{w.address}</code>
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(w.address); toast.success("Copied"); }}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">2. Submit proof</h3>
        <div>
          <Label htmlFor="amt">Amount (USD)</Label>
          <Input id="amt" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="tx">Transaction hash / reference</Label>
          <Input id="tx" value={txRef} onChange={(e) => setTxRef(e.target.value)} placeholder="0xabc..." className="font-mono" />
        </div>
        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <Button onClick={() => m.mutate()} disabled={!amount || !txRef || m.isPending} className="w-full">
          {m.isPending ? "Submitting..." : "Submit deposit"}
        </Button>
        <p className="text-xs text-muted-foreground">Your balance is credited after the admin verifies the transaction on-chain.</p>
      </Card>
    </div>
  );
}

function SquadPanel() {
  const [amount, setAmount] = useState("");
  const create = useServerFn(createSquadCheckout);
  const m = useMutation({
    mutationFn: () => create({ data: {
      amount_usd: Number(amount),
      callback_url: `${window.location.origin}/app/fund`,
    }}),
    onSuccess: (r) => { window.location.href = r.checkout_url; },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <Card className="mt-4 max-w-md space-y-3 p-5">
      <h3 className="font-semibold">Pay with card or bank</h3>
      <div>
        <Label htmlFor="sa">Amount</Label>
        <Input id="sa" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <Button onClick={() => m.mutate()} disabled={!amount || m.isPending} className="w-full">
        {m.isPending ? "Preparing..." : "Continue to Squad"}
      </Button>
      <p className="text-xs text-muted-foreground">You'll be redirected to Squad's secure checkout. Balance credits automatically on success.</p>
    </Card>
  );
}
