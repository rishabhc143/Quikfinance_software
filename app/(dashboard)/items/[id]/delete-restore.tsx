"use client";

import { useRouter } from "next/navigation";
import { Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { softDeleteItemsAction, restoreItemAction } from "../actions";
import { toast } from "sonner";

export function DeleteRestoreButtons({ id, isDeleted }: { id: string; isDeleted: boolean }) {
  const router = useRouter();

  if (isDeleted) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          const r = await restoreItemAction(id);
          if (r.ok) { toast.success("Item restored"); router.push(`/items/${id}`); router.refresh(); }
        }}
      >
        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        if (!confirm("Delete this item? It can be restored later.")) return;
        const r = await softDeleteItemsAction([id]);
        if (r.ok) { toast.success("Item deleted"); router.push("/items"); router.refresh(); }
      }}
    >
      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
    </Button>
  );
}
