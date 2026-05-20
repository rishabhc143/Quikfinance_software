import Link from "next/link";
import { X } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { currencySymbol } from "@/lib/money";
import { NewProjectForm } from "./form";

export const metadata = { title: "New Project" };

export default async function NewProjectPage() {
  const { user, organization } = await requireOrganization();

  const [customers, memberships] = await Promise.all([
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        type: { in: ["CUSTOMER", "BOTH"] },
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    db.organizationMembership.findMany({
      where: { organizationId: organization.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const members = memberships
    .map((m) => ({
      id: m.user.id,
      name: m.user.name ?? m.user.email.split("@")[0],
      email: m.user.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const currentUser = {
    id: user.id,
    name: user.name ?? user.email.split("@")[0],
    email: user.email,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Modal-style header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">New Project</h1>
          <Link
            href="/time/projects"
            aria-label="Close"
            className="rounded-md p-1.5 hover:bg-muted text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto">
        <NewProjectForm
          customers={customers}
          members={members}
          currentUser={currentUser}
          currencySymbol={currencySymbol(organization.currency)}
        />
      </div>
    </div>
  );
}
