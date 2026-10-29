import type { Issue } from "../../shared/contracts";
import { patternNames, type DoudizhuModel } from "./model";
export function validateDoudizhuCore(input: unknown, draft = false): Issue[] {
  const errors: Issue[] = [],
    add = (message: string) => errors.push({ path: "斗地主规则", message });
  if (!input || typeof input !== "object" || Array.isArray(input))
    return [{ path: "策划", message: "斗地主模型无效。" }];
  const m = input as DoudizhuModel,
    r = m.rules;
  if (
    Object.keys(m).some(
      (key) =>
        ![
          "format",
          "id",
          "name",
          "description",
          "rules",
          "extensions",
          "composition",
        ].includes(key),
    )
  )
    add("包含当前不支持的模型字段。");
  if (!draft && typeof m.name === "string" && !m.name.trim())
    add("项目名称不能为空。");
  if (
    m.format !== "gameplay-doudizhu-v1" ||
    typeof m.id !== "string" ||
    !/^[\w-]{1,100}$/.test(m.id) ||
    typeof m.name !== "string" ||
    m.name.length > 60 ||
    typeof m.description !== "string" ||
    m.description.length > 4000
  )
    add("项目名称、说明或模型格式无效。");
  if (!r || typeof r !== "object" || Array.isArray(r)) {
    add("缺少规则配置。");
    return errors;
  }
  if (
    Object.keys(r).some(
      (key) =>
        ![
          "enabled",
          "straightMin",
          "pairChainMin",
          "tripleChainMin",
          "distinctSingles",
          "bombFactor",
          "baseScore",
        ].includes(key),
    )
  )
    add("包含当前不支持的出牌规则字段。");
  if (
    !Array.isArray(r.enabled) ||
    r.enabled.length > 14 ||
    new Set(r.enabled).size !== r.enabled.length ||
    r.enabled.some((k) => !Object.hasOwn(patternNames, k)) ||
    !r.enabled.includes("single")
  )
    add("牌型必须唯一且受支持，单张为必要牌型。");
  for (const [key, min, max] of [
    ["straightMin", 3, 12],
    ["pairChainMin", 2, 10],
    ["tripleChainMin", 2, 6],
    ["bombFactor", 1, 4],
    ["baseScore", 1, 100],
  ] as const)
    if (!Number.isInteger(r[key]) || r[key] < min || r[key] > max)
      add(key + " 超出支持范围。");
  if (typeof r.distinctSingles !== "boolean") add("带单规则无效。");
  try {
    if (
      JSON.stringify(JSON.parse(JSON.stringify(input))) !==
      JSON.stringify(input)
    )
      add("配置不能完整保存为 JSON。");
  } catch {
    add("配置不能保存为 JSON。");
  }
  return errors;
}
