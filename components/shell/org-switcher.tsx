"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus, Check, Building2 } from "lucide-react";
import type { Organization, OrganizationMembership } from "@prisma/client";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { switchOrganization } from "@/app/(dashboard)/organizations/switch/actions";

type Props = {
  activeOrgId: string;
  memberships: (OrganizationMembership & { organization: Organization })[];
};

export function OrgSwitcher({ activeOrgId, memberships }: Props) {
  const router = useRouter();
  const active = memberships.find((m) => m.organizationId === activeOrgId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[200px]">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{active?.organization.name ?? "Select org"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 ml-auto opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.organizationId}
            onSelect={async () => {
              await switchOrganization(m.organizationId);
              router.refresh();
            }}
            className="flex items-center gap-2"
          >
            <span className="flex-1 truncate">{m.organization.name}</span>
            {m.organizationId === activeOrgId && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/organizations/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Create new organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
