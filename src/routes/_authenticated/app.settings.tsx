import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMyProfile } from "@/lib/sms.functions";
import { supabase } from "@/integrations/supabase/client";
import { User, Lock } from "lucide-react";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Account Settings" }] }),
  component: SettingsPage,
});

// Server function to update profile name
const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ full_name: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.full_name })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function SettingsPage() {
  const fetchProfile = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateProfile);
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });

  const [name, setName] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  // Pre-fill name once loaded
  useState(() => {
    if (me?.profile?.full_name) setName(me.profile.full_name);
  });

  const nameMutation = useMutation({
    mutationFn: () => updateFn({ data: { full_name: name } }),
    onSuccess: () => {
      toast.success("Name updated");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const pwMutation = useMutation({
    mutationFn: async () => {
      if (newPw !== confirmPw) throw new Error("Passwords don't match");
      if (newPw.length < 6) throw new Error("Password must be at least 6 characters");
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Account Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and security settings.</p>
      </div>

      {/* Profile info */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Profile</h3>
        </div>
        <div>
          <Label>Email</Label>
          <Input value={me?.profile?.email ?? ""} disabled className="bg-secondary text-muted-foreground" />
          <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed.</p>
        </div>
        <div>
          <Label>Full name</Label>
          <Input
            value={name || me?.profile?.full_name || ""}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
          />
        </div>
        <Button
          onClick={() => nameMutation.mutate()}
          disabled={nameMutation.isPending || !name.trim()}
        >
          {nameMutation.isPending ? "Saving..." : "Save name"}
        </Button>
      </Card>

      {/* Change password */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Change password</h3>
        </div>
        <div>
          <Label>New password</Label>
          <Input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="Min. 6 characters"
          />
        </div>
        <div>
          <Label>Confirm new password</Label>
          <Input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="Re-enter new password"
          />
        </div>
        <Button
          onClick={() => pwMutation.mutate()}
          disabled={pwMutation.isPending || !newPw || !confirmPw}
        >
          {pwMutation.isPending ? "Changing..." : "Change password"}
        </Button>
      </Card>
    </div>
  );
}
