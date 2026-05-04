import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { createDocumentAction } from "../actions";

export const metadata = { title: "Add Document" };

export default function NewDocumentPage() {
  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/documents"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">Add Document</h1>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Alert variant="info">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Direct file upload to S3/UploadThing arrives in a future release. For now, host the file elsewhere (Drive, Dropbox, etc.) and paste the public URL.
            </AlertDescription>
          </Alert>
          <form action={createDocumentAction} className="space-y-3">
            <div><Label>Name <span className="text-destructive">*</span></Label><Input name="name" required maxLength={200} /></div>
            <div><Label>URL <span className="text-destructive">*</span></Label><Input name="url" type="url" required placeholder="https://…" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Folder</Label><Input name="folder" placeholder="Receipts, Contracts…" /></div>
              <div><Label>Type</Label><Input name="mimeType" placeholder="application/pdf" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" asChild><Link href="/documents">Cancel</Link></Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
