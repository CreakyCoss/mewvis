import { homedir } from "node:os";
import { resolve } from "node:path";
import { validateToolArguments } from "@earendil-works/pi-ai";
import {
  checkExecution,
  canonicalPath,
  type SafetyPolicy,
  type SafetyRisk,
  type ExecutionRequest,
  type OperationAnalysis,
  type Operation,
} from "../../../../../../../security/safety/index.js";
import type { AgentRuntimeCallbacks, RuntimeAgentCommand } from "../../types.js";
import type { PiAgentSession } from "../agent/session.js";
import type { ResolvedAgentAccess } from "../../../../../../../security/access/index.js";

const fileActions: Readonly<Record<string, Extract<Operation, { kind: "filesystem" }>["action"]>> = {
  read: "read",
  edit: "write",
  write: "write",
  ls: "list",
  find: "list",
  grep: "search",
};

const fileTarget = (request: ExecutionRequest, name: string) => {
  const raw = request.input.path ?? (["ls", "find", "grep"].includes(name) ? "." : undefined);
  if (typeof raw !== "string" || !raw.trim()) throw new Error("文件操作缺少有效路径。");
  return canonicalPath(
    resolve(
      request.workspacePath,
      raw === "~" ? homedir() : raw.startsWith("~/") ? resolve(homedir(), raw.slice(2)) : raw,
    ),
  );
};

/** Pi-specific argument decoding. Common rules never depend on Pi's tool names. */
export function analyzePiExecution(
  request: ExecutionRequest,
  toolRisks?: ReadonlyMap<string, SafetyRisk>,
): OperationAnalysis {
  const name = request.entry;
  if (Object.hasOwn(fileActions, name))
    return {
      coverage: "complete",
      operations: [
        ...(name === "edit"
          ? [
              {
                kind: "filesystem" as const,
                action: "read" as const,
                target: fileTarget(request, name),
                recursive: false,
              },
            ]
          : []),
        {
          kind: "filesystem",
          action: fileActions[name],
          target: fileTarget(request, name),
          recursive: name === "grep" || name === "find",
        },
      ],
    };
  if (name === "bash" || name === "powershell") {
    const { command } = request.input;
    if (typeof command !== "string" || !command.trim()) throw new Error("Shell 操作缺少有效命令。");
    // Parsing a command name cannot account for scripts, expansions or subprocesses.
    return {
      coverage: "partial",
      operations: [{ kind: "process", command, cwd: request.workspacePath }],
    };
  }
  if (name === "ask_user" || name === "subagent")
    return {
      coverage: "complete",
      operations: [{ kind: "interaction", action: name === "ask_user" ? "ask" : "delegate" }],
    };
  const risk = toolRisks?.get(name);
  if (risk !== undefined) return { coverage: "complete", operations: [{ kind: "tool", risk }] };
  // A custom tool with no registered risk declaration remains unknown.
  return { coverage: "unknown", operations: [] };
}

export function installPiSafety(
  session: PiAgentSession,
  command: RuntimeAgentCommand,
  callbacks: AgentRuntimeCallbacks,
  policy: SafetyPolicy | null,
  access?: ResolvedAgentAccess,
  toolRisks?: ReadonlyMap<string, SafetyRisk>,
  hostCheckedTools: readonly string[] = [],
) {
  const previous = session.agent.beforeToolCall;
  const declaredRisks = new Map(toolRisks);
  const delegated = new Set(hostCheckedTools);
  // This hook provides cancellation and runs after Pi's extension hooks, so the
  // checked arguments are the ones passed to execution. No changes to Pi itself.
  session.agent.beforeToolCall = async (context, signal) => {
    const prior = await previous?.(context, signal);
    if (prior?.block) return prior;
    // Isle proxies validate their final arguments without native coercion, before host approval.
    if (delegated.has(context.toolCall.name)) return prior;
    signal?.throwIfAborted();
    if (!context.args || typeof context.args !== "object" || Array.isArray(context.args))
      return { block: true, reason: "执行参数必须为对象。" };
    const input = context.args as Record<string, unknown>;
    const tool = session.agent.state.tools.find((tool) => tool.name === context.toolCall.name);
    if (!tool) return { block: true, reason: "执行工具未启用。" };
    const validated = validateToolArguments(tool, { ...context.toolCall, arguments: input });
    for (const key of Object.keys(input)) delete input[key];
    Object.defineProperties(input, Object.getOwnPropertyDescriptors(validated));
    if (!policy && !access) return prior;
    const request: ExecutionRequest = {
      executionId: context.toolCall.id,
      entry: context.toolCall.name,
      input,
      workspacePath: command.workspacePath,
    };
    if (Object.hasOwn(fileActions, request.entry)) input.path = fileTarget(request, request.entry);
    const result = await checkExecution({
      request,
      policy,
      access,
      analyze: (request) => analyzePiExecution(request, declaredRisks),
      requestApproval:
        callbacks.requestApproval &&
        ((approval) => callbacks.requestApproval!({ ...approval, taskId: command.taskId })),
      signal,
    });
    return result.allowed ? undefined : { block: true, reason: result.reason };
  };
}
