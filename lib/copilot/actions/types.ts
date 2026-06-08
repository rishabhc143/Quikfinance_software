/**
 * CFO Copilot Mutating Tools v1 — action type registry.
 *
 * Each mutating tool corresponds to one `ActionType`. The
 * CopilotProposedAction table stores `payload` as untyped JSON;
 * this module narrows it back to the right shape per type so
 * downstream code is type-safe.
 *
 * To add a new mutating tool:
 *   1. Add the type name to `ActionType` union
 *   2. Add the payload shape to `ActionPayload`
 *   3. Add an executor in lib/copilot/actions/executors.ts
 *   4. Add the tool definition + handler in
 *      lib/cashflow/copilot-tools.ts
 *
 * No other code needs to change — approval/reject routes look up
 * the executor by type at runtime.
 */

export type ActionType = "dismiss_anomaly_alert";
// Future types: "send_invoice_reminder", "mark_bill_paid",
// "schedule_payment", etc.

export type ActionPayload = {
  dismiss_anomaly_alert: {
    alertId: string;
    reason?: string;
  };
};

export type ProposalResult<T extends ActionType> = {
  /** Server-generated id; pass back to /approve or /reject. */
  proposalId: string;
  type: T;
  payload: ActionPayload[T];
  summary: string;
  expiresAt: string;
};
