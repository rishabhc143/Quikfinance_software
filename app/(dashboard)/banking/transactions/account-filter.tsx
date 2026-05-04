"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function AccountFilter({ current, accounts }: { current: string; accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  return (
    <select
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set("account", e.target.value);
        else next.delete("account");
        next.delete("page");
        router.push(`${pathname}?${next.toString()}`);
      }}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
    >
      <option value="">All accounts</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}
