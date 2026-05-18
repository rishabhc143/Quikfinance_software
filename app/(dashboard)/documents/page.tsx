import Link from "next/link";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const { organization } = await requireOrganization();
  const docs = await db.document.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">{docs.length} files attached to this organization.</p>
        </div>
        <Button asChild><Link href="/documents/new">+ Add document</Link></Button>
      </div>
      {docs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
            <p>Drop receipts, contracts, statements, and supporting files here.</p>
            <p className="text-xs">Upload files directly (up to 10 MB) or paste a URL for files hosted elsewhere.</p>
            <Button asChild><Link href="/documents/new">+ Add your first document</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Folder</th><th className="text-left p-3">Type</th><th className="text-left p-3">Uploaded</th><th /></tr>
            </thead>
            <tbody className="divide-y">
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="p-3 font-medium">{d.name}</td>
                  <td className="p-3">{d.folder ? <Badge variant="outline">{d.folder}</Badge> : "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{d.mimeType ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{format(d.createdAt, "dd MMM yyyy")}</td>
                  <td className="p-3 text-right">
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
