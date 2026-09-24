import { createActiveDeadline } from "./deadline.js";
import { runExtensionTask } from "./task.js";
import { ExtensionHost } from "@isle/extension-host/services/runtime";
import {
  createActivityStore,
  createActivityExecution,
  activityExecution,
} from "@isle/extension-host/services/activity";
import { isJsonValue } from "@earendil-works/chord";
import type {
  ExtensionSource,
  ExtensionToolResult,
  JsonValue,
} from "@isle/extension-host";
import type { ExtensionBindings } from "@isle/extension-host";
import { extensionToolName } from "@isle/extension-host";
import { Ajv } from "ajv";
import { statSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import entries from "../../../build-entries.json" with { type: "json" };
import {
  ProgramExecutor,
  resolveExecutionPolicy,
} from "../../security/execution/index.js";
import {
  checkExecution,
  DEFAULT_AGENT_PERMISSION_MODE,
  resolveSafetyPolicy,
} from "../../security/safety/index.js";
import { resolveAgentAccess } from "../../security/access/index.js";
import type {
  AgentRunCommand,
  AgentRuntimeContext,
} from "../../engines/drivers/native/agent/runtimes/types.js";
import {
  createExtensionStateStore,
  validateExtensionState,
  type ExtensionState,
} from "../session/state.js";
import { validateExtensionResult } from "@isle/extension-host/agent/resources";
import type { ExtensionCatalog } from "@isle/extension-host";
import { ExtensionSessionPool } from "../session/pool.js";
import {
  validateMiddlewareOutcome,
  validateMiddlewareData,
} from "@isle/extension-host/agent/middleware";
import { validateExtensionEvent } from "@isle/extension-host/agent/events";
import type {
  ExtensionMiddlewareType,
  ExtensionMiddlewareData,
  ExtensionMiddlewareOutcome,
} from "@isle/extension-host";

export interface ExtensionRunResources extends ExtensionBindings {
  readonly available: boolean;
  /** Stop the worker while retaining the session reservation for terminal recovery. */
  invalidate(): Promise<void>;
  dispose(): Promise<void>;
}

export async function createExtensionRunResources(
  sources: readonly ExtensionSource[],
  command: AgentRunCommand,
  context: AgentRuntimeContext,
  sessions?: ExtensionSessionPool,
): Promise<ExtensionRunResources> {
  context.signal?.throwIfAborted();
  sessions?.signal.throwIfAborted();
  const mode = command.permissions?.mode ?? DEFAULT_AGENT_PERMISSION_MODE;
  const access =
    command.agentAccess === undefined
      ? undefined
      : resolveAgentAccess(command.agentAccess, command);
  const safety = resolveSafetyPolicy(mode, command.workspacePath);
  const execution = resolveExecutionPolicy(
    mode,
    command.workspacePath,
    undefined,
    undefined,
    access
      ? { access, programPaths: sources.map((source) => dirname(source.entry)) }
      : undefined,
  );
  const stateStore = await createExtensionStateStore(command.sessionRootDir);
  const hostCapabilities = [
    "configuration.read",
    ...(command.sessionRootDir
      ? ["activity.publish", "activity.checkpoint"]
      : []),
    ...(context.callbacks.runExtensionTask ? ["tasks.run"] : []),
  ];
  if (stateStore.directory && execution.sandbox) {
    execution.sandbox.filesystem.denyRead.push(stateStore.directory);
    execution.sandbox.filesystem.denyWrite.push(stateStore.directory);
  }
  const create = async (signal?: AbortSignal) => {
    const worker = new ProgramExecutor({
      policy: execution,
      program: {
        executable: process.execPath,
        args: [
          fileURLToPath(
            new URL(entries.extensionWorker.output, import.meta.url),
          ),
        ],
      },
    });
    try {
      const catalog = await worker.call<ExtensionCatalog>(
        "initialize",
        { sources, workspacePath: command.workspacePath, hostCapabilities },
        signal,
        undefined,
        60_000,
      );
      return { worker, catalog };
    } catch (error) {
      await worker.dispose();
      throw error;
    }
  };
  const lease =
    sessions && stateStore.directory
      ? await sessions.acquire(
          stateStore.directory,
          JSON.stringify({
            sources,
            hostCapabilities,
            execution,
            entries: sources.map(({ entry }) => {
              const stat = statSync(entry);
              return [stat.size, stat.mtimeMs, stat.ctimeMs];
            }),
          }),
          create,
          context.signal,
        )
      : undefined;
  const operationSignal = AbortSignal.any([
    ...(context.signal ? [context.signal] : []),
    ...(sessions ? [sessions.signal] : []),
  ]);
  const instance = lease ?? (await create(operationSignal));
  const worker = instance.worker;
  const lifetime = new AbortController();
  const runSignal = AbortSignal.any([lifetime.signal, operationSignal]);
  const dispose = async () => {
    lifetime.abort();
    if (lease) await lease.release();
    else await worker.dispose();
  };
  try {
    runSignal.throwIfAborted();
    const available = instance.catalog;
    const allowedTools = command.resources?.tools?.allowed;
    const enabledSkills = command.resources?.skills?.enabled;
    const catalog: ExtensionCatalog = {
      middleware: available.middleware,
      commands: available.commands,
      subscriptions: available.subscriptions,
      tools: available.tools.filter(
        (tool) => allowedTools == null || allowedTools.includes(tool.name),
      ),
      skills: available.skills.filter(
        (skill) => enabledSkills == null || enabledSkills.includes(skill.id),
      ),
    };
    const ajv = new Ajv({ allErrors: true });
    const validators = new Map(
      catalog.tools.map((tool) => [tool.name, ajv.compile(tool.parameters)]),
    );
    const risks = new Map(
      sources.flatMap((source) =>
        Object.entries(source.toolRisks ?? {}).map(
          ([name, risk]) => [extensionToolName(source.id, name), risk] as const,
        ),
      ),
    );
    const commandValidators = new Map(
      catalog.commands.map((entry) => [
        entry.id,
        ajv.compile(entry.parameters),
      ]),
    );
    const commandRisks = new Map(
      sources.flatMap((source) =>
        Object.entries(source.commandRisks ?? {}).map(
          ([name, risk]) => [`${source.id}/${name}`, risk] as const,
        ),
      ),
    );
    const calls = new Set<string>();
    let waitingCount = 0;
    const waitingListeners = new Set<() => void>();
    const suspension = {
      get active() {
        return waitingCount > 0;
      },
      subscribe(listener: () => void) {
        waitingListeners.add(listener);
        return () => {
          waitingListeners.delete(listener);
        };
      },
    };
    const transact = <T>(
      extensionId: string,
      method: string,
      input: object,
      signal: AbortSignal,
      progress?: (value: unknown) => void,
      validate?: (value: T) => T,
    ) =>
      stateStore.transact(extensionId, signal, async (state) => {
        const selected = Object.hasOwn(state, extensionId)
          ? { [extensionId]: state[extensionId] }
          : {};
        const source = sources.find((item) => item.id === extensionId)!;
        const controller = new AbortController();
        const budget = createActiveDeadline(
          [
            ...(source.host?.required ?? []),
            ...(source.host?.optional ?? []),
          ].includes("tasks.run")
            ? 10 * 60_000
            : 60_000,
        );
        const invocationSignal = AbortSignal.any([signal, budget.signal]);
        const serviceSignal = AbortSignal.any([
          invocationSignal,
          controller.signal,
        ]);
        const activityStore = command.sessionRootDir
          ? createActivityStore(command.sessionRootDir, extensionId)
          : undefined;
        let waitingDepth = 0;
        const activity = activityStore
          ? createActivityExecution(
              activityStore,
              command.taskId,
              serviceSignal,
              (active) => {
                waitingDepth += active ? 1 : -1;
                waitingCount += active ? 1 : -1;
                if (waitingDepth > 0) budget.pause();
                else budget.resume();
                for (const listener of waitingListeners) listener();
              },
              (record) =>
                context.emit({
                  type: "extension_activity",
                  taskId: command.taskId,
                  ...activityExecution(extensionId, record),
                }),
            )
          : undefined;
        const services = new ExtensionHost({
          "configuration.read": async () =>
            structuredClone(source.config ?? {}),
          ...(activity
            ? {
                "activity.publish": (value) => activity.publish(value),
                "activity.checkpoint": ({ id }) => activity.checkpoint(id),
              }
            : {}),
          ...(context.callbacks.runExtensionTask
            ? {
                "tasks.run": (input) =>
                  runExtensionTask(input, command, context, serviceSignal),
              }
            : {}),
        });
        const requests = new Set<Promise<void>>();
        let succeeded = false;
        let reply: { value: T; state: ExtensionState };
        try {
          reply = await worker.call<{ value: T; state: ExtensionState }>(
            method,
            { ...input, state: selected },
            invocationSignal,
            (update: unknown) => {
              if (
                !update ||
                typeof update !== "object" ||
                !("kind" in update) ||
                update.kind !== "host_call"
              ) {
                progress?.(update);
                return;
              }
              if (
                !("id" in update) ||
                typeof update.id !== "string" ||
                !("method" in update) ||
                typeof update.method !== "string" ||
                !("input" in update)
              )
                throw new Error("无效的宿主能力请求");
              const request = {
                id: update.id,
                method: update.method,
                input: update.input,
              };
              const work = (async () => {
                let result: unknown,
                  error: { message: string; code: string } | undefined;
                try {
                  result = await services.invoke(
                    request.method,
                    request.input,
                    source.host,
                    {
                      target: {
                        workspacePath: command.workspacePath,
                        chatId: command.taskId,
                      },
                      extensionId,
                      signal: serviceSignal,
                    },
                  );
                } catch (caught) {
                  error = {
                    message:
                      caught instanceof Error ? caught.message : String(caught),
                    code:
                      caught &&
                      typeof caught === "object" &&
                      "code" in caught &&
                      typeof caught.code === "string"
                        ? caught.code
                        : "HOST_FAILED",
                  };
                }
                if (!serviceSignal.aborted && !worker.disposed)
                  await worker.call(
                    "host_reply",
                    { id: request.id, result, error },
                    serviceSignal,
                  );
              })().catch(() => undefined);
              requests.add(work);
              void work.finally(() => requests.delete(work));
            },
            0,
          );
          succeeded = true;
        } catch (error) {
          if (budget.signal.aborted && !signal.aborted)
            throw budget.signal.reason;
          throw error;
        } finally {
          budget.dispose();
          controller.abort();
          await Promise.allSettled(requests);
          await activity?.finish(
            signal.aborted ? "cancelled" : succeeded ? "completed" : "failed",
          );
        }

        const next = validateExtensionState(reply.state);
        if (Object.keys(next).some((id) => id !== extensionId))
          throw new Error("插件尝试修改其他插件状态");
        if (!isJsonValue(reply.value))
          throw new Error("插件返回了无效的 JSON 结果");
        const value = validate ? validate(reply.value) : reply.value;
        if (Object.hasOwn(next, extensionId))
          Object.defineProperty(state, extensionId, {
            value: next[extensionId],
            writable: true,
            enumerable: true,
            configurable: true,
          });
        else delete state[extensionId];
        return { value, state };
      });
    const authorize = async (
      name: string,
      input: unknown,
      callId: string,
      signal: AbortSignal,
      kind: "tool" | "command",
    ) => {
      signal.throwIfAborted();
      const validate = (kind === "tool" ? validators : commandValidators).get(
        name,
      );
      if (!validate)
        throw new Error(
          `插件${kind === "tool" ? "工具" : "命令"}未启用：${name}`,
        );
      const args = structuredClone(input);
      if (
        !isJsonValue(args) ||
        args === null ||
        typeof args !== "object" ||
        Array.isArray(args) ||
        !validate(args)
      )
        throw new Error(
          `插件${kind === "tool" ? "工具" : "命令"}参数无效：${name}：${ajv.errorsText(validate.errors)}`,
        );
      if (!callId || calls.has(callId))
        throw new Error("插件调用 ID 为空或重复；不会自动重放调用");
      calls.add(callId);
      const risk = (kind === "tool" ? risks : commandRisks).get(name);
      const result = await checkExecution({
        request: {
          executionId: callId,
          entry: name,
          input: args,
          workspacePath: command.workspacePath,
        },
        policy: safety,
        access,
        signal,
        analyze: () =>
          risk
            ? { coverage: "complete", operations: [{ kind: "tool", risk }] }
            : { coverage: "unknown", operations: [] },
        requestApproval:
          context.callbacks.requestApproval &&
          ((request) =>
            context.callbacks.requestApproval!({
              ...request,
              taskId: command.taskId,
            })),
      });
      if (!result.allowed) throw new Error(result.reason ?? "插件调用未获授权");
      signal.throwIfAborted();
      return args;
    };
    return {
      protocolVersion: 1,
      suspension,
      // Callers receive a snapshot; changing it cannot alter the execution allowlist.
      catalog: structuredClone(catalog),
      get available() {
        return !worker.disposed && !runSignal.aborted;
      },
      async invalidate() {
        lifetime.abort();
        await worker.dispose();
      },
      async intercept<T extends ExtensionMiddlewareType>(
        type: T,
        input: ExtensionMiddlewareData[T],
        options?: { signal?: AbortSignal },
      ): Promise<ExtensionMiddlewareOutcome<T>> {
        const signal = options?.signal
          ? AbortSignal.any([options.signal, runSignal])
          : runSignal;
        signal.throwIfAborted();
        let value = validateMiddlewareData(type, input);
        for (const handler of catalog.middleware) {
          if (handler.type !== type) continue;
          const checked = await transact<ExtensionMiddlewareOutcome<T>>(
            handler.extensionId,
            "middleware",
            { name: handler.id, input: value },
            signal,
            undefined,
            (reply) => validateMiddlewareOutcome(type, value, reply),
          );
          if (checked.action === "block") return checked;
          value = checked.value;
        }
        signal.throwIfAborted();
        return { action: "continue", value };
      },
      async execute(name, input, options) {
        const signal = options.signal
          ? AbortSignal.any([options.signal, runSignal])
          : runSignal;
        const args = await authorize(
          name,
          input,
          options.callId,
          signal,
          "tool",
        );
        const tool = catalog.tools.find((entry) => entry.name === name)!;
        const value = await transact<ExtensionToolResult>(
          tool.id.split("/")[0],
          "execute",
          { name, input: args, callId: options.callId },
          signal,
          (update: unknown) =>
            options.progress?.(validateExtensionResult(update)),
        );
        return validateExtensionResult(value);
      },
      async command(id, input, options) {
        const signal = options.signal
          ? AbortSignal.any([options.signal, runSignal])
          : runSignal;
        const args = await authorize(
          id,
          input,
          options.callId,
          signal,
          "command",
        );
        return transact<JsonValue>(
          id.split("/")[0],
          "command",
          { name: id, input: args, callId: options.callId },
          signal,
        );
      },
      async notify(event) {
        if (runSignal.aborted) return;
        event = validateExtensionEvent(event);
        for (const subscription of catalog.subscriptions) {
          if (!subscription.events.includes(event.type)) continue;
          try {
            await transact<null>(
              subscription.extensionId,
              "event",
              { extensionId: subscription.extensionId, event },
              runSignal,
            );
          } catch (error) {
            if (runSignal.aborted) return;
            const diagnostic = {
              extensionId: subscription.extensionId,
              eventType: event.type,
              taskId: event.taskId,
              message: error instanceof Error ? error.message : String(error),
            };
            try {
              if (context.callbacks.onExtensionError)
                context.callbacks.onExtensionError(diagnostic);
              else console.error("Extension observer failed", diagnostic);
            } catch (reportError) {
              console.error(
                "Extension diagnostic callback failed",
                reportError,
              );
            }
          }
        }
      },
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
