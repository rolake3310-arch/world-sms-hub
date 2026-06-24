import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMyMessages } from "@/lib/sms.functions";
import { getMyDeposits } from "@/lib/funding.functions";

export const Route = createFileRoute("/_authenticated/app/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const getMsgs = useServerFn(getMyMessages);
  const getDeps = useServerFn(getMyDeposits);
  const { data: msgs } = useQuery({ queryKey: ["my-msgs"], queryFn: () => getMsgs() });
  const { data: deps } = useQuery({ queryKey: ["my-deps"], queryFn: () => getDeps() });

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">History</h1>
      <Tabs defaultValue="messages">
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="deposits">Deposits</TabsTrigger>
        </TabsList>
        <TabsContent value="messages">
          <Card className="mt-4 overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="p-3">Date</th><th className="p-3">Sender</th><th className="p-3">Recipient</th><th className="p-3">Message</th><th className="p-3 text-right">Cost</th><th className="p-3">Status</th></tr>
              </thead>
              <tbody>
                {(msgs ?? []).length === 0 && (<tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No messages yet.</td></tr>)}
                {(msgs ?? []).map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-3 whitespace-nowrap text-xs">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="p-3">{m.sender}</td>
                    <td className="p-3 font-mono text-xs">{m.recipient}</td>
                    <td className="p-3 max-w-xs truncate">{m.message}</td>
                    <td className="p-3 text-right tabular-nums">${Number(m.cost_usd).toFixed(4)}</td>
                    <td className="p-3"><Badge status={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
        <TabsContent value="deposits">
          <Card className="mt-4 overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="p-3">Date</th><th className="p-3">Method</th><th className="p-3">Amount</th><th className="p-3">Reference</th><th className="p-3">Status</th></tr>
              </thead>
              <tbody>
                {(deps ?? []).length === 0 && (<tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No deposits.</td></tr>)}
                {(deps ?? []).map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="p-3 whitespace-nowrap text-xs">{new Date(d.created_at).toLocaleString()}</td>
                    <td className="p-3 capitalize">{d.method}</td>
                    <td className="p-3 tabular-nums">${Number(d.amount_usd).toFixed(2)}</td>
                    <td className="p-3 font-mono text-xs">{d.tx_reference}</td>
                    <td className="p-3"><Badge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "bg-success/10 text-success",
    failed: "bg-destructive/10 text-destructive",
    queued: "bg-warning/10 text-warning",
    approved: "bg-success/10 text-success",
    pending: "bg-warning/10 text-warning",
    rejected: "bg-destructive/10 text-destructive",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[status] ?? "bg-secondary"}`}>{status}</span>;
}
