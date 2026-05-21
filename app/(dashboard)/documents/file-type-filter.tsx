"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  FILE_TYPE_BUCKETS,
  labelForFileType,
  parseFileTypeParam,
} from "@/lib/documents/file-type";

/**
 * DOC-D1: "Filter By: File Type: All ▾" pill that lives in the Documents
 * filter strip just above the table. Writes `?fileType=<bucket>` (or
 * removes it for "All") and refreshes the server-rendered table.
 *
 * Mirrors the pill pattern used by `<ReportBasisDropdown>` so the look
 * is consistent with the rest of the app.
 */
export function FileTypeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = parseFileTypeParam(searchParams.get("fileType"));
  const activeLabel = current ? labelForFileType(current) : "All";

  function pick(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.delete("fileType");
    } else {
      params.set("fileType", next);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">Filter By :</span>
      <span className="font-medium">File Type:</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center gap-1 text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          {activeLabel}
          <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[150px]">
          <DropdownMenuRadioGroup
            value={current ?? "all"}
            onValueChange={pick}
          >
            <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
            {FILE_TYPE_BUCKETS.map((b) => (
              <DropdownMenuRadioItem key={b} value={b}>
                {labelForFileType(b)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
