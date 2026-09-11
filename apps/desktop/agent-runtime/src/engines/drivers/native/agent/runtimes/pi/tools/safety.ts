import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  checkExecution,
  canonicalPath,
  type SafetyPolicy,
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
export function analyzePiExecution(request: ExecutionRequest): OperationAnalysis {
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
  // Custom tools, including internal business tools, use the same unknown-operation policy.
  return { coverage: "unknown", operations: [] };
}

export function installPiSafety(
  session: PiAgentSession,
  command: RuntimeAgentCommand,
  callbacks: AgentRuntimeCallbacks,
  policy: SafetyPolicy | null,
  access?: ResolvedAgentAccess,
) {
  if (!policy && !access) return;
  const previous = session.agent.beforeToolCall;
  // This hook provides cancellation and runs after Pi's extension hooks, so the
  // checked arguments are the ones passed to execution. No changes to Pi itself.
  session.agent.beforeToolCall = async (context, signal) => {
    const prior = await previous?.(context, signal);
    if (prior?.block) return prior;
    signal?.throwIfAborted();
    if (!context.args || typeof context.args !== "object" || Array.isArray(context.args))
      return { block: true, reason: "执行参数必须为对象。" };
    const input = context.args as Record<string, unknown>;
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
      analyze: analyzePiExecution,
      requestApproval:
        callbacks.requestApproval &&
        ((approval) => callbacks.requestApproval!({ ...approval, taskId: command.taskId })),
      signal,
    });
    return result.allowed ? undefined : { block: true, reason: result.reason };
  };
}
