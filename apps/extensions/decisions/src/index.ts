import { defineExtension } from "@isle/extension-sdk/agent";
import { readProfiles } from "./profiles";
import { evaluate } from "./evaluate";

export default defineExtension({
  id: "isle.decisions",
  apiVersion: 1,
  setup(ctx) {
    const parameters = {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: { text: { type: "string", minLength: 1, maxLength: 24000 } },
    };
    for (const profile of readProfiles(ctx.config)) {
      const description = `智能判断 · ${profile.name}：${profile.instructions}。仅返回判断，不执行后续操作；需复核或弃答时不要当作确定结论。`;
      ctx.registerCommand({
        name: profile.id,
        label: profile.name,
        inputMode: "text",
        description,
        parameters,
        execute: (input, { signal }) =>
          evaluate(profile, String(input.text), ctx.host, signal),
      });
      ctx.registerTool({
        name: profile.id,
        label: profile.name,
        description,
        parameters,
        async execute(input, { signal }) {
          const result = await evaluate(
            profile,
            String(input.text),
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
