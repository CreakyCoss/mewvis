import { evaluateSafety } from "./policy.js";
import type { ExecutionApprovalRequest, ExecutionRequest, OperationAnalysis, PermissionMode } from "./types.js";

/** Await approval for this invocation only. There is no reusable grant or model-driven retry. */
export async function checkExecution(options: {
  request: ExecutionRequest;
  mode: PermissionMode;
  analyze(request: ExecutionRequest): OperationAnalysis;
  requestApproval?: (request: ExecutionApprovalRequest) => Promise<boolean>;
  signal?: AbortSignal;
}): Promise<{ allowed: boolean; reason?: string }> {
  const { signal } = options;
  signal?.throwIfAborted();
  const request = structuredClone(options.request);
  const analysis = options.analyze(request);
  const decision = evaluateSafety(analysis, { workspacePath: request.workspacePath }, options.mode);
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
    const currentDecision = evaluateSafety(
      currentAnalysis,
      { workspacePath: currentRequest.workspacePath },
      options.mode,
    );
    if (snapshot !== JSON.stringify({ request: currentRequest, analysis: currentAnalysis, decision: currentDecision }))
      return { allowed: false, reason: "审批期间执行参数或目标权限发生变化，操作未执行，请重新发起。" };
  }
  signal?.throwIfAborted();
  return { allowed: true };
}
