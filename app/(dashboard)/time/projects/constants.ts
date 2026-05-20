/**
 * Shared constants for the Time Tracking → Projects sub-module.
 *
 * Lives outside `actions.ts` because Next.js requires "use server"
 * files to export only async functions — constants must live in a
 * plain module.
 */

export const BILLING_METHODS = [
  { value: "fixed_cost", label: "Fixed Cost for Project" },
  { value: "project_hours", label: "Based on Project Hours" },
  { value: "task_hours", label: "Based on Task Hours" },
  { value: "staff_hours", label: "Based on Staff Hours" },
] as const;

export const BILLING_METHOD_VALUES = BILLING_METHODS.map((b) => b.value) as [
  string,
  ...string[]
];

export function billingMethodLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return BILLING_METHODS.find((b) => b.value === value)?.label ?? value;
}
