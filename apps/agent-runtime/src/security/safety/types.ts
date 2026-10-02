import type { AgentPermissions } from "../../engines/protocol/wire.js";
import type { RiskLevel } from "@mewvis/chat-contracts";

export type PermissionMode = AgentPermissions["mode"];
export type SafetyRisk = RiskLevel;

/** Facts supplied by a trusted runtime adapter, never a model's description of intent. */
export type Operation =
  | Readonly<{
      kind: "filesystem";
      action: "read" | "write" | "delete" | "list" | "search";
      target: string;
      recursive: boolean;
    }>
  | Readonly<{ kind: "process"; command: string; cwd: string }>
  | Readonly<{ kind: "network"; url: string; method: string }>
  | Readonly<{ kind: "interaction"; action: "ask" | "delegate" }>
  /** Risk declared by an enabled tool's definition. Actual effects remain confined by execution policy. */
  | Readonly<{ kind: "tool"; risk: SafetyRisk }>;

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

export type ApprovalPolicy = Readonly<{ maximumRisk: SafetyRisk; unknown: "allow" | "ask" | "deny" }>;
export type PermissionProfile = Readonly<{
  mode: string;
  label: string;
  description: string;
  isDefault: boolean;
  approval: ApprovalPolicy;
}>;
export type RuleResolutionContext = Readonly<{
  mode: string;
  workspacePath: string;
  resolvePath(value: string): string;
}>;

/** Executable configuration stays in the host and creates a fresh, self-contained ruleset per run. */
export type SafetyConfig = Readonly<{
  enabled: boolean;
  profiles: readonly PermissionProfile[];
  rules(context: RuleResolutionContext): readonly SafetyRule[];
}>;
export type SafetyPolicy = Readonly<{
  workspacePath: string;
  approval: ApprovalPolicy;
  rules: readonly SafetyRule[];
}>;
export type SafetyContext = Readonly<{ workspacePath: string; policy: SafetyPolicy; request: ExecutionRequest }>;
export type RuleFinding = Readonly<{
  ruleId: string;
  risk: SafetyRisk;
  reason: string;
  effect?: "deny" | "ask";
}>;
export type SafetyRule = Readonly<{
  id: string;
  description: string;
  scope: "operation" | "invocation";
  evaluate(
    context: Readonly<{
      request: ExecutionRequest;
      workspacePath: string;
      /** Present only for operation rules; invocation rules run once even when analysis is unknown. */
      operation?: Operation;
    }>,
  ): Omit<RuleFinding, "ruleId"> | undefined;
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
