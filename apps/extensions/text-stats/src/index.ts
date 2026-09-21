import { defineExtension } from "@isle/extension-sdk";

export default defineExtension({
  id: "isle.example",
  apiVersion: 1,
  setup(ctx) {
    // Private to this live session instance; reset after release, reload or cancellation.
    let calls = 0;
    ctx.registerTool({
      name: "text_stats",
      label: "插件文本统计",
      description: "统计文本的 Unicode 字符数和行数。",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      async execute(input, { signal, progress }) {
        signal.throwIfAborted();
        progress({ content: [{ type: "text", text: "正在统计文本" }], details: {} });
        const text = input.text as string;
        const details = {
          characters: [...text].length,
          lines: text ? text.split(/\r\n|\r|\n/).length : 0,
          calls: ++calls,
        };
        return { content: [{ type: "text", text: JSON.stringify(details) }], details };
      },
    });
    ctx.registerSkill({
      name: "text_stats",
      description: "需要精确统计文本时使用工具。",
      content: "统计文本时调用 ext_isle_example__text_stats，直接报告工具返回的 characters 和 lines，不要估算。",
    });
  },
});
