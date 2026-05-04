import Link from "next/link";
import { Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ModuleStub({
  title, description, ctaLabel, ctaHref,
}: { title: string; description: string; ctaLabel?: string; ctaHref?: string }) {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-muted-foreground space-y-3">
          <Construction className="h-10 w-10 mx-auto opacity-50" />
          <p>This module is scaffolded — schema is in place, route is live, list/create UI ships in Phase 4.</p>
          <p className="text-xs">Your data and integrations are preserved; nothing here will be lost as features fill in.</p>
          {ctaLabel && ctaHref && (
            <Button asChild variant="outline"><Link href={ctaHref}>{ctaLabel}</Link></Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
