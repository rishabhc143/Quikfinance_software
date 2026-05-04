import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="rounded-lg border bg-background p-12 text-center space-y-3 max-w-md">
        <Search className="h-10 w-10 mx-auto opacity-50" />
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Button asChild><Link href="/">Back to dashboard</Link></Button>
      </div>
    </div>
  );
}
