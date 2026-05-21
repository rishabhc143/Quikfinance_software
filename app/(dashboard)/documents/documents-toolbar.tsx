"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload,
  ChevronDown,
  MoreVertical,
  RefreshCw,
  Download,
  Link2,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * DOC-D1: Top toolbar for the Documents main pane. Mirrors Zoho's
 * layout:
 *   - Left: title (active view name)
 *   - Right: "Upload File" split-button (primary action + caret) and
 *     3-dot more-actions menu
 *
 * Split-button pattern lifted from
 * `app/(dashboard)/time/projects/projects-toolbar.tsx`. The Upload
 * File primary still links to the existing `/documents/new` form for
 * D1.1; PR D1.3 swaps in a drag-drop multi-file dialog.
 */
export function DocumentsToolbar({
  title,
}: {
  title: string;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between gap-2 px-6 py-3 border-b bg-background">
      <h2 className="text-base font-semibold">{title}</h2>

      <div className="flex items-center gap-2">
        {/* Upload File split-button — primary uploads, caret offers
            alternative entry points (URL paste today; D3 will add
            "Upload via Email"). */}
        <div className="inline-flex items-center">
          <Button asChild className="rounded-r-none">
            <Link href="/documents/new">
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Upload File
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="rounded-l-none border-l border-primary-foreground/30 px-2"
                aria-label="More upload options"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem asChild>
                <Link href="/documents/new">
                  <Upload className="h-3.5 w-3.5 mr-2" />
                  Upload File
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/documents/new#url">
                  <Link2 className="h-3.5 w-3.5 mr-2" />
                  Upload from URL
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled
                title="Inbox-by-email arrives in Phase D3"
                className="text-muted-foreground"
              >
                <Mail className="h-3.5 w-3.5 mr-2" />
                Upload via Email
                <span className="ml-auto text-[10px] uppercase tracking-wide">
                  Soon
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 3-dot more-actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="More actions"
              className="h-9 w-9"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem onSelect={() => router.refresh()}>
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Refresh List
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Upload className="h-3.5 w-3.5 mr-2" />
                Import
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  disabled
                  className="text-muted-foreground"
                  title="Bulk import arrives in PR D1.3"
                >
                  Import Documents
                  <span className="ml-auto text-[10px] uppercase tracking-wide">
                    Soon
                  </span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Download className="h-3.5 w-3.5 mr-2" />
                Export
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  disabled
                  className="text-muted-foreground"
                  title="Bulk export arrives in PR D1.3"
                >
                  Export Documents
                  <span className="ml-auto text-[10px] uppercase tracking-wide">
                    Soon
                  </span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
