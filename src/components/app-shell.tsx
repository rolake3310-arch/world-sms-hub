import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { LayoutDashboard, Send, Wallet, History, Shield, LogOut, MessageSquare, Smartphone, Settings, Menu, X } from "lucide-react";
import { getMyProfile } from "@/lib/sms.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";

const NAV_ITEMS = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/send", label: "Send SMS", icon: Send },
  { to: "/app/verify", label: "SMS Verify", icon: Smartphone },
  { to: "/app/fund", label: "Fund Wallet", icon: Wallet },
  { to: "/app/history", label: "History", icon: History },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const { fmt } = useCurrency();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const balance = Number(data?.profile?.balance_usd ?? 0);

  return (
    <div className="min-h-screen bg-gradient-surface">
      {/* Desktop sidebar — always visible */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-sidebar p-4 md:flex md:flex-col">
        <SidebarContent
          balance={balance}
          fmt={fmt}
          isAdmin={!!data?.isAdmin}
          onSignOut={signOut}
        />
      </aside>

      {/* Mobile top bar with hamburger */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
        <button onClick={() => setMobileNavOpen(true)} className="rounded-lg p-1.5 hover:bg-accent" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/app" className="flex items-center gap-2 font-bold">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-brand">
            <MessageSquare className="h-3.5 w-3.5 text-white" />
          </div>
          Pulse SMS
        </Link>
        <Link to="/app/fund" className="text-sm font-semibold tabular-nums text-primary">
          {fmt(balance)}
        </Link>
      </header>

      {/* Mobile slide-out sidebar */}
      {mobileNavOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar p-4 shadow-xl md:hidden">
            <div className="mb-6 flex items-center justify-between px-2">
              <Link to="/" className="flex items-center gap-2" onClick={() => setMobileNavOpen(false)}>
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand shadow-glow">
                  <MessageSquare className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold tracking-tight">Pulse SMS</span>
              </Link>
              <button onClick={() => setMobileNavOpen(false)} className="rounded-lg p-1.5 hover:bg-sidebar-accent" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent
              balance={balance}
              fmt={fmt}
              isAdmin={!!data?.isAdmin}
              onSignOut={signOut}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </aside>
        </>
      )}

      <main className="md:pl-64">
        <div className="mx-auto max-w-6xl p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function SidebarContent({
  balance, fmt, isAdmin, onSignOut, onNavigate,
}: {
  balance: number;
  fmt: (n: number) => string;
  isAdmin: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <Link to="/" className="mb-8 hidden items-center gap-2 px-2 md:flex">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand shadow-glow">
          <MessageSquare className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight">Pulse SMS</span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} onNavigate={onNavigate} />
        ))}
        {isAdmin && (
          <>
            <div className="mt-4 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Admin</div>
            <NavItem to="/app/admin" label="Admin Panel" icon={Shield} onNavigate={onNavigate} />
          </>
        )}
      </nav>
      <div className="mt-4 rounded-xl border border-border bg-card p-3 shadow-soft">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Balance</div>
        <div className="text-xl font-bold tabular-nums">{fmt(balance)}</div>
        <Link to="/app/fund" onClick={onNavigate} className="text-xs text-primary hover:underline">+ Add funds</Link>
      </div>
      <Button variant="ghost" className="mt-3 justify-start" onClick={onSignOut}>
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </>
  );
}

function NavItem({ to, label, icon: Icon, exact, onNavigate }: { to: string; label: string; icon: any; exact?: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
  return (
    <Link to={to} onClick={onNavigate} className={cn(
      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground shadow-soft" : "text-sidebar-foreground hover:bg-sidebar-accent",
    )}>
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}
