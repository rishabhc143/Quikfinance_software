"use client";

import * as React from "react";
import { HelpCircle, Megaphone, PlayCircle, Sparkles, Bot } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AiAssistant } from "@/components/dashboard/ai-assistant";
import { ThemeToggle } from "./theme-toggle";

export function RightRail() {
  return (
    <aside className="hidden xl:flex w-10 flex-col items-center gap-1 border-l py-3">
      <RailButton icon={HelpCircle} label="Help">
        <p className="text-sm">Browse help docs, FAQs, and guides at <a className="underline" href="/help">/help</a>.</p>
      </RailButton>
      <RailButton icon={Megaphone} label="Announcements">
        <p className="text-sm text-muted-foreground">No announcements right now.</p>
      </RailButton>
      <RailButton icon={PlayCircle} label="Tutorials">
        <p className="text-sm text-muted-foreground">Watch product walkthroughs at <a className="underline" href="/help/videos">/help/videos</a>.</p>
      </RailButton>
      <AiAssistant>
        <button className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent" aria-label="AI Assistant">
          <Bot className="h-4 w-4" />
        </button>
      </AiAssistant>
      <RailButton icon={Sparkles} label="What's New">
        <p className="text-sm text-muted-foreground">Latest releases and product news appear here.</p>
      </RailButton>
      <ThemeToggle />
    </aside>
  );
}

function RailButton({
  icon: Icon, label, children,
}: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent" aria-label={label}>
          <Icon className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-72">
        <div className="font-medium text-sm mb-2">{label}</div>
        {children}
      </PopoverContent>
    </Popover>
  );
}
