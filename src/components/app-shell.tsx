import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutDashboard, Send, Wallet, History, Shield, LogOut, MessageSquare, Smartphone } from "lucide-react";
import { getMyProfile } from "@/lib/sms.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppShell() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = [
    { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/app/send", label: "Send SMS", icon: Send },
    { to: "/app/verify", label: "SMS Verify", icon: Smartphone },
    { to: "/app/fund", label: "Fund Wallet", icon: Wallet },
    { to: "/app/history", label: "History", icon: History },
  ];

  return (
    <div className="min-h-screen bg-gradient-surface">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-sidebar p-4 md:flex md:flex-col">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand shadow-glow">
            <MessageSquare className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">Pulse SMS</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
          {data?.isAdmin && (
            <>
              <div className="mt-4 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Admin</div>
              <NavItem to="/app/admin" label="Admin Panel" icon={Shield} />
            </>
          )}
        </nav>
        <div className="mt-4 rounded-xl border border-border bg-card p-3 shadow-soft">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Balance</div>
          <div className="text-xl font-bold tabular-nums">
            ${Number(data?.profile?.balance_usd ?? 0).toFixed(2)}
          </div>
          <Link to="/app/fund" className="text-xs text-primary hover:underline">+ Add funds</Link>
        </div>
        <Button variant="ghost" className="mt-3 justify-start" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </aside>

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
        <Link to="/app" className="flex items-center gap-2 font-bold">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-brand">
            <MessageSquare className="h-3.5 w-3.5 text-white" />
          </div>
          Pulse SMS
        </Link>
        <div className="text-sm font-semibold tabular-nums">
          ${Number(data?.profile?.balance_usd ?? 0).toFixed(2)}
        </div>
      </header>

      <main className="md:pl-64">
        <div className="mx-auto max-w-6xl p-4 md:p-8">
          <Outlet />
        </div>
        <MobileTabs isAdmin={!!data?.isAdmin} />
      </main>
    </div>
  );
}

function NavItem({ to, label, icon: Icon, exact }: { to: string; label: string; icon: any; exact?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-soft"
          : "text-sidebar-foreground hover:bg-sidebar-accent",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function MobileTabs({ isAdmin }: { isAdmin: boolean }) {
  const items = [
    { to: "/app", label: "Home", icon: LayoutDashboard, exact: true },
    { to: "/app/send", label: "Send", icon: Send },
    { to: "/app/verify", label: "Verify", icon: Smartphone },
    { to: "/app/fund", label: "Fund", icon: Wallet },
    { to: "/app/history", label: "History", icon: History },
    ...(isAdmin ? [{ to: "/app/admin", label: "Admin", icon: Shield }] : []),
  ];
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-background/90 backdrop-blur md:hidden">
      {items.map((i) => {
        const active = i.exact ? pathname === i.to : pathname === i.to || pathname.startsWith(i.to + "/");
        return (
          <Link key={i.to} to={i.to} className={cn(
            "flex flex-col items-center gap-1 py-2 text-[10px]",
            active ? "text-primary" : "text-muted-foreground",
          )}>
            <i.icon className="h-4 w-4" />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
