"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useState } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  }));
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <NuqsAdapter>{children}</NuqsAdapter>
        <Toaster
          richColors
          position="top-right"
          // Wire sonner's semantic toast types to the app's emerald palette
          // so success toasts glow brand-green and error toasts pick up the
          // app's destructive token instead of sonner's generic red.
          toastOptions={{
            classNames: {
              toast:
                "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
              success:
                "group-[.toast]:!bg-success/10 group-[.toast]:!text-success group-[.toast]:!border-success/30",
              error:
                "group-[.toast]:!bg-destructive/10 group-[.toast]:!text-destructive group-[.toast]:!border-destructive/30",
              warning:
                "group-[.toast]:!bg-warning/15 group-[.toast]:!text-warning-foreground group-[.toast]:!border-warning/30",
              info:
                "group-[.toast]:!bg-info/10 group-[.toast]:!text-info group-[.toast]:!border-info/30",
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
