"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, MailIcon, Clock } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@prisma/client";
import {
  inviteUserAction,
  changeRoleAction,
  removeMemberAction,
  resendInvitationAction,
  cancelInvitationAction,
} from "./actions";
import { toast } from "sonner";

type Member = {
  id: string;
  userId: string;
  role: Role;
  isMe: boolean;
  name: string | null;
  email: string;
  image: string | null;
};

type PendingInvite = {
  id: string;
  email: string;
  role: Role;
  invitedAt: string;
};

const ROLES: Role[] = ["ADMIN", "STAFF", "ACCOUNTANT", "VIEWER"];

export function UsersManager({
  members,
  pending,
}: {
  members: Member[];
  currentUserId: string;
  pending: PendingInvite[];
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("STAFF");
  const [busy, setBusy] = React.useState(false);
  const [pendingActions, setPendingActions] = React.useState<
    Record<string, "resend" | "cancel" | undefined>
  >({});

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await inviteUserAction({ email: email.trim(), role });
      if (r.invited) toast.success(`Invitation sent to ${email}`);
      else toast.success(`${email} added to organization`);
      setEmail("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(membershipId: string, next: Role) {
    try {
      await changeRoleAction(membershipId, next);
      toast.success("Role updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function remove(membershipId: string) {
    if (!confirm("Remove this member from the organization?")) return;
    try {
      await removeMemberAction(membershipId);
      toast.success("Member removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  }

  async function resend(membershipId: string, email: string) {
    setPendingActions((p) => ({ ...p, [membershipId]: "resend" }));
    try {
      await resendInvitationAction(membershipId);
      toast.success(`Invitation re-sent to ${email}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setPendingActions((p) => {
        const next = { ...p };
        delete next[membershipId];
        return next;
      });
    }
  }

  async function cancel(membershipId: string, email: string) {
    if (!confirm(`Cancel the invitation for ${email}?`)) return;
    setPendingActions((p) => ({ ...p, [membershipId]: "cancel" }));
    try {
      await cancelInvitationAction(membershipId);
      toast.success("Invitation cancelled");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setPendingActions((p) => {
        const next = { ...p };
        delete next[membershipId];
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Invite form ────────────────────────────────────── */}
      <form onSubmit={invite} className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <Label htmlFor="invite-email">Invite by email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            required
          />
          <p className="text-xs text-muted-foreground mt-1">
            If they already have a Quikfinance account, they&apos;re
            added immediately. Otherwise we email an invitation.
          </p>
        </div>
        <div>
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {prettyRole(r)}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3 flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Send invitation
          </Button>
        </div>
      </form>

      {/* ── Pending invitations ────────────────────────────── */}
      {pending.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">
              Pending invitations
            </h3>
            <Badge variant="outline" className="text-xs">
              {pending.length}
            </Badge>
          </div>
          <div className="rounded-md border divide-y bg-muted/20">
            {pending.map((p) => {
              const initials = p.email
                .split("@")[0]
                .slice(0, 2)
                .toUpperCase();
              const action = pendingActions[p.id];
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 text-sm"
                >
                  <Avatar className="h-9 w-9 opacity-60">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {p.email}
                      <Badge
                        variant="outline"
                        className="text-xs gap-1"
                      >
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Invited{" "}
                      {timeAgo(p.invitedAt)} · {prettyRole(p.role)}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resend(p.id, p.email)}
                    disabled={action !== undefined}
                  >
                    {action === "resend" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MailIcon className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1.5">Resend</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancel(p.id, p.email)}
                    disabled={action !== undefined}
                    title="Cancel invitation"
                  >
                    {action === "cancel" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Active members ────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">
          {pending.length > 0 ? "Active members" : "Members"}
        </h3>
        <div className="rounded-md border divide-y">
          {members.map((m) => {
            const initials = (m.name ?? m.email)
              .split(" ")
              .map((s) => s[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 p-3 text-sm"
              >
                <Avatar className="h-9 w-9">
                  {m.image && (
                    <AvatarImage src={m.image} alt={m.name ?? m.email} />
                  )}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {m.name ?? m.email}
                    {m.isMe && <Badge variant="outline">You</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {m.email}
                  </div>
                </div>
                <select
                  value={m.role}
                  disabled={m.isMe && m.role === "ADMIN"}
                  onChange={(e) => changeRole(m.id, e.target.value as Role)}
                  className="h-8 rounded border border-input bg-background px-2 text-xs"
                  title={
                    m.isMe ? "You cannot demote yourself" : undefined
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {prettyRole(r)}
                    </option>
                  ))}
                </select>
                {!m.isMe && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(m.id)}
                    title="Remove from organization"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function prettyRole(r: Role): string {
  return r.charAt(0) + r.slice(1).toLowerCase();
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}
