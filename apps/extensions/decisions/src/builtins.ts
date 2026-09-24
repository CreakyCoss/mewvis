import type { Rule } from "./rules";

/** Implementation-owned policies; never part of the caller's request. */
export const builtinRules: readonly Rule[] = [
  {
    id: "readiness",
    name: "执行条件",
    when: "问题是在判断需求是否清晰、材料是否充分、是否具备开始实施的条件。",
    instructions:
      "检查目标、对象、必要约束和验收要求是否清楚。缺少关键前提时不能判定已具备条件。",
  },
  {
    id: "quality",
    name: "方案质量",
    when: "问题是在评价方案、计划或设计的完整性与可执行性。",
    instructions:
      "根据目标、实施步骤、约束、风险和验证方法评估方案；不要将文字长度或表达流畅等同于质量。",
  },
  {
    id: "classification",
    name: "意图分类",
    when: "问题是将请求、文档或内容归入指定的类别，或判断其主要意图。",
    instructions:
      "根据材料的主要目标匹配调用方给出的类别；不要扩充类别。多个类别都适用时选择主导意图，无法区分时弃答。",
  },
  {
    id: "relevance",
    name: "资料相关性",
    when: "问题是在判断给出的资料是否与某个查询或任务相关，是否有助于回答。",
    instructions:
      "区分词语相似与内容相关；优先考虑是否直接回答问题、是否提供具体依据，注意范围和前提是否一致。",
  },
  {
    id: "evidence",
    name: "证据支持",
    when: "问题是在判断原文、引用或测试记录是否支持给出的结论。",
    instructions:
      "只根据给出的证据判断，区分直接支持、矛盾与未涉及；未发现反证不等于已得到支持。",
  },
].map((rule) => ({ ...rule, enabled: true, priority: 0, threshold: 0.7 }));
