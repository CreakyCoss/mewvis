import { defineBuiltinToolContract } from "../definition.js";

export interface TextStatsApi {
  inspect(input: { text: string }): Promise<{
    codePoints: number;
    utf8Bytes: number;
    lines: number;
  }>;
}

export const TEXT_STATS_CONTRACT = defineBuiltinToolContract<TextStatsApi>()({
  id: "example.text-stats",
  version: 1,
  properties: {},
  methods: {
    inspect: { description: "统计文本的 Unicode 码点数、UTF-8 字节数和行数" },
  },
});
