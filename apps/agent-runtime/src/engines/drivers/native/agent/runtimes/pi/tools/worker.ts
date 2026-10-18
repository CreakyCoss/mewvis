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
import { createPiShellTool } from "./shell.js";

type Tool = Parameters<ExtensionAPI["registerTool"]>[0];
let tools: Tool[] = [];
let initialized = false;

serveWorker({
  async execute(method, input, context) {
    if (method === "initialize") {
      if (initialized) throw new Error("工具进程已经初始化。");
      initialized = true;
      const command = input as RuntimeAgentCommand;
      const builtins = resolveBuiltins(
        command.resources?.skills?.enabled ?? [],
      );
      const collector: Pick<ExtensionAPI, "registerTool"> = {
        registerTool: (tool) => tools.push(tool as Tool),
      };
      tools = [
        createReadTool,
        createEditTool,
        createWriteTool,
        createLsTool,
        createFindTool,
        createGrepTool,
      ].map((create) => create(command.workspacePath) as Tool);
      const shell = createPiShellTool(command.workspacePath);
      if (shell) tools.push(shell as Tool);
      for (const tool of builtins.requiredTools.internal)
        registerPiBuiltinTool(collector, tool, {
          workspacePath: command.workspacePath,
        });
      const toolRisks = new Map([
        ...builtins.requiredTools.internal.map(
          (tool) => [tool.name, tool.risk] as const,
        ),
      ]);
      return {
        tools: tools.map(({ name, label, description, parameters }) => ({
          name,
          label,
          description,
          parameters,
          risk: toolRisks.get(name),
        })),
      };
    }
    if (method === "execute") {
      if (!initialized) throw new Error("工具进程尚未初始化。");
      const call = input as {
        callId: string;
        name: string;
        arguments: Record<string, unknown>;
      };
      const tool = tools.find((tool) => tool.name === call.name);
      if (!tool) throw new Error("工具不在执行目录中。");
      const result = await tool.execute(
        call.callId,
        call.arguments,
        context.signal,
        context.progress,
        {} as never,
      );
      // Pi uses the same omission note for missing image dependencies, invalid
      // image bytes and resize failures. It is not evidence of a size violation.
      if (
        call.name === "read" &&
        result.content.some(
          (part) =>
            part.type === "text" &&
            part.text.startsWith("Read image file [") &&
            part.text.includes(
              "[Image omitted: could not be resized below the inline image size limit.]",
            ),
        )
      )
        throw new Error(
          "图片处理失败：图片解码或缩放未成功，未向模型附加图像数据。请检查图片内容及 Runtime 图像处理组件；此错误不代表图片体积超限。",
        );
      return result;
    }
    throw new Error("未知工具进程请求。");
  },
  async dispose() {
    tools = [];
  },
});
