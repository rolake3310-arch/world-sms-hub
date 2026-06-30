import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMyProfile, getPublicSettings } from "@/lib/sms.functions";
import {
  adminGetStats, adminUpdateSettings, adminListWallets, adminUpsertWallet, adminDeleteWallet,
  adminUpsertCountryPrice, adminDeleteCountryPrice,
  adminListDeposits, adminReviewDeposit,
  adminListUsers, adminAdjustBalance, adminSetUserStatus, adminSetUserRole,
  adminListMessages,
  adminListBankAccounts, adminUpsertBankAccount, adminDeleteBankAccount,
  adminListVerifyPrices, adminUpsertVerifyPrice, adminDeleteVerifyPrice,
} from "@/lib/admin.functions";
import { Textarea } from "@/components/ui/textarea";
import { getCountryPrices } from "@/lib/sms.functions";
import { getVerifyCountries } from "@/lib/verify.functions";
import { ShieldAlert, Trash2 } from "lucide-react";


export const Route = createFileRoute("/_authenticated/app/admin")({
  component: AdminPage,
});

function AdminPage() {
  const me = useServerFn(getMyProfile);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => me() });
  if (data && !data.isAdmin) {
    return (
      <Card className="mt-8 p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-destructive" />
        <p className="font-semibold">Admin access required</p>
      </Card>
    );
  }
  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Admin</h1>
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Funding & Pricing</TabsTrigger>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="banks">Bank accounts</TabsTrigger>
          <TabsTrigger value="countries">Country prices</TabsTrigger>
          <TabsTrigger value="verify-prices">Verify Prices</TabsTrigger>
          <TabsTrigger value="deposits">Deposits</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><Overview /></TabsContent>
        <TabsContent value="settings"><SettingsPanel /></TabsContent>
        <TabsContent value="wallets"><WalletsPanel /></TabsContent>
        <TabsContent value="banks"><BanksPanel /></TabsContent>
        <TabsContent value="countries"><CountriesPanel /></TabsContent>
        <TabsContent value="verify-prices"><VerifyPricesPanel /></TabsContent>
        <TabsContent value="deposits"><DepositsPanel /></TabsContent>
        <TabsContent value="users"><UsersPanel /></TabsContent>
        <TabsContent value="messages"><MessagesPanel /></TabsContent>

      </Tabs>
    </div>
  );
}

function Overview() {
  const fn = useServerFn(adminGetStats);
  const { data } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fn() });
  const items = [
    { l: "Users", v: data?.userCount ?? 0 },
    { l: "SMS sent", v: data?.smsCount ?? 0 },
    { l: "Revenue (SMS)", v: `$${(data?.revenueUsd ?? 0).toFixed(2)}` },
    { l: "Approved deposits", v: `$${(data?.depositsApprovedUsd ?? 0).toFixed(2)}` },
    { l: "Pending deposits", v: data?.depositsPending ?? 0 },
  ];
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
      {items.map((i) => (
        <Card key={i.l} className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{i.l}</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{i.v}</div>
        </Card>
      ))}
    </div>
  );
}

