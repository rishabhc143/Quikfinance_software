"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * ACCT-E.2 — Tiny search box for the CoA list. Pushes `?q=` to the
 * URL on debounced input so the server component re-fetches with
 * the filter applied. Live updates keep the user oriented but
 * don't fire a request per keystroke.
 */
export function CoaSearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [value, setValue] = React.useState(initial);

  React.useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(search?.toString() ?? "");
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("page");
      const qs = next.toString();
      const target = qs ? `${pathname}?${qs}` : pathname;
      router.push(target);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search accounts…"
        className="h-9 pl-8 w-64"
      />
    </div>
  );
}
