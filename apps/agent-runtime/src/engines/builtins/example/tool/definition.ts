import { z } from "zod";
import type { BuiltinToolDefinition } from "../../definition.js";
import { TEXT_STATS_CONTRACT } from "../protocol.js";
import { createTextStatsService } from "./service.js";

const inputSchema = z.object({ text: z.string() }).strict();

export const EXAMPLE_TOOL = {
  name: "example_text_stats",
  label: "文本统计示例",
  risk: "low",
  description: "统计给定文本，不读写文件。仅作内置工具定义示例。",
  contract: TEXT_STATS_CONTRACT,
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "要统计的完整文本，保留空格与换行" },
    },
  },
  createImplementation() {
    const api = createTextStatsService();
    return {
      api,
      async execute(input) {
        return api.inspect(inputSchema.parse(input));
      },
    };
  },
} as const satisfies BuiltinToolDefinition<typeof TEXT_STATS_CONTRACT>;
