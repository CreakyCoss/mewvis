import type { ExtensionAPI, Skill } from "@earendil-works/pi-coding-agent";
import { isRiskLevel } from "@isle/chat-contracts";
import { fileURLToPath } from "node:url";
import entries from "../../../../../../../../build-entries.json" with { type: "json" };
import { resolveBuiltins } from "../../../../../../builtins/index.js";
import { AGENT_TOOL_DEFINITIONS, normalizeAllowedAgentTools } from "../../../tools/definitions.js";
import {
  DEFAULT_AGENT_PERMISSION_MODE,
  resolveSafetyPolicy,
  type SafetyRisk,
} from "../../../../../../../security/safety/index.js";
import {
  ProgramExecutor,
  resolveExecutionPolicy,
  serializeWorkspaceOperation,
} from "../../../../../../../security/execution/index.js";
import { allowedRuntimeTools, runtimeResourcesFor } from "../../resources.js";
import type { AgentRuntimeCallbacks, RuntimeAgentCommand } from "../../types.js";
import { createPiSubagentRunner } from "../agent/subagent-session.js";
import type { PiAgentSessionOptions, PiAgentSession } from "../agent/session.js";
import { registerPiAskUserTool } from "./ask-user-tool.js";
import { registerPiSubagentTool } from "./subagent.js";
import { installPiSafety } from "./safety.js";
import { accessAllowsPath, resolveAgentAccess } from "../../../../../../../security/access/index.js";

type PiTool = Parameters<ExtensionAPI["registerTool"]>[0];
type Catalog = {
  tools: (Pick<PiTool, "name" | "label" | "description" | "parameters"> & { risk?: SafetyRisk })[];
  skillContents: { skill: Skill; content: string }[];
};

