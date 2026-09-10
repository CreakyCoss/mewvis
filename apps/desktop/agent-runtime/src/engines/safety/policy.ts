import { SAFETY_RULES } from "./rules.js";
import { getAgentPermissionPolicy } from "./permissions.js";
import type {
  OperationAnalysis,
  PermissionMode,
  RuleFinding,
  SafetyContext,
  SafetyDecision,
  SafetyRisk,
  SafetyRule,
} from "./types.js";

const riskOrder: Record<SafetyRisk, number> = { low: 0, medium: 1, high: 2 };

export function evaluateSafety(
  analysis: OperationAnalysis,
  context: SafetyContext,
  mode: PermissionMode,
  rules: readonly SafetyRule[] = SAFETY_RULES,
): SafetyDecision {
  const policy = getAgentPermissionPolicy(mode);
  if (!["complete", "partial", "unknown"].includes(analysis.coverage)) throw new Error("无效的操作分析结果。");
  const findings: RuleFinding[] = [];
  let unknown = analysis.coverage !== "complete" || analysis.operations.length === 0;
  for (const operation of analysis.operations) {
    const matches = rules.flatMap((rule) => {
      const finding = rule.evaluate(operation, context);
      if (!finding) return [];
      if (
        !Object.hasOwn(riskOrder, finding.risk) ||
        !finding.reason?.trim() ||
        (finding.constraint !== undefined && !["protected", "unsandboxed"].includes(finding.constraint))
      )
        throw new Error(`安全规则 ${rule.id} 返回了无效结果。`);
      return [{ ...finding, ruleId: rule.id }];
    });
    if (!matches.length) unknown = true;
    findings.push(...matches);
  }
  const reasons = [...new Set(findings.map((finding) => finding.reason))];
  if (unknown) reasons.push("无法完整确认这次执行的副作用。");
  const deny = !policy.allowProtected && findings.some((finding) => finding.constraint === "protected");
  const approval =
    (unknown && !policy.allowUnknown) ||
    findings.some(
      (finding) =>
        riskOrder[finding.risk] > riskOrder[policy.maximumRisk] ||
        (finding.constraint === "unsandboxed" && !policy.allowUnsandboxed),
    );
  return { action: deny ? "deny" : approval ? "requestApproval" : "allow", reasons, findings };
}
