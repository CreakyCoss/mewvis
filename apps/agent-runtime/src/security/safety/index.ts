import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { RISK_LEVELS } from "@isle/chat-contracts";
import { checkAgentAccess, type ResolvedAgentAccess } from "../access/index.js";
import { SAFETY_CONFIG as configuredPolicy } from "./policy.js";
import { canonicalPath, createResourcePathResolver } from "../platforms/resources.js";
import type {
  SafetyPolicy,
  SafetyConfig,
  SafetyRule,
  RuleFinding,
  SafetyDecision,
  SafetyContext,
  ExecutionApprovalRequest,
  ExecutionRequest,
  OperationAnalysis,
  Operation,
  PermissionMode,
} from "./types.js";

export { canonicalPath } from "../platforms/resources.js";
export type * from "./types.js";

const riskSchema = z.enum(RISK_LEVELS);
const textSchema = z.string().trim().min(1);
const configSchema = z
  .object({
    enabled: z.boolean(),
    profiles: z
      .array(
        z
          .object({
            mode: textSchema,
            label: textSchema,
            description: textSchema,
            isDefault: z.boolean(),
            approval: z.object({ maximumRisk: riskSchema, unknown: z.enum(["allow", "ask", "deny"]) }).strict(),
          })
          .strict(),
      )
      .min(1),
    rules: z.custom<SafetyConfig["rules"]>((value) => typeof value === "function"),
  })
  .strict();
const ruleSchema = z
  .object({
    id: textSchema,
    description: textSchema,
    scope: z.enum(["operation", "invocation"]),
    evaluate: z.custom<SafetyRule["evaluate"]>((value) => typeof value === "function"),
  })
  .strict();
const findingSchema = z
  .object({
    risk: riskSchema,
    reason: textSchema,
    effect: z.enum(["deny", "ask"]).optional(),
  })
  .strict();

/** Validate only the common contract; resource/command specifics belong to the executable config. */
export function validateSafetyConfig(input: unknown): SafetyConfig {
  const config = configSchema.parse(input);
  if (config.profiles.filter((profile) => profile.isDefault).length !== 1)
    throw new Error("权限配置必须有且只有一个默认档位。");
  if (new Set(config.profiles.map((profile) => profile.mode)).size !== config.profiles.length)
    throw new Error("权限档位不可重复。");
  return Object.freeze({
    ...config,
    profiles: Object.freeze(
      config.profiles.map((profile) => Object.freeze({ ...profile, approval: Object.freeze(profile.approval) })),
    ),
  });
}
export const SAFETY_CONFIG = validateSafetyConfig(configuredPolicy);
export const AGENT_PERMISSION_DEFINITIONS = SAFETY_CONFIG.profiles;
export const DEFAULT_AGENT_PERMISSION_MODE = AGENT_PERMISSION_DEFINITIONS.find((profile) => profile.isDefault)!
  .mode as PermissionMode;
export function getAgentPermissionOptions() {
  return AGENT_PERMISSION_DEFINITIONS.map(({ mode, label, description, isDefault }) => ({
    mode: mode as PermissionMode,
    label,
    isDefault,
    description: SAFETY_CONFIG.enabled ? description : "调用前权限检查与审批已关闭；沙箱由执行配置独立控制。",
  }));
}

/** Resolve and freeze a host-only ruleset. Child agents share it; it never crosses worker RPC. */
export function resolveSafetyPolicy(
  mode: PermissionMode,
  workspacePath: string,
  config: SafetyConfig = SAFETY_CONFIG,
  runtimePath = dirname(fileURLToPath(import.meta.url)),
): SafetyPolicy | null {
  const parsed = validateSafetyConfig(config);
  if (!parsed.enabled) return null;
  const profile = parsed.profiles.find((profile) => profile.mode === mode);
  if (!profile) throw new Error("无效的权限模式。");
  const workspace = canonicalPath(workspacePath);
  const rules = z.array(ruleSchema).parse(
    parsed.rules({
      mode,
      workspacePath: workspace,
      resolvePath: createResourcePathResolver(workspace, runtimePath),
    }),
  );
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) throw new Error("安全规则 ID 不可重复。");
  return Object.freeze({
    workspacePath: workspace,
    approval: profile.approval,
    rules: Object.freeze(rules.map((rule) => Object.freeze(rule))),
  });
}

