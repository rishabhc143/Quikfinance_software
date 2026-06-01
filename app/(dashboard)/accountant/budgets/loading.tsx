import { TableSkeleton } from "@/components/shared/table-skeleton";

export default function Loading() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <TableSkeleton title="Budgets" columnCount={6} rowCount={10} />
    </div>
  );
}
