import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SettingsShell({
  title, description, children,
}: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/settings"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="min-w-0">
          <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
            <Link href="/settings" className="hover:underline">Settings</Link>
            <span className="mx-1">/</span>
            <span>{title}</span>
          </nav>
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <SettingsShell title={title} description={description}>
      <div className="rounded-lg border bg-background p-12 text-center">
        <p className="text-sm text-muted-foreground">Coming soon — your data is preserved.</p>
        <p className="text-xs text-muted-foreground mt-2">
          The schema for this section is already in place; the form and data view ship with Phase 4.
        </p>
      </div>
    </SettingsShell>
  );
}
