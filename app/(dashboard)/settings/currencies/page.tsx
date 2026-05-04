import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsShell } from "@/components/shared/settings-shell";
import { requireOrganization } from "@/lib/auth-helpers";
import { currencySymbol } from "@/lib/money";

const SUPPORTED = [
  { code: "INR", name: "Indian Rupee" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "JPY", name: "Japanese Yen" },
];

export const metadata = { title: "Currencies" };

export default async function CurrenciesPage() {
  const { organization } = await requireOrganization();
  return (
    <SettingsShell title="Currencies" description="Quikfinance supports these ISO 4217 currencies. Multi-currency on transactions arrives in Phase 4.">
      <Card>
        <CardHeader><CardTitle className="text-base">Primary currency</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-base px-3 py-1">{currencySymbol(organization.currency)} {organization.currency}</Badge>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/profile">Change in profile</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Supported currencies</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Code</th><th className="text-left p-3">Name</th><th className="text-left p-3">Symbol</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y">
              {SUPPORTED.map((c) => (
                <tr key={c.code}>
                  <td className="p-3 font-mono">{c.code}</td>
                  <td className="p-3">{c.name}</td>
                  <td className="p-3">{currencySymbol(c.code)}</td>
                  <td className="p-3 text-right">
                    {c.code === organization.currency && <Badge variant="success">Primary</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
