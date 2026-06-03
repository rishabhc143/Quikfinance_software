"use client";

import * as React from "react";
import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";

/**
 * Dirty-form navigation guard.
 *
 * Two complementary protections so users don't silently lose unsaved
 * work when they click the Back arrow ←, the Close X, or the Cancel
 * button on any transaction/master form:
 *
 *   1. Browser-level (`beforeunload`) — covers tab close, F5
 *      refresh, manual URL change, browser Back/Forward.
 *
 *   2. In-app (`<DirtyLink>` / `useDirtyNavigate`) — covers Next.js
 *      `<Link>` clicks and programmatic `router.push()`. Asks the
 *      user to confirm before continuing.
 *
 * Dirty detection is automatic: the provider listens for `input` and
 * `change` events bubbling from anywhere in its subtree (i.e. any
 * `<input>`, `<select>`, `<textarea>`, or contenteditable element).
 * Forms don't need to opt in — wrapping the page in
 * `<DirtyFormProvider>` and swapping Back/Close `<Link>` for
 * `<DirtyLink>` is enough.
 *
 * Forms that need to FORCIBLY reset the dirty flag after a
 * successful save (e.g. an inline-saving form that stays mounted)
 * can call `useDirtyForm().setDirty(false)` after the save resolves.
 * Most forms navigate away on save and don't need to do anything.
 *
 * `<DirtyLink>` is a drop-in replacement for `next/link`'s `<Link>`
 * for any exit-from-form control. Plain `<Link>` is still correct
 * for nav that should NOT prompt (app shell, footer, etc.).
 */

const CONFIRM_MESSAGE = "Discard unsaved changes?";

type Ctx = {
  dirty: boolean;
  setDirty: (next: boolean) => void;
};

const DirtyFormContext = React.createContext<Ctx>({
  dirty: false,
  setDirty: () => {},
});

export function DirtyFormProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [dirty, setDirty] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Browser-level guard. Only attaches when dirty so we don't
  // pollute other pages with stale prompts.
  React.useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Auto-detect mutations anywhere in the form subtree. `input` covers
  // text inputs, textareas, contenteditable, and range/number/color
  // inputs as they type. `change` covers selects, checkboxes, radios,
  // and file inputs. Both bubble, so a single listener on the wrapper
  // catches everything inside.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function mark() {
      setDirty(true);
    }
    root.addEventListener("input", mark);
    root.addEventListener("change", mark);
    return () => {
      root.removeEventListener("input", mark);
      root.removeEventListener("change", mark);
    };
  }, []);

  const value = React.useMemo<Ctx>(() => ({ dirty, setDirty }), [dirty]);
  return (
    <DirtyFormContext.Provider value={value}>
      {/* `display: contents` makes this wrapper transparent for layout —
          the children render as if they were direct descendants of the
          parent, but events still bubble through this node so the
          ref-bound listener catches them. */}
      <div ref={rootRef} className="contents">
        {children}
      </div>
    </DirtyFormContext.Provider>
  );
}

/**
 * Read + mutate the dirty flag from inside a `<DirtyFormProvider>`.
 *
 * Safe to call outside a provider — returns a no-op so forms that
 * haven't been wrapped yet don't crash. Migration is gradual.
 */
export function useDirtyForm(): Ctx {
  return React.useContext(DirtyFormContext);
}

/**
 * Programmatic navigation that asks the user to confirm when the
 * form is dirty. Use this when a button needs to navigate via
 * `router.push()` (e.g. a Cancel button that doesn't render as a
 * link).
 */
export function useDirtyNavigate() {
  const { dirty } = useDirtyForm();
  const router = useRouter();
  return React.useCallback(
    (href: string) => {
      if (dirty && !window.confirm(CONFIRM_MESSAGE)) return;
      router.push(href);
    },
    [dirty, router]
  );
}

/**
 * Drop-in replacement for `next/link`'s `<Link>` for exit-from-form
 * navigation (Back arrow, Close X, Cancel). On left-click it:
 *
 *   1. If dirty, asks the user to confirm before continuing.
 *   2. Prefers `router.back()` — sends the user back to wherever
 *      they actually came from (dashboard, search result, list,
 *      whatever). This was the user ask: "previous page where I
 *      belong" rather than always landing on a hardcoded module
 *      list page.
 *   3. Falls back to navigating to `href` when there is NO browser
 *      history to go back to — e.g. the user opened the form in
 *      a new tab via a direct URL.
 *
 * The component still renders as a real `<a href>` underneath so
 * middle-click / Cmd-click / right-click "Open in new tab" still
 * works and goes to the `href` target (which is the safe canonical
 * landing page for that form). Only the LEFT-click path uses
 * `router.back()`.
 *
 * Outside a `DirtyFormProvider` `dirty` is always false (no-op
 * context); the back-navigation behavior still applies.
 */
export function DirtyLink({
  href,
  children,
  onClick,
  ...rest
}: LinkProps & {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  const { dirty } = useDirtyForm();
  const router = useRouter();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        // Let modifier-key clicks (Cmd/Ctrl/Shift/middle) keep their
        // default open-in-new-tab behavior — the user is asking to
        // open the canonical href, not to navigate the current tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
          onClick?.(e);
          return;
        }
        if (dirty && !window.confirm(CONFIRM_MESSAGE)) {
          e.preventDefault();
          return;
        }
        // Prefer browser back when there's history to go back to;
        // fall back to navigating to `href` otherwise (direct loads,
        // new tabs). `window.history.length > 1` is the most reliable
        // signal across Next.js' client-side router stack.
        if (
          typeof window !== "undefined" &&
          window.history.length > 1
        ) {
          e.preventDefault();
          router.back();
          return;
        }
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