/** Every restriction uses the same evaluation path; no tool or resource special cases here. */
export function evaluateSafety(analysis: OperationAnalysis, context: SafetyContext): SafetyDecision {
  const { policy, request } = context;
  if (!["complete", "partial", "unknown"].includes(analysis.coverage)) throw new Error("无效的操作分析结果。");
  const findings: RuleFinding[] = [];
  const recognized = new Set<Operation>();
  for (const rule of policy.rules) {
    const subjects = rule.scope === "invocation" ? [undefined] : analysis.operations;
    for (const operation of subjects) {
      const result = rule.evaluate({ request, workspacePath: policy.workspacePath, operation });
      if (result === undefined) continue;
      const finding = findingSchema.safeParse(result);
      if (!finding.success) throw new Error(`安全规则 ${rule.id} 返回了无效结果。`);
      findings.push({ ...finding.data, ruleId: rule.id });
      if (operation) recognized.add(operation);
    }
  }
  const unknown =
    analysis.coverage !== "complete" ||
    analysis.operations.length === 0 ||
    analysis.operations.some((operation) => !recognized.has(operation));
  const reasons = [...new Set(findings.map((finding) => finding.reason))];
  if (unknown) reasons.push("无法完整确认这次执行的副作用。");
  const deny = findings.some((finding) => finding.effect === "deny") || (unknown && policy.approval.unknown === "deny");
  const approval =
    findings.some(
      (finding) =>
        finding.effect === "ask" ||
        RISK_LEVELS.indexOf(finding.risk) > RISK_LEVELS.indexOf(policy.approval.maximumRisk),
    ) ||
    (unknown && policy.approval.unknown === "ask");
  return { action: deny ? "deny" : approval ? "requestApproval" : "allow", reasons, findings };
}

/** Await approval for this invocation only. There is no reusable grant or model-driven retry. */
export async function checkExecution(options: {
  request: ExecutionRequest;
  policy: SafetyPolicy | null;
  access?: ResolvedAgentAccess;
  analyze(request: ExecutionRequest): OperationAnalysis;
  requestApproval?: (request: ExecutionApprovalRequest) => Promise<boolean>;
  signal?: AbortSignal;
}): Promise<{ allowed: boolean; reason?: string }> {
  const { signal } = options;
  signal?.throwIfAborted();
  if (!options.policy && !options.access) return { allowed: true };
  const request = structuredClone(options.request);
  const analysis = options.analyze(request);
  const accessDenial = options.access && checkAgentAccess(options.access, analysis);
  if (accessDenial) return { allowed: false, reason: `操作超出申请权限：${accessDenial}` };
  if (!options.policy) return { allowed: true };
  const decision = evaluateSafety(analysis, { workspacePath: request.workspacePath, policy: options.policy, request });
  if (decision.action === "deny") return { allowed: false, reason: `操作被禁止：${decision.reasons.join("\n")}` };
  if (decision.action === "requestApproval") {
    if (!options.requestApproval) return { allowed: false, reason: "操作需要用户审批，但当前没有审批通道。" };
    const snapshot = JSON.stringify({ request, analysis, decision });
    const approved = await options.requestApproval({
      executionId: request.executionId,
      summary: request.entry,
      details: JSON.stringify(
        { input: request.input, operations: analysis.operations, coverage: analysis.coverage },
        null,
        2,
      ),
      reason: decision.reasons.join("\n"),
      signal,
    });
    signal?.throwIfAborted();
    if (!approved) return { allowed: false, reason: "用户未授权这次操作（拒绝或等待超过一分钟），操作未执行。" };
    const currentRequest = structuredClone(options.request);
    const currentAnalysis = options.analyze(currentRequest);
    const currentAccessDenial = options.access && checkAgentAccess(options.access, currentAnalysis);
    if (currentAccessDenial) return { allowed: false, reason: currentAccessDenial };
    const currentDecision = evaluateSafety(currentAnalysis, {
      workspacePath: currentRequest.workspacePath,
      policy: options.policy,
      request: currentRequest,
    });
    if (snapshot !== JSON.stringify({ request: currentRequest, analysis: currentAnalysis, decision: currentDecision }))
      return { allowed: false, reason: "审批期间执行参数或目标权限发生变化，操作未执行，请重新发起。" };
  }
  signal?.throwIfAborted();
  return { allowed: true };
}
