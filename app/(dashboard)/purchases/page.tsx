import { redirect } from "next/navigation";

/**
 * `/purchases` lands directly on the Vendors list — matching the
 * the reference design pattern where the Purchases module's default landing is
 * the Active Vendors page. Users still reach every sub-module via
 * the sidebar; this redirect just gives the parent route a sensible
 * default.
 *
 * The previous landing tiles page was useful as an overview but
 * created an extra click for the most common entry point (managing
 * vendors). If a dashboard view is needed in the future, it can move
 * to `/purchases/overview` so this URL keeps its short, navigable
 * shape.
 */
export default function PurchasesIndexPage() {
  redirect("/purchases/vendors");
}
