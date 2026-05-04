import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactForm } from "../contact-form";
import { createContactAction } from "../actions";

export const metadata = { title: "New Contact" };

export default function NewContactPage({ searchParams }: { searchParams: Record<string, string> }) {
  const initialType = searchParams.type === "vendor" ? "VENDOR" : searchParams.type === "both" ? "BOTH" : "CUSTOMER";
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/contacts"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Contact</h1>
      </div>
      <ContactForm initial={{ type: initialType }} onSubmit={createContactAction} submitLabel="Save" />
    </div>
  );
}