function SettingsPanel() {
  const get = useServerFn(getPublicSettings);
  const save = useServerFn(adminUpdateSettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["public-settings"], queryFn: () => get() });
  const s = data?.settings;
  const [form, setForm] = useState<any>(null);
  const f = form ?? s;
  const m = useMutation({
    mutationFn: () => save({ data: {
      crypto_enabled: !!f?.crypto_enabled,
      squad_enabled: !!f?.squad_enabled,
      bank_enabled: !!f?.bank_enabled,
      bank_instructions: f?.bank_instructions ?? null,
      min_fund_usd: Number(f?.min_fund_usd ?? 0),
      default_price_usd: Number(f?.default_price_usd ?? 0.05),
      squad_public_key: f?.squad_public_key ?? null,
      squad_environment: f?.squad_environment ?? "sandbox",
      verify_markup: Number(f?.verify_markup ?? 1.5),
      site_currency: f?.site_currency ?? "USD",
      usd_to_ngn: Number(f?.usd_to_ngn ?? 1600),
      telegram_popup_enabled: !!f?.telegram_popup_enabled,
      telegram_url: f?.telegram_url ?? "",
      telegram_popup_title: f?.telegram_popup_title ?? "Join Our Telegram!",
      telegram_popup_subtitle: f?.telegram_popup_subtitle ?? "Official channel · Free activation keys",
      telegram_popup_body: f?.telegram_popup_body ?? "Stay updated and get free activation keys by joining our Telegram channel 🎁",
    } }),

    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["public-settings"] }); },
    onError: (e: any) => toast.error(e?.message),
  });
  if (!f) return null;
  return (
    <Card className="mt-4 max-w-xl space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Crypto funding</div>
          <div className="text-xs text-muted-foreground">Show wallet addresses & manual approval</div>
        </div>
        <Switch checked={!!f.crypto_enabled} onCheckedChange={(v) => setForm({ ...f, crypto_enabled: v })} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Bank transfer</div>
          <div className="text-xs text-muted-foreground">Show bank account(s) & manual approval</div>
        </div>
        <Switch checked={!!f.bank_enabled} onCheckedChange={(v) => setForm({ ...f, bank_enabled: v })} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Squad (squadco.com)</div>
          <div className="text-xs text-muted-foreground">Card / bank checkout</div>
        </div>
        <Switch checked={!!f.squad_enabled} onCheckedChange={(v) => setForm({ ...f, squad_enabled: v })} />
      </div>
      <div>
        <Label>Minimum funding amount (USD)</Label>
        <Input type="number" step="0.01" value={f.min_fund_usd ?? 0} onChange={(e) => setForm({ ...f, min_fund_usd: e.target.value })} />
        <p className="mt-1 text-xs text-muted-foreground">Applies to crypto, bank transfer, and Squad. Set 0 to disable.</p>
      </div>
      <div>
        <Label>Bank transfer instructions (shown to users)</Label>
        <Textarea rows={3} value={f.bank_instructions ?? ""} onChange={(e) => setForm({ ...f, bank_instructions: e.target.value })} placeholder="E.g. Use your email as the transfer reference. Allow 1-24h for review." />
      </div>
      <div>
        <Label>Default price per SMS segment (USD)</Label>
        <Input type="number" step="0.0001" value={f.default_price_usd} onChange={(e) => setForm({ ...f, default_price_usd: e.target.value })} />
      </div>
      <div>
        <Label>SMS Verify markup multiplier</Label>
        <Input type="number" step="0.1" min="1" value={f.verify_markup ?? 1.5} onChange={(e) => setForm({ ...f, verify_markup: e.target.value })} />
        <p className="mt-1 text-xs text-muted-foreground">
          Multiplier applied to 5sim prices before showing to users. e.g. <strong>1.5</strong> = 50% profit, <strong>2</strong> = 100% profit. Minimum is 1 (no markup).
        </p>
      </div>
      <div>
        <Label>Site currency</Label>
        <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={f.site_currency ?? "USD"}
          onChange={(e) => setForm({ ...f, site_currency: e.target.value })}>
          <option value="USD">USD ($)</option>
          <option value="NGN">NGN (₦)</option>
        </select>
        <p className="mt-1 text-xs text-muted-foreground">All prices shown to users will display in this currency.</p>
      </div>
      <div>
        <Label>USD → NGN exchange rate</Label>
        <Input type="number" step="1" min="1" value={f.usd_to_ngn ?? 1600} onChange={(e) => setForm({ ...f, usd_to_ngn: e.target.value })} />
        <p className="mt-1 text-xs text-muted-foreground">
          Live rate today: <strong>$1 ≈ ₦1,388</strong> (black market ~₦1,400). Set your own rate to include your spread.
        </p>
      </div>

      <div>
        <Label>Squad environment</Label>
        <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={f.squad_environment}
          onChange={(e) => setForm({ ...f, squad_environment: e.target.value })}>
          <option value="sandbox">Sandbox (test)</option>
          <option value="live">Live</option>
        </select>
      </div>
      <div>
        <Label>Squad public key (optional, for inline checkout)</Label>
        <Input value={f.squad_public_key ?? ""} onChange={(e) => setForm({ ...f, squad_public_key: e.target.value })} />
        <p className="mt-1 text-xs text-muted-foreground">Add the Squad SECRET key as a secret named <code>SQUAD_SECRET_KEY</code> via project settings.</p>
      </div>
      {/* ── Telegram Popup ── */}
      <div className="border-t pt-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">Telegram channel popup</div>
            <div className="text-xs text-muted-foreground">Shows to users every time they load the dashboard</div>
          </div>
          <Switch checked={!!f.telegram_popup_enabled} onCheckedChange={(v) => setForm({ ...f, telegram_popup_enabled: v })} />
        </div>
        <div className="space-y-3">
          <div>
            <Label>Telegram channel link</Label>
            <Input value={f.telegram_url ?? ""} onChange={(e) => setForm({ ...f, telegram_url: e.target.value })} placeholder="https://t.me/yourchannel" />
          </div>
          <div>
            <Label>Popup title</Label>
            <Input value={f.telegram_popup_title ?? ""} onChange={(e) => setForm({ ...f, telegram_popup_title: e.target.value })} placeholder="Join Our Telegram!" />
          </div>
          <div>
            <Label>Popup subtitle</Label>
            <Input value={f.telegram_popup_subtitle ?? ""} onChange={(e) => setForm({ ...f, telegram_popup_subtitle: e.target.value })} placeholder="Official channel · Free activation keys" />
          </div>
          <div>
            <Label>Popup body text</Label>
            <Textarea rows={2} value={f.telegram_popup_body ?? ""} onChange={(e) => setForm({ ...f, telegram_popup_body: e.target.value })} placeholder="Stay updated and get free activation keys by joining our Telegram channel 🎁" />
          </div>
        </div>
      </div>

      <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving..." : "Save settings"}</Button>
    </Card>
  );
}

