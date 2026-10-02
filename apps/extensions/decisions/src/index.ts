import { defineExtension } from "@mewvis/extension-sdk/agent";
import {
  decisionRequestSchema,
  type DecisionRequest,
} from "@mewvis/extension-sdk/host";
import { readRules } from "./rules";
import { evaluate, formatDecision } from "./evaluate";

export default defineExtension({
  id: "mewvis.decisions",
  apiVersion: 1,
  setup(ctx) {
    const rules = readRules(ctx.config);
    const run = (input: DecisionRequest, signal: AbortSignal) =>
      evaluate(input, rules, ctx.host, signal);
    ctx.provide("decisions.evaluate", (input, { signal }) =>
      run(input, signal),
    );
    ctx.registerTool({
      name: "evaluate",
      label: "智能判断",
      description:
        "根据材料和问题进行选择、评分或是非判断。仅提供材料、问题和输出约束；内部自动选择适用标准。需复核或弃答不能视为确定结论。",
      parameters: decisionRequestSchema,
      async execute(input, { signal }) {
        const result = await run(input as unknown as DecisionRequest, signal);
        return {
          content: [{ type: "text", text: formatDecision(result) }],
          details: result,
        };
      },
    });
    ctx.registerCommand({
      name: "evaluate",
      label: "智能判断",
      description: "提供材料、问题和输出约束，自动匹配内部判断规则。",
      parameters: decisionRequestSchema,
      async execute(input, { signal }) {
        const answer = await run(input as unknown as DecisionRequest, signal);
        return { text: formatDecision(answer), answer };
      },
    });
    const shortcuts: Array<{
      id: string;
      name: string;
      question: string;
      output: DecisionRequest["output"];
    }> = [
      {
        id: "classify",
        name: "需求分类",
        question: "用户需求的主要类型是什么？",
        output: {
          type: "choice",
          options: ["问题咨询", "功能开发", "故障排查", "内容创作", "其他"],
        },
      },
      {
        id: "quality",
        name: "方案评分",
        question: "评估方案的完整性与可执行性。",
        output: {
          type: "score",
          levels: ["不可执行", "缺少关键步骤", "基本可行", "完整可行"],
        },
      },
      {
        id: "ready",
        name: "执行条件判断",
        question: "需求是否具备可以开始实施的条件？",
        output: { type: "boolean" },
      },
    ];
    for (const item of shortcuts)
      ctx.registerCommand({
        name: item.id,
        label: item.name,
        inputMode: "text",
        description: item.question,
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["text"],
          properties: {
            text: { type: "string", minLength: 1, maxLength: 24000 },
          },
        },
        async execute(input, { signal }) {
          const answer = await run(
            {
              input: String(input.text),
              question: item.question,
              output: item.output,
            },
            signal,
          );
          return { text: formatDecision(answer), answer };
        },
      });
  },
});
