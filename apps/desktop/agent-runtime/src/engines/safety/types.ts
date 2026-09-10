import type { AgentPermissions } from "../protocol/wire.js";

export type PermissionMode = AgentPermissions["mode"];
export type SafetyRisk = "low" | "medium" | "high";

/** Facts supplied by a trusted runtime adapter, never a model's description of intent. */
export type Operation =
  | Readonly<{
      kind: "filesystem";
      action: "read" | "write" | "delete" | "list" | "search";
      target: string;
      recursive: boolean;
    }>
  | Readonly<{ kind: "process"; command: string; cwd: string; sandboxed: boolean }>
  | Readonly<{ kind: "network"; url: string; method: string }>
  | Readonly<{ kind: "interaction"; action: "ask" | "delegate" }>;

export type ExecutionRequest = Readonly<{
  executionId: string;
  entry: string;
  input: Readonly<Record<string, unknown>>;
  workspacePath: string;
}>;

export type OperationAnalysis = Readonly<{
  operations: readonly Operation[];
  coverage: "complete" | "partial" | "unknown";
}>;

export type SafetyContext = Readonly<{ workspacePath: string }>;
export type RuleFinding = Readonly<{
  ruleId: string;
  risk: SafetyRisk;
  reason: string;
  constraint?: "protected" | "unsandboxed";
}>;
export type SafetyRule = Readonly<{
  id: string;
  description: string;
  evaluate(operation: Operation, context: SafetyContext): Omit<RuleFinding, "ruleId"> | undefined;
}>;
export type SafetyDecision = Readonly<{
  action: "allow" | "deny" | "requestApproval";
  reasons: readonly string[];
  findings: readonly RuleFinding[];
}>;

export type ExecutionApprovalRequest = Readonly<{
  executionId: string;
  summary: string;
  details: string;
  reason: string;
  signal?: AbortSignal;
}>;
