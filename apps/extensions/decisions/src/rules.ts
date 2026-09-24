import { z } from "zod";

export const ruleSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,24}$/),
    name: z.string().trim().min(1).max(64),
    enabled: z.boolean(),
    priority: z.number().int().min(0).max(100),
    when: z.string().trim().min(1).max(1000),
    instructions: z.string().trim().min(1).max(8000),
    threshold: z.number().min(0).max(1),
  })
  .strict();
export type Rule = z.infer<typeof ruleSchema>;
export function readRules(config: unknown): Rule[] {
  const parsed = z
    .object({ rules: z.array(ruleSchema).max(32) })
    .strict()
    .safeParse(config);
  if (!parsed.success)
    throw new Error(
      "请填写规则名称、适用条件、判断标准，以及有效的优先级和阈值。",
    );
  if (
    new Set(parsed.data.rules.map((rule) => rule.id)).size !==
    parsed.data.rules.length
  )
    throw new Error("规则标识不能重复。");
  return parsed.data.rules;
}
