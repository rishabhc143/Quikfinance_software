import Link from "next/link";
import { X, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { currencySymbol } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { NewProjectForm } from "./form";

export const metadata = { title: "New Project" };

// Belt-and-suspenders: defeat any CDN caching of an error response so
// the next request always re-runs the server logic.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type FormProps = React.ComponentProps<typeof NewProjectForm>;

/**
 * Loads everything the New Project form needs in one place. Wrapped
 * in its own helper so we can try/catch the whole thing in the page
 * and surface a captured-error path to Vercel logs instead of an
 * opaque 500.
 */
async function loadFormProps(): Promise<FormProps> {
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

  // Defensive map — skip any orphaned memberships whose user is null
  // (FK should prevent it, but production data can be weird).
  const members = memberships
    .filter((m) => m.user != null)
    .map((m) => ({
      id: m.user.id,
      name:
        m.user.name?.trim() ||
        (m.user.email ? m.user.email.split("@")[0] : "Member"),
      email: m.user.email ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const currentUser = {
    id: user.id,
    name:
      user.name?.trim() ||
      (user.email ? user.email.split("@")[0] : "You"),
    email: user.email ?? "",
  };

  return {
    customers,
    members,
    currentUser,
    currencySymbol: currencySymbol(organization.currency),
  };
}

export default async function NewProjectPage() {
  let formProps: FormProps;
  try {
    formProps = await loadFormProps();
  } catch (err) {
    // Surface the real error to Vercel runtime logs. The user sees a
    // degraded but functional shell instead of the generic 500.
    console.error(
      "[time/projects/new] loadFormProps failed:",
      err instanceof Error
        ? `${err.name}: ${err.message}\n${err.stack ?? "(no stack)"}`
        : String(err)
    );
    return <DegradedShell />;
  }

  return (
    <div className="min-h-screen bg-background">
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
        <NewProjectForm {...formProps} />
      </div>
    </div>
  );
}

function DegradedShell() {
  return (
    <div className="min-h-screen bg-background">
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
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-6 flex items-start gap-4">
          <AlertTriangle className="h-6 w-6 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-3">
            <h2 className="text-base font-semibold text-amber-900 dark:text-amber-100">
              We couldn&apos;t prepare the New Project form
            </h2>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Something went wrong while loading the customer / user data this
              form needs. The team has been notified. Please try refreshing in
              a moment, or use one of the alternatives below.
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/time/projects">Back to Projects</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/sales/customers/new">Create a Customer</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
