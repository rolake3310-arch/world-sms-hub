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
import { submitCryptoDeposit, submitBankDeposit, createSquadCheckout, verifySquadDeposit, getMyDeposits } from "@/lib/funding.functions";
import { Bitcoin, CreditCard, Building2, Copy, CheckCircle2 } from "lucide-react";
import { useCurrency } from "@/lib/currency";

export const Route = createFileRoute("/_authenticated/app/fund")({
  component: FundPage,
});

function FundPage() {
  const getSettings = useServerFn(getPublicSettings);
  const getDeps = useServerFn(getMyDeposits);
  const verifyFn = useServerFn(verifySquadDeposit);
  const { data } = useQuery({ queryKey: ["public-settings"], queryFn: () => getSettings() });
  const { data: deps } = useQuery({ queryKey: ["my-deps"], queryFn: () => getDeps() });
  const { fmt } = useCurrency();
  const qc = useQueryClient();

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
  const bankOn = (data?.settings as any)?.bank_enabled;
  const minFund = Number((data?.settings as any)?.min_fund_usd ?? 0);
  const initial = cryptoOn ? "crypto" : bankOn ? "bank" : squadOn ? "squad" : "crypto";

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Fund your wallet</h1>
        <p className="text-sm text-muted-foreground">
          Top up with crypto, bank transfer, or card.
          {minFund > 0 && <> Minimum deposit: <span className="font-semibold text-foreground">{fmt(minFund)}</span>.</>}
        </p>
      </div>

      {!cryptoOn && !squadOn && !bankOn && (
        <Card className="p-5 text-sm text-muted-foreground">No funding methods are enabled. Contact support.</Card>
      )}

      <Tabs defaultValue={initial}>
        <TabsList>
          {cryptoOn && <TabsTrigger value="crypto"><Bitcoin className="mr-2 h-4 w-4" /> Crypto</TabsTrigger>}
          {bankOn && <TabsTrigger value="bank"><Building2 className="mr-2 h-4 w-4" /> Bank transfer</TabsTrigger>}
          {squadOn && <TabsTrigger value="squad"><CreditCard className="mr-2 h-4 w-4" /> Squad (Card / Bank)</TabsTrigger>}
        </TabsList>
        {cryptoOn && (
          <TabsContent value="crypto">
            <CryptoPanel wallets={data?.wallets ?? []} minFund={minFund} />
          </TabsContent>
        )}
        {bankOn && (
          <TabsContent value="bank">
            <BankPanel banks={(data as any)?.banks ?? []} instructions={(data?.settings as any)?.bank_instructions ?? ""} minFund={minFund} />
          </TabsContent>
        )}
        {squadOn && (
          <TabsContent value="squad">
            <SquadPanel minFund={minFund} />
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
                  <div className="font-medium">{fmt(Number(d.amount_usd))} <span className="text-xs text-muted-foreground">via {d.method}</span></div>
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

function CryptoPanel({ wallets, minFund }: { wallets: { id: string; label: string; asset: string; network: string | null; address: string }[]; minFund: number }) {
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [txRef, setTxRef] = useState("");
  const [notes, setNotes] = useState("");
  const submit = useServerFn(submitCryptoDeposit);
  const { fmt, symbol } = useCurrency();
  const qc = useQueryClient();
  const selected = wallets.find((w) => w.id === walletId) ?? wallets[0];

  const m = useMutation({
    mutationFn: () => submit({ data: { amount_usd: Number(amount), asset: selected?.asset ?? "", tx_reference: txRef, notes } }),
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
            <button key={w.id} onClick={() => setWalletId(w.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${walletId === w.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}>
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
          <Label htmlFor="amt">Amount (USD equivalent)</Label>
          <Input id="amt" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Always enter in USD — your balance will show in {symbol === "₦" ? "Naira" : "USD"}.</p>
        </div>
        <div>
          <Label htmlFor="tx">Transaction hash / reference</Label>
          <Input id="tx" value={txRef} onChange={(e) => setTxRef(e.target.value)} placeholder="0xabc..." className="font-mono" />
        </div>
        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <Button onClick={() => m.mutate()} disabled={!amount || !txRef || Number(amount) < minFund || m.isPending} className="w-full">
          {m.isPending ? "Submitting..." : "Submit deposit"}
        </Button>
        <p className="text-xs text-muted-foreground">Your balance is credited after admin verifies.{minFund > 0 && ` Minimum ${fmt(minFund)}.`}</p>
      </Card>
    </div>
  );
}

function SquadPanel({ minFund }: { minFund: number }) {
  const [amount, setAmount] = useState("");
  const create = useServerFn(createSquadCheckout);
  const { fmt } = useCurrency();
  const m = useMutation({
    mutationFn: () => create({ data: { amount_usd: Number(amount), callback_url: `${window.location.origin}/app/fund` } }),
    onSuccess: (r) => { window.location.href = r.checkout_url; },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <Card className="mt-4 max-w-md space-y-3 p-5">
      <h3 className="font-semibold">Pay with card or bank</h3>
      <div>
        <Label htmlFor="sa">Amount (USD)</Label>
        <Input id="sa" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <Button onClick={() => m.mutate()} disabled={!amount || Number(amount) < minFund || m.isPending} className="w-full">
        {m.isPending ? "Preparing..." : "Continue to Squad"}
      </Button>
      <p className="text-xs text-muted-foreground">You'll be redirected to Squad's secure checkout.{minFund > 0 && ` Minimum ${fmt(minFund)}.`}</p>
    </Card>
  );
}

type BankAccount = { id: string; label: string; bank_name: string; account_name: string; account_number: string; extra: string | null };

function BankPanel({ banks, instructions, minFund }: { banks: BankAccount[]; instructions: string; minFund: number }) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [senderName, setSenderName] = useState("");
  const [txRef, setTxRef] = useState("");
  const [notes, setNotes] = useState("");
  const submit = useServerFn(submitBankDeposit);
  const { fmt, symbol } = useCurrency();
  const qc = useQueryClient();
  const selected = banks.find((b) => b.id === bankId) ?? banks[0];

  const m = useMutation({
    mutationFn: () => submit({ data: { amount_usd: Number(amount), bank_account_id: selected?.id ?? "", sender_name: senderName, tx_reference: txRef, notes } }),
    onSuccess: () => {
      toast.success("Transfer submitted. Admin will verify and credit your balance.");
      setAmount(""); setSenderName(""); setTxRef(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["my-deps"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (banks.length === 0) {
    return <Card className="mt-4 p-5 text-sm text-muted-foreground">No bank accounts configured. Ask the admin to add one.</Card>;
  }

  return (
    <div className="mt-4 grid gap-6 md:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">1. Transfer to one of these accounts</h3>
        {instructions && (
          <div className="mb-3 rounded-md border border-border bg-secondary/50 p-3 text-xs whitespace-pre-wrap">{instructions}</div>
        )}
        <div className="space-y-2">
          {banks.map((b) => (
            <button key={b.id} onClick={() => setBankId(b.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${bankId === b.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold">{b.label}</div>
                {bankId === b.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
              <div className="mt-1 space-y-0.5 text-xs">
                <div><span className="text-muted-foreground">Bank:</span> {b.bank_name}</div>
                <div><span className="text-muted-foreground">Account name:</span> {b.account_name}</div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Account #:</span>
                  <code className="font-mono">{b.account_number}</code>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(b.account_number); toast.success("Copied"); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                {b.extra && <div className="whitespace-pre-wrap text-muted-foreground">{b.extra}</div>}
              </div>
            </button>
          ))}
        </div>
      </Card>
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">2. Submit your transfer details</h3>
        <div>
          <Label htmlFor="bamt">Amount (Naira transferred)</Label>
          <Input id="bamt" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Enter in USD equivalent — admin will convert at current rate.{minFund > 0 && ` Minimum ${fmt(minFund)}.`}</p>
        </div>
        <div>
          <Label htmlFor="bsn">Sender / account name used</Label>
          <Input id="bsn" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="John Doe" />
        </div>
        <div>
          <Label htmlFor="btx">Transfer reference / receipt #</Label>
          <Input id="btx" value={txRef} onChange={(e) => setTxRef(e.target.value)} placeholder="TXN123456" className="font-mono" />
        </div>
        <div>
          <Label htmlFor="bnotes">Notes (optional)</Label>
          <Textarea id="bnotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <Button onClick={() => m.mutate()} disabled={!amount || !senderName || !txRef || Number(amount) < minFund || m.isPending} className="w-full">
          {m.isPending ? "Submitting..." : "Submit transfer"}
        </Button>
      </Card>
    </div>
  );
}
