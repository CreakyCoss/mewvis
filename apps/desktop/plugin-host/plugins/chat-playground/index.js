import { definePlugin, defineTool } from "@isle/plugin-sdk";

export default definePlugin({
  name: "@isle/chat-playground",
  inject: ["tools"],
  apply(ctx) {
    ctx.tools.register(
      defineTool({
        name: "chat_playground_echo",
        description: "回显一段测试文本及其字符数，用于检查插件工具调用。无文件、网络或模型调用。",
        parameters: {
          type: "object",
          properties: { text: { type: "string", minLength: 1, maxLength: 2000 } },
          required: ["text"],
          additionalProperties: false,
        },
        output: {
          schema: {
            type: "object",
            properties: { echo: { type: "string" }, characters: { type: "integer" } },
            required: ["echo", "characters"],
            additionalProperties: false,
          },
          render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
        },
        execute(args) {
          const text = args?.text;
          const extra = Object.keys(args ?? {}).find((key) => key !== "text");
          if (extra) throw new Error(`不支持的参数：${extra}`);
          if (typeof text !== "string" || !text.length || text.length > 2000) throw new Error("请输入 1–2000 个字符");
          return { echo: text, characters: Array.from(text).length };
        },
      }),
    );
  },
});
