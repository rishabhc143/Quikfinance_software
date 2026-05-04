import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { createManualJournalAction } from "../actions";

export const metadata = { title: "New Manual Journal" };

export default function NewManualJournalPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/accountant/manual-journals"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Manual Journal</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action={createManualJournalAction} className="space-y-4">
            <div><Label>Date <span className="text-destructive">*</span></Label><Input type="date" name="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required /></div>
            <div><Label>Notes</Label><Textarea name="notes" rows={4} placeholder="What's this adjustment for?" /></div>
            <p className="text-xs text-muted-foreground">Debit/credit lines on manual journals land alongside Journal Entries. For now this records the journal header.</p>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" asChild><Link href="/accountant/manual-journals">Cancel</Link></Button>
              <Button type="submit">Create journal</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
