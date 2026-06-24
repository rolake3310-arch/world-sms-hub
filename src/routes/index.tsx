import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MessageSquare, Globe2, Zap, Shield, Wallet, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pulse SMS — Send SMS to any country" },
      { name: "description", content: "Pay-as-you-go global SMS. Fund with crypto or card. Send to any country instantly." },
      { property: "og:title", content: "Pulse SMS — Global SMS gateway" },
      { property: "og:description", content: "Pay-as-you-go global SMS. Fund with crypto or card." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-brand shadow-glow">
            <MessageSquare className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">Pulse SMS</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
          <Button asChild><Link to="/auth">Get started</Link></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-24 text-center">
        <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Global SMS network · pay as you go
        </div>
        <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
          Send SMS to <span className="text-gradient-brand">any country</span>,
          <br />in seconds.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Top up your wallet with crypto or card, write your message, hit send.
          One platform for transactional and promotional SMS worldwide.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="shadow-glow"><Link to="/auth">Create free account</Link></Button>
          <Button asChild variant="outline" size="lg"><Link to="/auth">Sign in</Link></Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { i: Globe2, t: "200+ countries", d: "Reach mobile users on every continent via our carrier network." },
            { i: Zap, t: "Instant delivery", d: "Messages dispatched the moment you hit send. Live status tracking." },
            { i: Wallet, t: "Crypto or card", d: "Top up in seconds with BTC, USDT, or pay by card through Squad." },
            { i: BarChart3, t: "Transparent pricing", d: "Per-country pricing previewed live before you send. No surprises." },
            { i: Shield, t: "Wallet-based", d: "No subscriptions. Your balance is yours — use it whenever." },
            { i: MessageSquare, t: "Bulk or single", d: "Paste thousands of numbers or send one — same workflow." },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                <f.i className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-24">
        <div className="overflow-hidden rounded-3xl bg-gradient-brand p-10 text-center text-white shadow-glow">
          <h2 className="text-3xl font-bold">Ready to start?</h2>
          <p className="mx-auto mt-2 max-w-md text-white/80">Create an account, fund your wallet, send your first SMS in under a minute.</p>
          <Button asChild size="lg" variant="secondary" className="mt-6">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Pulse SMS
      </footer>
    </div>
  );
}
