"use client";
import * as React from "react";

/**
 * On page load (and when the hash changes), find the
 * `<details id="...">` that matches `window.location.hash`,
 * open it, and scroll it into view.
 *
 * This solves the FAQ deep-link UX: when you land at
 * /help/fiscal-year-end-tasks#modify-invoice-number the
 * matching accordion should be open already, not collapsed.
 *
 * Rendered as a no-op span at the top of the page. Only
 * side-effects happen.
 */
export function HashOpener() {
  React.useEffect(() => {
    function openHashTarget() {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const el = document.getElementById(hash);
      if (el && el.tagName === "DETAILS") {
        (el as HTMLDetailsElement).open = true;
        // Re-scroll after opening — the native scroll on initial
        // hash navigation lands on the collapsed element which
        // is shorter than the opened one.
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    }
    openHashTarget();
    window.addEventListener("hashchange", openHashTarget);
    return () => window.removeEventListener("hashchange", openHashTarget);
  }, []);
  return null;
}
