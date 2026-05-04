"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";

type Notif = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
};

export function Notifications({ children, organizationId }: { children: React.ReactNode; organizationId: string }) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Notif[]>([]);

  React.useEffect(() => {
    if (!open) return;
    fetch(`/api/notifications?org=${organizationId}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setItems)
      .catch(() => setItems([]));
  }, [open, organizationId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <div className="font-semibold text-sm">Notifications</div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id} className="px-4 py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span><strong>{n.action.toLowerCase()}</strong> {n.entityType.toLowerCase()}</span>
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
