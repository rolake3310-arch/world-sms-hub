import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, getMyMessages } from "@/lib/sms.functions";
import { getMyDeposits } from "@/lib/funding.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Wallet, MessageSquare, TrendingUp } from "lucide-react";
import { useCurrency } from "@/lib/currency";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function Dashboard() {
  const fetchProfile = useServerFn(getMyProfile);
  const fetchMsgs = useServerFn(getMyMessages);
  const fetchDeps = useServerFn(getMyDeposits);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const { data: msgs } = useQuery({ queryKey: ["my-msgs"], queryFn: () => fetchMsgs() });
  const { data: deps } = useQuery({ queryKey: ["my-deps"], queryFn: () => fetchDeps() });
  const { fmt } = useCurrency();

  const sent = (msgs ?? []).filter((m) => m.status === "sent").length;
  const spent = (msgs ?? []).reduce((s, m) => s + Number(m.cost_usd), 0);
  const balance = Number(me?.profile?.balance_usd ?? 0);

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Welcome back</h1>
        <p className="text-sm text-muted-foreground">{me?.profile?.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Wallet Balance" value={fmt(balance)} icon={Wallet} accent />
        <StatCard label="Messages Sent" value={String(sent)} icon={MessageSquare} />
        <StatCard label="Total Spent" value={fmt(spent)} icon={TrendingUp} />
      </div>

      <Card className="overflow-hidden border-0 bg-gradient-brand p-6 text-white shadow-glow">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Send a message anywhere</h2>
            <p className="mt-1 text-sm text-white/80">Reach any country worldwide via our global SMS network.</p>
          </div>
          <Button asChild size="lg" variant="secondary">
            <Link to="/app/send"><Send className="mr-2 h-4 w-4" /> Compose SMS</Link>
          </Button>
        </div>
      </Card>

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
