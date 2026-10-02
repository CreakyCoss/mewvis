import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";

export const name = "mewvis-fixture-portable";
export const inject = ["tools", "skills", "settings"];

const skill = {
  name: "mewvis-dsh-echo",
  description: "Exercise an embedded DSH skill inside the Mewvis compatibility host.",
  content: "Call the mewvis_dsh_echo tool and preserve the user's message.",
  source: "bundled",
};

export function apply(ctx) {
  const settings = ctx.settings.register(
    "mewvis-fixture-portable",
    z.object({
      prefix: z.string().default("echo"),
    }),
    { applies: "live" },
  );
  ctx.skills.register(skill);
  ctx.tools.register(
    defineTool({
      name: "mewvis_dsh_echo",
      description: "Echo a message through a real DeepSeek Harness tool definition.",
      parameters: {
        message: {
          type: "string",
          required: true,
          description: "Message to echo.",
        },
        prefix: {
          type: "string",
          description: "Optional persisted prefix used by later calls.",
        },
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      async execute({ message, prefix }) {
        if (prefix) await settings.update({ prefix });
        return `${settings.get().prefix}:${message}`;
      },
    }),
  );
}