function WalletsPanel() {
  const list = useServerFn(adminListWallets);
  const upsert = useServerFn(adminUpsertWallet);
  const del = useServerFn(adminDeleteWallet);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-wallets"], queryFn: () => list() });
  const [form, setForm] = useState({ label: "", asset: "USDT", network: "TRC20", address: "", active: true });
  const m = useMutation({
    mutationFn: () => upsert({ data: form }),
    onSuccess: () => { toast.success("Saved"); setForm({ label: "", asset: "USDT", network: "TRC20", address: "", active: true }); qc.invalidateQueries({ queryKey: ["admin-wallets"] }); qc.invalidateQueries({ queryKey: ["public-settings"] }); },
    onError: (e: any) => toast.error(e?.message),
  });
  const dm = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-wallets"] }); qc.invalidateQueries({ queryKey: ["public-settings"] }); },
  });

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Add wallet</h3>
        <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="USDT TRC20" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Asset</Label><Input value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} /></div>
          <div><Label>Network</Label><Input value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} /></div>
        </div>
        <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="font-mono" /></div>
        <Button onClick={() => m.mutate()} disabled={!form.label || !form.address || m.isPending}>Add</Button>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Existing wallets</h3>
        <ul className="space-y-2">
          {(data ?? []).map((w: any) => (
            <li key={w.id} className="flex items-start justify-between gap-2 rounded border border-border p-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{w.label} <span className="text-xs text-muted-foreground">· {w.asset}{w.network ? ` (${w.network})` : ""}</span></div>
                <div className="break-all font-mono text-xs text-muted-foreground">{w.address}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => dm.mutate(w.id)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
          {(data ?? []).length === 0 && <li className="text-sm text-muted-foreground">None.</li>}
        </ul>
      </Card>
    </div>
  );
}

function CountriesPanel() {
  const list = useServerFn(getCountryPrices);
  const upsert = useServerFn(adminUpsertCountryPrice);
  const del = useServerFn(adminDeleteCountryPrice);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["country-prices"], queryFn: () => list() });
  const [form, setForm] = useState({ country_code: "", country_name: "", price_usd: "" });
  const m = useMutation({
    mutationFn: () => upsert({ data: {
      country_code: form.country_code.toUpperCase(), country_name: form.country_name, price_usd: Number(form.price_usd),
    }}),
    onSuccess: () => { toast.success("Saved"); setForm({ country_code: "", country_name: "", price_usd: "" }); qc.invalidateQueries({ queryKey: ["country-prices"] }); },
    onError: (e: any) => toast.error(e?.message),
  });
  const dm = useMutation({
    mutationFn: (cc: string) => del({ data: { country_code: cc } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["country-prices"] }),
  });
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-[320px_1fr]">
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Add / update price</h3>
        <div><Label>Country code (ISO 2)</Label><Input maxLength={2} value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value.toUpperCase() })} placeholder="US" /></div>
        <div><Label>Country name</Label><Input value={form.country_name} onChange={(e) => setForm({ ...form, country_name: e.target.value })} placeholder="United States" /></div>
        <div><Label>Price per segment (USD)</Label><Input type="number" step="0.0001" value={form.price_usd} onChange={(e) => setForm({ ...form, price_usd: e.target.value })} /></div>
        <Button onClick={() => m.mutate()} disabled={!form.country_code || !form.country_name || !form.price_usd || m.isPending}>Save</Button>
      </Card>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="p-3">Code</th><th className="p-3">Country</th><th className="p-3 text-right">Price</th><th className="p-3"></th></tr></thead>
          <tbody>
            {(data ?? []).length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Using default price for all countries.</td></tr>}
            {(data ?? []).map((c) => (
              <tr key={c.country_code} className="border-t border-border">
                <td className="p-3 font-mono">{c.country_code}</td>
                <td className="p-3">{c.country_name}</td>
                <td className="p-3 text-right tabular-nums">${Number(c.price_usd).toFixed(4)}</td>
                <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => dm.mutate(c.country_code)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DepositsPanel() {
  const list = useServerFn(adminListDeposits);
  const review = useServerFn(adminReviewDeposit);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-deposits"], queryFn: () => list() });
  const m = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject" }) => review({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-deposits"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
    onError: (e: any) => toast.error(e?.message),
  });
  return (
    <Card className="mt-4 p-0">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="p-3">Date</th><th className="p-3">User</th><th className="p-3">Method</th><th className="p-3">Amount</th><th className="p-3">Reference</th><th className="p-3">Status</th><th className="p-3"></th></tr>
        </thead>
        <tbody>
          {(data ?? []).length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No deposits.</td></tr>}
          {(data ?? []).map((d: any) => (
            <tr key={d.id} className="border-t border-border">
              <td className="p-3 whitespace-nowrap text-xs">{new Date(d.created_at).toLocaleString()}</td>
              <td className="p-3 text-xs">{d.user_email}</td>
              <td className="p-3 capitalize">{d.method} {d.asset ? <span className="text-xs text-muted-foreground">({d.asset})</span> : ""}</td>
              <td className="p-3 tabular-nums">${Number(d.amount_usd).toFixed(2)}</td>
              <td className="p-3 font-mono text-xs break-all">{d.tx_reference}</td>
              <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${d.status === "approved" ? "bg-success/10 text-success" : d.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>{d.status}</span></td>
              <td className="p-3 text-right">
                {d.status === "pending" && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => m.mutate({ id: d.id, action: "approve" })}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => m.mutate({ id: d.id, action: "reject" })}>Reject</Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function UsersPanel() {
  const list = useServerFn(adminListUsers);
  const adjust = useServerFn(adminAdjustBalance);
  const status = useServerFn(adminSetUserStatus);
  const role = useServerFn(adminSetUserRole);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-users"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const filtered = (data ?? []).filter((u: any) => u.email?.toLowerCase().includes(q.toLowerCase()));
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  return (
    <div className="mt-4 space-y-3">
      <Input placeholder="Search by email..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-3">Email</th><th className="p-3">Balance</th><th className="p-3">Status</th><th className="p-3">Roles</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {filtered.map((u: any) => (
              <tr key={u.id} className="border-t border-border align-top">
                <td className="p-3"><div className="font-medium">{u.email}</div><div className="text-xs text-muted-foreground">{u.full_name}</div></td>
                <td className="p-3 tabular-nums">${Number(u.balance_usd).toFixed(2)}</td>
                <td className="p-3 capitalize">{u.status}</td>
                <td className="p-3 text-xs">{u.roles.join(", ") || "user"}</td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-1 justify-end">
                    <AdjustBtn onSubmit={(amt) => adjust({ data: { user_id: u.id, delta_usd: amt } }).then(refresh)} />
                    <Button size="sm" variant="outline" onClick={() => status({ data: { user_id: u.id, status: u.status === "active" ? "suspended" : "active" } }).then(refresh)}>
                      {u.status === "active" ? "Suspend" : "Activate"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => role({ data: { user_id: u.id, role: "admin", grant: !u.roles.includes("admin") } }).then(refresh)}>
                      {u.roles.includes("admin") ? "Revoke admin" : "Make admin"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No users.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function VerifyPricesPanel() {
  const list = useServerFn(adminListVerifyPrices);
  const upsert = useServerFn(adminUpsertVerifyPrice);
  const del = useServerFn(adminDeleteVerifyPrice);
  const getSettings = useServerFn(getPublicSettings);
  const getCountries = useServerFn(getVerifyCountries);
  const qc = useQueryClient();

  const { data: priceData } = useQuery({ queryKey: ["admin-verify-prices"], queryFn: () => list() });
  const { data: settingsData } = useQuery({ queryKey: ["public-settings"], queryFn: () => getSettings() });
  const { data: countriesData } = useQuery({ queryKey: ["verify-countries"], queryFn: () => getCountries() });

  const markup = Number(settingsData?.settings?.verify_markup ?? 1.5);
  const rate = Number(settingsData?.settings?.usd_to_ngn ?? 1600);

  function fmtNgn(usd: number) {
    return `₦${(usd * rate).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function ngnToUsd(ngn: number) { return ngn / rate; }

  const [editing, setEditing] = useState<Record<string, string>>({});
  const [newRow, setNewRow] = useState({ country: "", service: "", operator: "any", price_ngn: "" });
  const [serviceSearch, setServiceSearch] = useState("");

  const KNOWN_OPERATORS = ["any", "virtual", "virtual1", "virtual2", "virtual3", "virtual4", "virtual5", "virtual9", "virtual11", "virtual16", "virtual20", "beeline", "mts", "megafon", "tele2"];

  const saveMutation = useMutation({
    mutationFn: ({ id, service, operator, price_usd }: { id: string; service: string; operator: string; price_usd: number }) =>
      upsert({ data: { service, operator, price_usd } }),
    onSuccess: (_, vars) => {
      toast.success(`Saved ${vars.service} / ${vars.operator}`);
      setEditing((e) => { const n = { ...e }; delete n[vars.id]; return n; });
      qc.invalidateQueries({ queryKey: ["admin-verify-prices"] });
    },
    onError: (e: any) => toast.error(e?.message),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-verify-prices"] }),
    onError: (e: any) => toast.error(e?.message),
  });

  const addMutation = useMutation({
    mutationFn: () => {
      const price_usd = ngnToUsd(Number(newRow.price_ngn));
      const service = newRow.country
        ? `${newRow.country.toLowerCase()}_${newRow.service.toLowerCase().trim()}`
        : newRow.service.toLowerCase().trim();
      return upsert({ data: { service, operator: newRow.operator, price_usd } });
    },
    onSuccess: () => {
      toast.success("Saved");
      setNewRow({ country: "", service: "", operator: "any", price_ngn: "" });
      qc.invalidateQueries({ queryKey: ["admin-verify-prices"] });
    },
    onError: (e: any) => toast.error(e?.message),
  });

  const countryOptions = Array.isArray(countriesData)
    ? (countriesData as { name: string; iso: string }[])
    : [];

  const canAdd = newRow.service.trim() && newRow.price_ngn && Number(newRow.price_ngn) > 0;

  return (
    <div className="mt-4 space-y-4">
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">
          Set your price <strong>per service + per operator</strong>. If no operator-specific price is found, falls back to the <strong>any</strong> price, then to the global {markup}x markup.
          Enter prices in <strong>₦ Naira</strong> — stored in USD at ₦{rate}/$1.
        </p>
      </Card>

      {/* Add form */}
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Add / update price</h3>
        <div className="flex flex-wrap gap-3">
          {/* Country */}
          <div className="w-44">
            <Label>Country (optional)</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={newRow.country}
              onChange={(e) => setNewRow({ ...newRow, country: e.target.value })}
            >
              <option value="">— All countries —</option>
              {countryOptions.map((c) => (
                <option key={c.name} value={c.name}>{c.name.charAt(0).toUpperCase() + c.name.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Operator */}
          <div className="w-44">
            <Label>Operator</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={newRow.operator}
              onChange={(e) => setNewRow({ ...newRow, operator: e.target.value })}
            >
              {KNOWN_OPERATORS.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">"any" = fallback for all operators</p>
          </div>

          {/* Service */}
          <div className="flex-1 min-w-[130px]">
            <Label>Service</Label>
            <Input
              value={newRow.service}
              onChange={(e) => setNewRow({ ...newRow, service: e.target.value.toLowerCase() })}
              placeholder="e.g. whatsapp"
            />
          </div>

          {/* Price NGN */}
          <div className="w-40">
            <Label>Your price (₦)</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₦</span>
              <Input
                type="number" step="1" min="0"
                className="pl-7"
                value={newRow.price_ngn}
                onChange={(e) => setNewRow({ ...newRow, price_ngn: e.target.value })}
                placeholder="e.g. 800"
              />
            </div>
            {newRow.price_ngn && Number(newRow.price_ngn) > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">≈ ${ngnToUsd(Number(newRow.price_ngn)).toFixed(4)} USD</p>
            )}
          </div>

          <div className="flex items-end">
            <Button onClick={() => addMutation.mutate()} disabled={!canAdd || addMutation.isPending}>
              {addMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <h3 className="font-semibold flex-1">Custom prices</h3>
          <Input
            className="w-48"
            placeholder="Search service..."
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3">Service</th>
                <th className="p-3">Operator</th>
                <th className="p-3 text-right text-warning">Est. 5sim cost</th>
                <th className="p-3 text-right">Your price (₦)</th>
                <th className="p-3 text-right">Profit (₦)</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(priceData ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No custom prices yet. Add one above.
                  </td>
                </tr>
              )}
              {(priceData ?? [])
                .filter((p: any) => !serviceSearch || p.service.includes(serviceSearch.toLowerCase()))
                .map((p: any) => {
                  const yourPrice = Number(p.price_usd);
                  const estimatedCost = yourPrice / markup;
                  const profit = yourPrice - estimatedCost;
                  const isEditing = editing[p.id] !== undefined;
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-accent/30">
                      <td className="p-3 font-medium capitalize">{p.service.replace(/_/g, " › ")}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.operator === "any" ? "bg-secondary text-muted-foreground" : "bg-success/10 text-success"
                        }`}>{p.operator ?? "any"}</span>
                      </td>
                      <td className="p-3 text-right text-warning tabular-nums">~{fmtNgn(estimatedCost)}</td>
                      <td className="p-3 text-right tabular-nums">
                        {isEditing ? (
                          <div className="relative ml-auto w-32">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₦</span>
                            <Input
                              type="number" step="1" min="0"
                              className="pl-6 text-right w-full"
                              value={editing[p.id]}
                              onChange={(e) => setEditing({ ...editing, [p.id]: e.target.value })}
                            />
                          </div>
                        ) : (
                          <button className="hover:underline text-primary"
                            onClick={() => setEditing({ ...editing, [p.id]: String((yourPrice * rate).toFixed(0)) })}>
                            {fmtNgn(yourPrice)}
                          </button>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums text-success">+{fmtNgn(profit)}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          {isEditing && (
                            <Button size="sm" onClick={() =>
                              saveMutation.mutate({ id: p.id, service: p.service, operator: p.operator ?? "any", price_usd: ngnToUsd(Number(editing[p.id])) })
                            }>Save</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => delMutation.mutate(p.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 text-xs text-muted-foreground space-y-1">
        <p>⚡ <strong>Priority:</strong> country_service + operator → country_service + any → service + operator → service + any → global markup ({markup}x)</p>
        <p>✅ All prices in ₦ Naira. Stored as USD at ₦{rate}/$1.</p>
      </Card>
    </div>
  );
}function AdjustBtn({ onSubmit }: { onSubmit: (amt: number) => Promise<unknown> }) {
  return (
    <Button size="sm" variant="outline" onClick={() => {
      const s = window.prompt("Amount to credit (negative to debit), e.g. 10 or -5");
      if (!s) return;
      const n = Number(s);
      if (!Number.isFinite(n)) return toast.error("Invalid number");
      onSubmit(n).then(() => toast.success("Balance updated")).catch((e) => toast.error(e?.message ?? "Failed"));
    }}>Adjust balance</Button>
  );
}

function MessagesPanel() {
  const list = useServerFn(adminListMessages);
  const { data } = useQuery({ queryKey: ["admin-messages"], queryFn: () => list() });
  return (
    <Card className="mt-4 p-0">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="p-3">Date</th><th className="p-3">User</th><th className="p-3">Sender</th><th className="p-3">Recipient</th><th className="p-3">Cost</th><th className="p-3">Status</th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((m: any) => (
            <tr key={m.id} className="border-t border-border">
              <td className="p-3 whitespace-nowrap text-xs">{new Date(m.created_at).toLocaleString()}</td>
              <td className="p-3 text-xs">{m.user_email}</td>
              <td className="p-3">{m.sender}</td>
              <td className="p-3 font-mono text-xs">{m.recipient}</td>
              <td className="p-3 tabular-nums">${Number(m.cost_usd).toFixed(4)}</td>
              <td className="p-3">{m.status}</td>
            </tr>
          ))}
          {(data ?? []).length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No messages.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function BanksPanel() {
  const list = useServerFn(adminListBankAccounts);
  const upsert = useServerFn(adminUpsertBankAccount);
  const del = useServerFn(adminDeleteBankAccount);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-banks"], queryFn: () => list() });
  const empty = { label: "", bank_name: "", account_name: "", account_number: "", extra: "", active: true };
  const [form, setForm] = useState<any>(empty);
  const m = useMutation({
    mutationFn: () => upsert({ data: { ...form, extra: form.extra || null } }),
    onSuccess: () => { toast.success("Saved"); setForm(empty); qc.invalidateQueries({ queryKey: ["admin-banks"] }); qc.invalidateQueries({ queryKey: ["public-settings"] }); },
    onError: (e: any) => toast.error(e?.message),
  });
  const dm = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-banks"] }); qc.invalidateQueries({ queryKey: ["public-settings"] }); },
  });
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Add bank account</h3>
        <div><Label>Label (shown to users)</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="USD Wire — Primary" /></div>
        <div><Label>Bank name</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="Chase Bank" /></div>
        <div><Label>Account name</Label><Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="My Company LLC" /></div>
        <div><Label>Account number</Label><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} className="font-mono" /></div>
        <div><Label>Extra info (routing, IBAN, SWIFT, memo)</Label><Textarea rows={2} value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} /></div>
        <Button onClick={() => m.mutate()} disabled={!form.label || !form.bank_name || !form.account_name || !form.account_number || m.isPending}>Add</Button>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Existing accounts</h3>
        <ul className="space-y-2">
          {(data ?? []).map((b: any) => (
            <li key={b.id} className="flex items-start justify-between gap-2 rounded border border-border p-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{b.label} {!b.active && <span className="text-xs text-muted-foreground">(inactive)</span>}</div>
                <div className="text-xs text-muted-foreground">{b.bank_name} · {b.account_name}</div>
                <div className="break-all font-mono text-xs">{b.account_number}</div>
                {b.extra && <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{b.extra}</div>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => dm.mutate(b.id)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
          {(data ?? []).length === 0 && <li className="text-sm text-muted-foreground">None.</li>}
        </ul>
      </Card>
    </div>
  );
}
