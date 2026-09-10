import {
  createReadTool,
  createEditTool,
  createWriteTool,
  createLsTool,
  createFindTool,
  createGrepTool,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { resolveBuiltins } from "../../../../../../builtins/index.js";
import { AGENT_TOOL_DEFINITIONS, normalizeAllowedAgentTools } from "../../../tools/definitions.js";
import { canonicalPath, containsPath } from "../../../../../../safety/paths.js";
import { DEFAULT_AGENT_PERMISSION_MODE, getAgentPermissionPolicy } from "../../../../../../safety/permissions.js";
import { allowedRuntimeTools, runtimeResourcesFor } from "../../resources.js";
import type { AgentRuntimeCallbacks, RuntimeAgentCommand } from "../../types.js";
import { createPluginRuntimeBridge } from "../plugins/bridge.js";
import { createPiSubagentRunner } from "../agent/subagent-session.js";
import type { PiAgentSessionOptions } from "../agent/session.js";
import { registerPiAskUserTool } from "./ask-user-tool.js";
import { registerPiBuiltinTool } from "./builtin-tool.js";
import { registerPiSubagentTool } from "./subagent.js";
import { loadPiSandboxConfig, registerPiSandbox, registerPiSandboxEvents } from "./sandbox.js";
import { installPiSafety } from "../safety.js";
import type { PiAgentSession } from "../agent/session.js";

type PiTool = Parameters<ExtensionAPI["registerTool"]>[0];

/** Assemble capabilities independently of the execution safety policy. */
export async function createPiToolSet(
  command: RuntimeAgentCommand,
  callbacks: AgentRuntimeCallbacks,
  options: PiAgentSessionOptions = {},
) {
  const mode = command.permissions?.mode ?? DEFAULT_AGENT_PERMISSION_MODE;
  const sandboxRequired = !getAgentPermissionPolicy(mode).allowUnsandboxed;
  const resourceInput = runtimeResourcesFor(command);
  const builtins = resolveBuiltins(resourceInput.skills?.enabled ?? []);
  const plugins = await createPluginRuntimeBridge(command);
  try {
    const reserved = new Set([
      ...AGENT_TOOL_DEFINITIONS.map((tool) => tool.name),
      ...builtins.requiredTools.internal.map((tool) => tool.name),
    ]);
    const pluginDefinitions = plugins?.toolDefinitions() ?? [];
    const pluginNames = pluginDefinitions.map((tool) => tool.name);
    const collisions = pluginNames.filter((name) => reserved.has(name));
    if (collisions.length) throw new Error(`插件工具不能覆盖 Isle Runtime 工具：${collisions.join(", ")}`);
    const available = new Set([...reserved, ...pluginNames]);
    const allocated = [
      ...normalizeAllowedAgentTools(allowedRuntimeTools(command)),
      ...pluginNames.filter((name) => !resourceInput.tools?.allowed || resourceInput.tools.allowed.includes(name)),
    ];
    const enabled = [...new Set(allocated)]
      .filter((name) => available.has(name))
      .filter((name) => !options.toolCeiling || options.toolCeiling.includes(name))
      .filter((name) => !options.subagent || (name !== "subagent" && name !== "ask_user"));

    const sandbox = structuredClone(
      options.sandboxConfig ?? loadPiSandboxConfig(command.workspacePath, undefined, !sandboxRequired),
    );
    sandbox.enabled = sandboxRequired;
    if (sandbox.enabled) {
      const baseline = loadPiSandboxConfig(command.workspacePath, undefined, true);
      sandbox.network = baseline.network;
      sandbox.filesystem = {
        allowWrite: sandbox.filesystem.allowWrite.flatMap((requested) =>
          baseline.filesystem.allowWrite.flatMap((allowed) => {
            const a = canonicalPath(allowed),
              r = canonicalPath(requested);
            return containsPath(a, r) ? [r] : containsPath(r, a) ? [a] : [];
          }),
        ),
        denyRead: [...new Set([...baseline.filesystem.denyRead, ...sandbox.filesystem.denyRead])],
        denyWrite: [...new Set([...baseline.filesystem.denyWrite, ...sandbox.filesystem.denyWrite])],
      };
    }

    const tools: PiTool[] = [
      createReadTool,
      createEditTool,
      createWriteTool,
      createLsTool,
      createFindTool,
      createGrepTool,
    ].map((createTool) => createTool(command.workspacePath) as PiTool);
    const collector: Pick<ExtensionAPI, "registerTool"> = {
      registerTool: (tool) => {
        tools.push(tool as PiTool);
      },
    };
    registerPiSandbox(collector, command.workspacePath, sandbox);
    if (!options.subagent)
      registerPiSubagentTool(collector, createPiSubagentRunner(command, callbacks, enabled, sandbox));
    registerPiAskUserTool(collector, command.taskId, callbacks.requestUserInput);
    for (const tool of builtins.requiredTools.internal)
      registerPiBuiltinTool(collector, tool, { workspacePath: command.workspacePath });
    plugins?.registerTools(collector);

    return {
      tools: tools.filter((tool) => enabled.includes(tool.name)),
      installSafety: (session: PiAgentSession) => installPiSafety(session, command, callbacks, sandbox.enabled),
      builtins,
      plugins,
      registerExtensions: (pi: ExtensionAPI) => registerPiSandboxEvents(pi, sandbox),
      dispose: () => plugins?.dispose() ?? Promise.resolve(),
    };
  } catch (error) {
    await plugins?.dispose();
    throw error;
  }
}
