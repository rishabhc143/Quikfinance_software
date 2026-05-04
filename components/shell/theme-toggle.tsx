"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Toggle theme"
        >
          {!mounted ? <Sun className="h-4 w-4" /> : theme === "dark" ? <Moon className="h-4 w-4" /> : theme === "system" ? <Monitor className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTheme("light")}><Sun className="h-4 w-4 mr-2" /> Light</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}><Moon className="h-4 w-4 mr-2" /> Dark</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}><Monitor className="h-4 w-4 mr-2" /> System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
