/**
 * Hand-rolled wordmark for the Razorpay settings card. NOT a copy of
 * Razorpay's actual logo — uses a generic "Razorpay" text mark in
 * brand-blue with a small navy circle accent. Recorded in DECISIONS.md.
 */
export function RazorpayMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 28"
      className={className}
      role="img"
      aria-label="Razorpay"
    >
      <circle cx="14" cy="14" r="6" fill="#0a2540" />
      <circle cx="14" cy="14" r="2.5" fill="#3395ff" />
      <text
        x="28"
        y="20"
        fontFamily="ui-sans-serif, system-ui, -apple-system"
        fontSize="18"
        fontWeight="600"
        fill="#3395ff"
      >
        Razorpay
      </text>
    </svg>
  );
}
