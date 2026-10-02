import { roles } from "./roles";
import { defineExtension } from "@mewvis/extension-sdk/agent";
import { workflows, runWorkflow } from "./workflows";
export default defineExtension({
  id: "mewvis.collaboration",
  apiVersion: 1,
  setup(ctx) {
    const flows = workflows(ctx.config);
    const configuredRoles = roles(ctx.config);
    const parameters = {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: { text: { type: "string", minLength: 1, maxLength: 24000 } },
    };
    for (const flow of flows) {
      ctx.registerCommand({
        name: flow.id,
        label: flow.name,
        inputMode: "text",
        description: `协作 · ${flow.name}：${flow.description || `${flow.steps.length} 个步骤`}`,
        parameters,
        execute: (input, { signal }) =>
          runWorkflow(
            flow,
            String(input.text),
            configuredRoles,
            ctx.host,
            signal,
          ),
      });
      ctx.registerTool({
        name: flow.id,
        label: flow.name,
        description: `执行用户配置的协作流程“${flow.name}”。${flow.description}。步骤：${flow.steps.map((s) => s.name).join(" → ")}。仅当任务需要该流程时调用；不要调用其他未配置的流程。`,
        parameters,
        async execute(input, { signal }) {
          const result = await runWorkflow(
            flow,
            String(input.text),
            configuredRoles,
            ctx.host,
            signal,
          );
          return {
            content: [{ type: "text", text: result.text }],
            details: result,
          };
        },
      });
    }
  },
});
