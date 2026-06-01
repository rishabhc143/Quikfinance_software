import { TableSkeleton } from "@/components/shared/table-skeleton";

export default function Loading() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <TableSkeleton title="Purchase Orders" columnCount={8} rowCount={10} />
    </div>
  );
}