/** Agent control stays in the host; effectful implementations run in the configured execution worker. */
export async function createPiToolSet(
  command: RuntimeAgentCommand,
  callbacks: AgentRuntimeCallbacks,
  options: PiAgentSessionOptions = {},
) {
  const mode = command.permissions?.mode ?? DEFAULT_AGENT_PERMISSION_MODE;
  const resources = structuredClone(runtimeResourcesFor(command));
  const access =
    options.policies?.access ??
    (command.agentAccess === undefined
      ? undefined
      : resolveAgentAccess(command.agentAccess, {
          workspacePath: command.workspacePath,
        }));
  if (options.policies && access && !options.policies.execution.access)
    throw new Error("继承的执行策略缺少当前请求的访问范围。");
  if (
    access &&
    resources.plugins?.settingsPath &&
    !accessAllowsPath(access.filesystem.read, resources.plugins.settingsPath)
  )
    delete resources.plugins.settingsPath;
  // Safety rules are an immutable host snapshot containing functions. Only execution data is cloned.
  const policies = options.policies
    ? { safety: options.policies.safety, execution: structuredClone(options.policies.execution), access }
    : {
        safety: resolveSafetyPolicy(mode, command.workspacePath),
        execution: resolveExecutionPolicy(
          mode,
          command.workspacePath,
          undefined,
          undefined,
          access ? { access, programPaths: resources.plugins?.items?.map((plugin) => plugin.packageRoot) } : undefined,
        ),
        access,
      };
  const builtins = resolveBuiltins(resources.skills?.enabled ?? []);
  // The host selected these enabled plugins. Initialization uses the same constrained worker as tool execution.
  let worker: ProgramExecutor | undefined;
  let starting: Promise<Catalog> | undefined;
  let disposed = false;
  const initialize = async (signal = options.signal) => {
    signal?.throwIfAborted();
    if (disposed) throw new Error("工具资源已释放。");
    if (!worker || worker.disposed) {
      worker = new ProgramExecutor({
        policy: policies.execution,
        program: {
          executable: process.execPath,
          args: [fileURLToPath(new URL(entries.piToolWorker.output, import.meta.url))],
        },
      });
      starting = worker.call<Catalog>(
        "initialize",
        { workspacePath: command.workspacePath, resources },
        signal,
        undefined,
        60_000,
      );
    }
    return starting!;
  };
  try {
    const catalog = await initialize();
    const names = catalog.tools.map((tool) => tool.name);
    if (new Set(names).size !== names.length || names.includes("ask_user") || names.includes("subagent"))
      throw new Error("插件工具不能覆盖 Isle Runtime 工具。");
    const baseNames = new Set([
      ...AGENT_TOOL_DEFINITIONS.map((tool) => tool.name),
      ...builtins.requiredTools.internal.map((tool) => tool.name),
    ]);
    const pluginNames = names.filter((name) => !baseNames.has(name));
    const allocated = [
      ...normalizeAllowedAgentTools(allowedRuntimeTools(command)),
      ...pluginNames.filter((name) => !resources.tools?.allowed || resources.tools.allowed.includes(name)),
    ];
    const enabled = [...new Set(allocated)]
      .filter((name) => names.includes(name) || name === "subagent" || name === "ask_user")
      .filter((name) => !options.toolCeiling || options.toolCeiling.includes(name))
      .filter((name) => !options.subagent || (name !== "subagent" && name !== "ask_user"));
    const builtinNames = new Set(builtins.requiredTools.internal.map((tool) => tool.name));
    const toolRisks = new Map<string, SafetyRisk>();
    for (const tool of catalog.tools) {
      if (tool.risk === undefined || !enabled.includes(tool.name)) continue;
      if (!isRiskLevel(tool.risk)) throw new Error(`工具 ${tool.name} 的风险声明无效`);
      toolRisks.set(tool.name, tool.risk);
    }
    const tools: PiTool[] = catalog.tools
      .filter((tool) => enabled.includes(tool.name))
      .map(({ risk: _risk, ...descriptor }) => ({
        ...descriptor,
        execute: async (callId, args, signal, progress) => {
          signal?.throwIfAborted();
          await initialize(signal);
          signal?.throwIfAborted();
          const parameters = args as Record<string, unknown>;
          const timeout =
            (descriptor.name === "bash" || descriptor.name === "powershell") &&
            typeof parameters.timeout === "number" &&
            Number.isFinite(parameters.timeout) &&
            parameters.timeout > 0
              ? parameters.timeout * 1000
              : 0;
          const execute = () =>
            worker!.call<Awaited<ReturnType<PiTool["execute"]>>>(
              "execute",
              { callId, name: descriptor.name, arguments: args },
              signal,
              progress,
              timeout,
            );
          return builtinNames.has(descriptor.name)
            ? serializeWorkspaceOperation(policies.execution.workspacePath, signal, execute)
            : execute();
        },
      }));
    const collector: Pick<ExtensionAPI, "registerTool"> = {
      registerTool: (tool) => {
        if (enabled.includes(tool.name)) tools.push(tool as PiTool);
      },
    };
    if (!options.subagent)
      registerPiSubagentTool(collector, createPiSubagentRunner(command, callbacks, enabled, policies));
    registerPiAskUserTool(collector, command.taskId, callbacks.requestUserInput);
    return {
      tools,
      access,
      builtins,
      plugins: {
        skills: catalog.skillContents.map(({ skill }) => skill),
        registerSkills(pi: ExtensionAPI, resolvedSkills: readonly Skill[]) {
          const paths = new Set(resolvedSkills.map((skill) => skill.filePath));
          const contents = catalog.skillContents.filter(
            ({ skill }) => !skill.disableModelInvocation && paths.has(skill.filePath),
          );
          pi.on("before_agent_start", (event) => {
            if ((!access && pi.getActiveTools().includes("read")) || !contents.length) return;
            return {
              systemPrompt: [
                event.systemPrompt,
                "已加载插件技能；执行仍遵守当前权限配置。",
                ...contents.map(({ content }) => content),
              ].join("\n\n"),
            };
          });
        },
      },
      installSafety: (session: PiAgentSession) =>
        installPiSafety(session, command, callbacks, policies.safety, policies.access, toolRisks),
      registerExtensions(pi: ExtensionAPI) {
        pi.on("user_bash", () => {
          throw new Error("请通过已分配的 Shell 工具调用统一执行程序。");
        });
      },
      async dispose() {
        disposed = true;
        await worker?.dispose();
      },
    };
  } catch (error) {
    disposed = true;
    await worker?.dispose();
    throw error;
  }
}
