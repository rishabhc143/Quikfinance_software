"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Mail, Twitter, Linkedin, Gift } from "lucide-react";
import { toast } from "sonner";

export function ReferEarn({ children, referralCode }: { children: React.ReactNode; referralCode: string }) {
  const [open, setOpen] = React.useState(false);
  const link = `${typeof window === "undefined" ? "" : window.location.origin}/r/${referralCode}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button onClick={() => setOpen(true)} className="contents">{children}</button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary/10 grid place-items-center">
            <Gift className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center">Know someone who would love Quikfinance?</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground text-center">
          Refer and earn <strong>$3</strong> per qualified signup, plus <strong>15%</strong> of their subscription as
          Quikfinance Wallet credits.
        </p>

        <div className="flex gap-2">
          <input readOnly value={link} className="flex-1 px-3 py-2 text-sm bg-muted rounded-md border" />
          <Button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(link);
              toast.success("Referral link copied");
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" asChild><a href={`mailto:?subject=Try Quikfinance&body=${encodeURIComponent(link)}`}><Mail className="h-4 w-4 mr-1" /> Email</a></Button>
          <Button variant="outline" size="sm" asChild><a target="_blank" rel="noreferrer" href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}`}><Twitter className="h-4 w-4 mr-1" /> Twitter</a></Button>
          <Button variant="outline" size="sm" asChild><a target="_blank" rel="noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`}><Linkedin className="h-4 w-4 mr-1" /> LinkedIn</a></Button>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">How does it work?</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Share your link with founders, accountants, freelancers.</li>
            <li>They sign up with the link and start a paid Quikfinance plan.</li>
            <li>You instantly earn $3 + 15% of their first-year subscription.</li>
            <li>Credits land in your Quikfinance Wallet, ready to use against your subscription.</li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
