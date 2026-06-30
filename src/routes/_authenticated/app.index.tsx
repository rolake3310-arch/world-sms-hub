import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, getMyMessages, getPublicSettings } from "@/lib/sms.functions";
import { getMyDeposits } from "@/lib/funding.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Wallet, MessageSquare, TrendingUp, X, Smartphone } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function TelegramPopup({ settings }: { settings: any }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (settings?.telegram_popup_enabled) {
      // Show every refresh after a short delay
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, [settings?.telegram_popup_enabled]);

  if (!visible || !settings?.telegram_popup_enabled) return null;

  const title = settings.telegram_popup_title || "Join Our Telegram!";
  const subtitle = settings.telegram_popup_subtitle || "Official channel · Free activation keys";
  const body = settings.telegram_popup_body || "Stay updated and get free activation keys by joining our Telegram channel 🎁";
  const url = settings.telegram_url || "https://t.me/";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="relative w-full max-w-sm rounded-2xl bg-background shadow-xl overflow-hidden">
        {/* Header gradient */}
        <div className="bg-[#2AABEE] px-6 pt-6 pb-8 text-white text-center">
          <button
            onClick={() => setVisible(false)}
            className="absolute right-4 top-4 text-white/70 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
          {/* Telegram logo */}
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-0.5 text-sm text-white/80">{subtitle}</p>
        </div>

        {/* Body */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-center text-sm text-muted-foreground">{body}</p>

          {/* Feature pills */}
          <div className="mt-4 flex justify-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium">🔑 Free Keys</span>
            <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium">📢 Updates</span>
            <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium">💬 Support</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 px-6 pb-6 pt-4">
          <Button
            className="w-full bg-[#2AABEE] hover:bg-[#229ED9] text-white font-semibold"
            onClick={() => { window.open(url, "_blank"); setVisible(false); }}
          >
            Join Channel
          </Button>
          <button
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1"
            onClick={() => setVisible(false)}
          >
            No thanks, close
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const fetchProfile = useServerFn(getMyProfile);
  const fetchMsgs = useServerFn(getMyMessages);
  const fetchDeps = useServerFn(getMyDeposits);
  const fetchSettings = useServerFn(getPublicSettings);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const { data: msgs } = useQuery({ queryKey: ["my-msgs"], queryFn: () => fetchMsgs() });
  const { data: deps } = useQuery({ queryKey: ["my-deps"], queryFn: () => fetchDeps() });
  const { data: settingsData } = useQuery({ queryKey: ["public-settings"], queryFn: () => fetchSettings() });
  const { fmt } = useCurrency();

  const sent = (msgs ?? []).filter((m) => m.status === "sent").length;
  const spent = (msgs ?? []).reduce((s, m) => s + Number(m.cost_usd), 0);
  const balance = Number(me?.profile?.balance_usd ?? 0);

  return (
    <div className="space-y-6 space-y-6">
      <TelegramPopup settings={settingsData?.settings} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Welcome back</h1>
        <p className="text-sm text-muted-foreground">{me?.profile?.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Wallet Balance" value={fmt(balance)} icon={Wallet} accent />
        <StatCard label="Messages Sent" value={String(sent)} icon={MessageSquare} />
        <StatCard label="Total Spent" value={fmt(spent)} icon={TrendingUp} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-hidden border-0 bg-gradient-brand p-6 text-white shadow-glow">
          <div className="flex h-full flex-col justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Send a message anywhere</h2>
              <p className="mt-1 text-sm text-white/80">Reach any country worldwide via our global SMS network.</p>
            </div>
            <Button asChild size="lg" variant="secondary" className="w-fit">
              <Link to="/app/send"><Send className="mr-2 h-4 w-4" /> Compose SMS</Link>
            </Button>
          </div>
        </Card>

        <Card className="overflow-hidden border-0 bg-secondary p-6 shadow-soft">
          <div className="flex h-full flex-col justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">SMS Verification</h2>
              <p className="mt-1 text-sm text-muted-foreground">Rent a number and receive your one-time code instantly.</p>
            </div>
            <Button asChild size="lg" className="w-fit">
              <Link to="/app/verify"><Smartphone className="mr-2 h-4 w-4" /> Get a Number</Link>
            </Button>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Recent messages</h3>
            <Link to="/app/history" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {(msgs ?? []).slice(0, 5).length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(msgs ?? []).slice(0, 5).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium tabular-nums">{m.recipient}</div>
                    <div className="truncate text-xs text-muted-foreground">{m.message}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.status === "sent" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {m.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Recent deposits</h3>
            <Link to="/app/fund" className="text-xs text-primary hover:underline">Add funds</Link>
          </div>
          {(deps ?? []).slice(0, 5).length === 0 ? (
            <p className="text-sm text-muted-foreground">No deposits yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(deps ?? []).slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{fmt(Number(d.amount_usd))} <span className="text-xs text-muted-foreground">via {d.method}</span></div>
                    <div className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</div>
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
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent?: boolean }) {
  return (
    <Card className={`p-5 ${accent ? "border-primary/30 shadow-glow" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-lg ${accent ? "bg-gradient-brand text-white" : "bg-secondary text-foreground"}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
