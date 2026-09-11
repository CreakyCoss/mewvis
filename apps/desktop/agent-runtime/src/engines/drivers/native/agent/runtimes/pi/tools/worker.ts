import { readFile } from "node:fs/promises";
import {
  createReadTool,
  createEditTool,
  createWriteTool,
  createLsTool,
  createFindTool,
  createGrepTool,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { serveWorker } from "../../../../../../../security/execution/index.js";
import { resolveBuiltins } from "../../../../../../builtins/index.js";
import type { RuntimeAgentCommand } from "../../types.js";
import { registerPiBuiltinTool } from "./builtin-tool.js";
import { createPluginRuntimeBridge } from "../plugins/bridge.js";
import { createPiShellTool } from "./shell.js";

type Tool = Parameters<ExtensionAPI["registerTool"]>[0];
let tools: Tool[] = [];
let plugins: Awaited<ReturnType<typeof createPluginRuntimeBridge>>;
let initialized = false;

serveWorker({
  async execute(method, input, context) {
    if (method === "initialize") {
      if (initialized) throw new Error("工具进程已经初始化。");
      initialized = true;
      const command = input as RuntimeAgentCommand;
      const builtins = resolveBuiltins(command.resources?.skills?.enabled ?? []);
      const collector: Pick<ExtensionAPI, "registerTool"> = { registerTool: (tool) => tools.push(tool as Tool) };
      tools = [createReadTool, createEditTool, createWriteTool, createLsTool, createFindTool, createGrepTool].map(
        (create) => create(command.workspacePath) as Tool,
      );
      const shell = createPiShellTool(command.workspacePath);
      if (shell) tools.push(shell as Tool);
      for (const tool of builtins.requiredTools.internal)
        registerPiBuiltinTool(collector, tool, { workspacePath: command.workspacePath });
      plugins = await createPluginRuntimeBridge(command);
      plugins?.registerTools(collector);
      const skillContents = await Promise.all(
        (plugins?.skills ?? []).map(async (skill) => ({ skill, content: await readFile(skill.filePath, "utf8") })),
      );
      return {
        tools: tools.map(({ name, label, description, parameters }) => ({ name, label, description, parameters })),
        skillContents,
      };
    }
    if (method === "execute") {
      if (!initialized) throw new Error("工具进程尚未初始化。");
      const call = input as { callId: string; name: string; arguments: Record<string, unknown> };
      const tool = tools.find((tool) => tool.name === call.name);
      if (!tool) throw new Error("工具不在执行目录中。");
      return tool.execute(call.callId, call.arguments, context.signal, context.progress, {} as never);
    }
    throw new Error("未知工具进程请求。");
  },
  async dispose() {
    await plugins?.dispose();
  },
});
