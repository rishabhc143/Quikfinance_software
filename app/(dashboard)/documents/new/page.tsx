import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createDocumentAction } from "../actions-upload";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Add Document" };

/**
 * Add Document — two-tab page:
 *   1. Upload a file (Vercel Blob direct upload)
 *   2. Paste an existing URL (back-compat for users hosting on
 *      Drive/Dropbox/S3 etc.)
 *
 * The upload form is a client component; the URL form is a plain
 * <form action={...}> POSTing to the existing server action.
 */
export default function NewDocumentPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/documents">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Add Document</h1>
      </div>

      {/* Upload tab — primary path for new users. */}
      <Card>
        <CardContent className="pt-6 space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Upload a file</h2>
            <span className="text-xs text-muted-foreground">
              Stored on Vercel Blob
            </span>
          </div>
          <UploadForm />
        </CardContent>
      </Card>

      {/* URL tab — back-compat for externally-hosted files. */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">…or paste a URL</h2>
            <span className="text-xs text-muted-foreground">
              For Drive / Dropbox / S3
            </span>
          </div>
          <form action={createDocumentAction} className="space-y-3">
            <div>
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input name="name" required maxLength={200} />
            </div>
            <div>
              <Label>
                URL <span className="text-destructive">*</span>
              </Label>
              <Input
                name="url"
                type="url"
                required
                placeholder="https://…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Folder</Label>
                <Input name="folder" placeholder="Receipts, Contracts…" />
              </div>
              <div>
                <Label>Type</Label>
                <Input name="mimeType" placeholder="application/pdf" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" asChild>
                <Link href="/documents">Cancel</Link>
              </Button>
              <Button type="submit">Save URL</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
