import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { quoteSms, sendSms, getMyProfile } from "@/lib/sms.functions";
import { splitRecipients } from "@/lib/phone-utils";
import { Send } from "lucide-react";
import { useCurrency } from "@/lib/currency";

export const Route = createFileRoute("/_authenticated/app/send")({
  component: SendPage,
});

function SendPage() {
  const [sender, setSender] = useState("Pulse");
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [message, setMessage] = useState("");
  const qc = useQueryClient();
  const recipients = useMemo(() => splitRecipients(recipientsRaw), [recipientsRaw]);
  const { fmt } = useCurrency();

  const quoteFn = useServerFn(quoteSms);
  const sendFn = useServerFn(sendSms);
  const getMe = useServerFn(getMyProfile);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMe() });

  const { data: quote } = useQuery({
    queryKey: ["quote", recipients.join(","), message],
    queryFn: () => quoteFn({ data: { recipients, message } }),
    enabled: recipients.length > 0 && message.length > 0,
  });

  const mutation = useMutation({
    mutationFn: (vars: { sender: string; recipients: string[]; message: string }) =>
      sendFn({ data: vars }),
    onSuccess: (r) => {
      toast.success(`Sent ${r.sent} message(s) for ${fmt(r.total)}`);
      setRecipientsRaw("");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["my-msgs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send"),
  });

  const balance = Number(me?.profile?.balance_usd ?? 0);
  const insufficient = quote && quote.total > balance;

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Send SMS</h1>
        <p className="text-sm text-muted-foreground">Reach any country instantly.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="space-y-4 p-5">
          <div>
            <Label htmlFor="sender">Sender ID</Label>
            <Input id="sender" maxLength={11} value={sender} onChange={(e) => setSender(e.target.value)} placeholder="Brand name or number" />
            <p className="mt-1 text-xs text-muted-foreground">Max 11 alphanumeric characters.</p>
          </div>

          <div>
            <Label htmlFor="recipients">Recipients</Label>
            <Textarea
              id="recipients"
              rows={5}
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              placeholder="+14155551234, +442071838750, +2348012345678"
              className="font-mono text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {recipients.length} recipient{recipients.length === 1 ? "" : "s"} — separate with commas, spaces, or new lines. Include country code.
            </p>
          </div>

          <div>
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Your message..." />
            <p className="mt-1 text-xs text-muted-foreground">
              {quote ? `${quote.chars} chars · ${quote.segments} segment${quote.segments === 1 ? "" : "s"} · ${quote.encoding.toUpperCase()}` : `${message.length} chars`}
            </p>
          </div>

          <Button
            size="lg"
            className="w-full"
            disabled={!quote || quote.lines.filter((l) => l.valid).length === 0 || mutation.isPending || !!insufficient || !sender.trim()}
            onClick={() => mutation.mutate({ sender, recipients, message })}
          >
            <Send className="mr-2 h-4 w-4" />
            {mutation.isPending ? "Sending..." : insufficient ? "Insufficient balance" : `Send for ${fmt(quote?.total ?? 0)}`}
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">Cost preview</h3>
          <div className="rounded-lg bg-secondary p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Total</div>
            <div className="text-2xl font-bold tabular-nums">{fmt(quote?.total ?? 0)}</div>
            <div className="text-xs text-muted-foreground">Balance: {fmt(balance)}</div>
          </div>
          {quote && (
            <div className="max-h-72 overflow-y-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary text-left">
                  <tr><th className="p-2">Recipient</th><th className="p-2">Country</th><th className="p-2 text-right">Cost</th></tr>
                </thead>
                <tbody>
                  {quote.lines.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2 font-mono">{l.e164 ?? l.raw}</td>
                      <td className="p-2">{l.country ?? (l.valid ? "?" : <span className="text-destructive">{l.error}</span>)}</td>
                      <td className="p-2 text-right tabular-nums">{fmt(l.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
