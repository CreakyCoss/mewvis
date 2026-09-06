import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { defineTool } from "@isle/plugin-sdk";
import type { TextInspection } from "../contracts";

export default [
  defineTool({
    name: "__TOOL_NAME__",
    description:
      "在宿主 Node 环境分析文本，返回字符数、UTF-8 字节数和 SHA-256。",
    parameters: {
      type: "object",
      properties: { text: { type: "string", minLength: 1, maxLength: 2000 } },
      required: ["text"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          text: { type: "string" },
          characters: { type: "integer" },
          bytes: { type: "integer" },
          sha256: { type: "string" },
          runtime: { type: "string", enum: ["node"] },
        },
        required: ["text", "characters", "bytes", "sha256", "runtime"],
        additionalProperties: false,
      },
      render: (_args: unknown, value: unknown) => [
        { type: "text", text: JSON.stringify(value, null, 2) },
      ],
    },
    execute(args): TextInspection {
      const text = (args as { text?: unknown } | null)?.text;
      if (
        typeof text !== "string" ||
        !text.length ||
        Array.from(text).length > 2000
      )
        throw new Error("请输入 1–2000 个字符");
      return {
        text,
        characters: Array.from(text).length,
        bytes: Buffer.byteLength(text),
        sha256: createHash("sha256").update(text).digest("hex"),
        runtime: "node",
      };
    },
  }),
];
