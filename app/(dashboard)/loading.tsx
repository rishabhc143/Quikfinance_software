import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
      </div>
      <div className="rounded-lg border bg-background p-4 space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
