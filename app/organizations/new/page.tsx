import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganizationAction } from "./actions";

const COUNTRY_CURRENCIES = [
  { code: "IN", name: "India", currency: "INR", fiscalStart: 4 },
  { code: "US", name: "United States", currency: "USD", fiscalStart: 1 },
  { code: "GB", name: "United Kingdom", currency: "GBP", fiscalStart: 4 },
  { code: "AE", name: "United Arab Emirates", currency: "AED", fiscalStart: 1 },
  { code: "SG", name: "Singapore", currency: "SGD", fiscalStart: 1 },
];

export default function NewOrgPage() {
  return (
    <div className="p-6 max-w-xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Create your organization</CardTitle>
          <CardDescription>Each org has its own books, contacts, items, and users.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createOrganizationAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Organization name</Label>
              <Input id="name" name="name" required minLength={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="country">Country</Label>
                <select id="country" name="country" defaultValue="IN" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {COUNTRY_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <select id="currency" name="currency" defaultValue="INR" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {Array.from(new Set(COUNTRY_CURRENCIES.map((c) => c.currency))).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fiscalYearStart">Fiscal year starts</Label>
              <select id="fiscalYearStart" name="fiscalYearStart" defaultValue="4" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {new Date(2024, i, 1).toLocaleString("en", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="w-full">Create organization</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
