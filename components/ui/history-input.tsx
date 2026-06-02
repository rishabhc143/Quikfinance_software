"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { fetchRecentValues, saveRecentValue } from "@/lib/autofill/actions";

/**
 * Drop-in replacement for `<Input>` that adds an org-scoped recent-values
 * dropdown. As the user types, a popover shows up-to-8 previously-typed
 * values for the same `autofillKey` from the same organization. Click a
 * suggestion to fill the field; tab/blur saves the entered value.
 *
 * Design notes:
 *  - `autofillKey` is the bucket name (e.g. "address.city", "contact.gstin").
 *    Identical keys across forms share the same suggestion pool — that's
 *    the entire point. Pick keys consistent with the field's semantic, NOT
 *    its form-local name (e.g. both Customer.city and Vendor.city use
 *    "address.city").
 *  - When `autofillKey` is omitted the component renders as a plain Input.
 *    Useful for fields where suggestions don't make sense (amounts, dates).
 *  - Suggestions are fetched ONCE on mount (top 50 by useCount × recency)
 *    and filtered client-side. No per-keystroke server roundtrip.
 *  - Compatible with react-hook-form's `register()` pattern — we forward
 *    the ref and merge onChange / onBlur with whatever RHF passes in.
 *  - Clicking a suggestion dispatches a native "input" event so RHF's
 *    onChange listener picks up the value as if the user typed it. This is
 *    the standard React-controlled-input-from-outside hack.
 *
 * Privacy:
 *  - Server action is org-scoped via `requireOrganization()`.
 *  - End-customer portal forms should NOT use this — those are anonymous;
 *    we don't want to bucket arbitrary email addresses into the org's
 *    suggestion pool. Browser-native autofill handles those.
 */

export type HistoryInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /**
   * Bucket key for recent-values. Use semantic field names that group
   * across forms — e.g. "address.city" should be the same key on Customer,
   * Vendor, Invoice billing address, etc. Omit to disable autofill (renders
   * as a plain Input).
   */
  autofillKey?: string;
};

const MAX_SUGGESTIONS = 8;

export const HistoryInput = React.forwardRef<HTMLInputElement, HistoryInputProps>(
  function HistoryInput(
    { autofillKey, className, onChange, onBlur, onFocus, ...props },
    forwardedRef,
  ) {
    const localRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = React.useCallback(
      (el: HTMLInputElement | null) => {
        localRef.current = el;
        if (typeof forwardedRef === "function") forwardedRef(el);
        else if (forwardedRef) forwardedRef.current = el;
      },
      [forwardedRef],
    );

    const [all, setAll] = React.useState<string[]>([]);
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState<string>(
      String(props.value ?? props.defaultValue ?? ""),
    );

    // Fetch the suggestion pool ONCE on mount (server roundtrip).
    React.useEffect(() => {
      if (!autofillKey) return;
      let cancelled = false;
      fetchRecentValues(autofillKey)
        .then((vs) => {
          if (!cancelled) setAll(vs);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [autofillKey]);

    // Filter suggestions as the user types. Empty query => show top N.
    const matches = React.useMemo(() => {
      if (!autofillKey || all.length === 0) return [];
      if (!query) return all.slice(0, MAX_SUGGESTIONS);
      const q = query.toLowerCase();
      return all
        .filter((v) => v.toLowerCase().includes(q) && v !== query)
        .slice(0, MAX_SUGGESTIONS);
    }, [autofillKey, all, query]);

    const selectSuggestion = (v: string) => {
      const input = localRef.current;
      if (!input) return;
      // React-controlled-input-from-outside trick — sets the value AND
      // dispatches an input event so any wrapping form lib (RHF, Formik,
      // controlled state) picks it up.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      setQuery(v);
      setOpen(false);
      // Optimistically add to head of suggestion list so it feels snappy
      // before the next mount fetches the updated server state.
      setAll((prev) => [v, ...prev.filter((x) => x !== v)]);
    };

    return (
      <div className="relative">
        <Input
          {...props}
          ref={setRefs}
          className={cn(className)}
          // Disable browser-native autocomplete when WE provide a dropdown
          // — having both fire on the same focus is a confusing mess.
          autoComplete={props.autoComplete ?? (autofillKey ? "off" : undefined)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange?.(e);
          }}
          onFocus={(e) => {
            if (autofillKey) setOpen(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            // 150ms gives the mouseDown on a suggestion time to register
            // before we close the popover.
            setTimeout(() => setOpen(false), 150);
            // Save the (trimmed) value to the recent-values pool so it
            // surfaces on the next form load.
            if (autofillKey && e.target.value) {
              saveRecentValue(autofillKey, e.target.value).catch(() => {});
            }
            onBlur?.(e);
          }}
        />
        {open && matches.length > 0 ? (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
            <ul className="max-h-60 overflow-auto py-1">
              {matches.map((v) => (
                <li
                  key={v}
                  className="cursor-pointer truncate px-3 py-1.5 text-sm hover:bg-accent"
                  // onMouseDown (not onClick) so it fires BEFORE the input's
                  // blur — otherwise blur closes the popover first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(v);
                  }}
                >
                  {v}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  },
);
