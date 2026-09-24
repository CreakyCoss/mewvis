/** Portable judgment contract. Rules and provider identities are private to implementations. */
export type DecisionOutput =
  | { type: "choice"; options: string[] }
  | { type: "score"; levels: string[] }
  | { type: "boolean" };
export interface DecisionRequest {
  input: string;
  question: string;
  output: DecisionOutput;
}
export type DecisionResult = {
  status: "accepted" | "review_required" | "abstained";
  reason: string;
  confidence?: {
    value: number;
    source: "model_self_report" | "calibrated" | "rule";
  };
} & (
  | { type: "choice"; value: string | null }
  | { type: "score"; value: number | null }
  | { type: "boolean"; value: boolean | null }
);
export const decisionRequestSchema: import("../shared.js").JsonObject;
export const decisionResultSchema: import("../shared.js").JsonObject;
export function decisionResultMatchesRequest(
  input: unknown,
  result: unknown,
): boolean;
