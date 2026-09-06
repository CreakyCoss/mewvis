import { definePlugin, defineTool } from "@isle/plugin-sdk";
export default definePlugin({
  name: "@isle-test/chat-client",
  inject: ["tools", "chat"],
  apply(ctx) {
    ctx.tools.register(
      defineTool({
        name: "fixture_chat",
        description: "Exercise the headless SDK through the desktop host.",
        parameters: { type: "object", properties: {} },
        output: {
          schema: {
            type: "object",
            properties: { status: { type: "string" }, taskId: { type: "string" }, reason: { type: "string" } },
            required: ["status"],
            additionalProperties: false,
          },
          render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
        },
        async execute() {
          const session = await ctx.chat.createSession({
            workspaceId: "workspace",
            sceneId: "debug",
            profile: { id: "fixture", systemPrompt: "Business context", useKnowledge: true },
          });
          const result = await session.send({ text: "from native plugin" });
          await session.stop();
          await session.close();
          return result;
        },
      }),
    );
  },
});
