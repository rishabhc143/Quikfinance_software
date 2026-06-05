import { Sparkles } from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { CopilotChat } from "./copilot-chat";

export const metadata = { title: "CFO Copilot" };

/**
 * CF-5 — CFO Copilot landing page.
 *
 * Server component just validates auth + passes org metadata to the
 * client chat shell. All the conversational state lives in
 * `<CopilotChat>` for v1 (no persistence yet).
 */
export default async function CashflowCopilotPage() {
  const { organization } = await requireOrganization();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <Sparkles className="h-6 w-6 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CFO Copilot</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Ask questions about your cashflow, AR, AP, and recurring
            profiles in plain English. The copilot reads your live
            Quikfinance data on demand to ground every answer — it
            doesn&apos;t guess at numbers and it can&apos;t change anything.
          </p>
        </div>
      </div>
      <CopilotChat
        organizationName={organization.name}
        currency={organization.currency}
      />
    </div>
  );
}
