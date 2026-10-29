import { copy } from "../../shared/utils";
import { fieldName, validateModel, type Effect, type Model } from "../model";
import {
  configId,
  experimentSetupIssues,
  object,
  type ExperimentSetup,
} from "../playtest/config";
import type { Experiment, Sample } from "../records/records";
export const MAX_COMPARISON_SAMPLES = 240;
export type ParameterRef =
  | { kind: "cost"; action: string; index: number }
  | {
      kind: "effect";
      action: string;
      index: number;
      property: "value" | "pairBonus" | "multiplierValue";
    }
  | { kind: "goal"; goal: string }
  | { kind: "flow"; property: "actionsPerTurn" | "maxRounds" };
export interface ParameterOption {
  ref: ParameterRef;
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
}
export interface RuleVariant {
  id: string;
  name: string;
  source: "draft" | "version" | "parameter";
  versionId?: string;
  model?: Model;
  value?: number;
}
export interface ComparisonPlan {
  format: "gameplay-comparison-v1";
  mode: "versions" | "parameter";
  variants: RuleVariant[];
  scan?: {
    parameter: ParameterRef;
    from: number;
    to: number;
    step: number;
    baseline: number;
  };
}
export const parameterKey = (ref: ParameterRef) => JSON.stringify(ref);
export function parameterOptions(model: Model): ParameterOption[] {
  const options: ParameterOption[] = [];
  const add = (
    ref: ParameterRef,
    label: string,
    value: number,
    min = 0,
    max = 1_000_000,
  ) => options.push({ ref, key: parameterKey(ref), label, value, min, max });
  for (const a of model.actions) {
    a.costs.forEach((c, index) =>
      add(
        { kind: "cost", action: a.id, index },
        `${a.name} · 消耗${fieldName(model, c.field)} #${index + 1}`,
        c.value,
      ),
    );
    a.effects.forEach((e, index) => {
      if (e.type === "combination" && e.multiplier === undefined)
        add(
          { kind: "effect", action: a.id, index, property: "multiplierValue" },
          `${a.name} · 固定倍率`,
          e.multiplierValue ?? 1,
        );
      if (e.type === "add")
        add(
          { kind: "effect", action: a.id, index, property: "value" },
          `${a.name} · ${fieldName(model, e.field)}${e.from ? "产出系数" : "收益"} #${index + 1}`,
          e.value,
        );
      if (e.type === "combination")
        add(
          { kind: "effect", action: a.id, index, property: "pairBonus" },
          `${a.name} · 同类配对奖励`,
          e.pairBonus ?? 15,
        );
    });
  }
  model.goals.forEach((g) =>
    add({ kind: "goal", goal: g.id }, `${g.name} · 目标门槛`, g.threshold, 1),
  );
  add(
    { kind: "flow", property: "actionsPerTurn" },
    "流程 · 每阶段行动数",
    model.flow.actionsPerTurn,
    1,
    10,
  );
  add(
    { kind: "flow", property: "maxRounds" },
    "流程 · 轮数上限",
    model.flow.maxRounds,
    1,
    100,
  );
  return options;
}
function parameter(model: Model, ref: ParameterRef) {
  const option = parameterOptions(model).find(
    (p) => p.key === parameterKey(ref),
  );
  if (!option) throw new Error("参数已不存在，请重新选择扫描参数。");
  return option;
}
export function withParameter(
  model: Model,
  ref: ParameterRef,
  value: number,
): Model {
  const option = parameter(model, ref);
  if (!Number.isSafeInteger(value) || value < option.min || value > option.max)
    throw new Error(`参数范围需为 ${option.min}–${option.max} 的整数。`);
  const next = copy(model);
  if (ref.kind === "cost")
    next.actions.find((a) => a.id === ref.action)!.costs[ref.index].value =
      value;
  else if (ref.kind === "effect") {
    const e = next.actions.find((a) => a.id === ref.action)!.effects[ref.index];
    if (e.type === "add" && ref.property === "value") e.value = value;
    else if (e.type === "combination" && ref.property === "pairBonus")
      e.pairBonus = value;
    else if (
      e.type === "combination" &&
      ref.property === "multiplierValue" &&
      e.multiplier === undefined
    )
      e.multiplierValue = value;
  } else if (ref.kind === "goal")
    next.goals.find((g) => g.id === ref.goal)!.threshold = value;
  else next.flow[ref.property] = value;
  const issues = validateModel(next);
  if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));
  return next;
}
export function scanValues(
  model: Model,
  ref: ParameterRef,
  from: number,
  to: number,
  step: number,
): number[] {
  const p = parameter(model, ref);
  if (
    ![from, to, step].every(Number.isSafeInteger) ||
    from < p.min ||
    to > p.max ||
    from > to ||
    step < 1 ||
    step > 1_000_000
  )
    throw new Error(`请填写有效范围与正整数步长，参数允许 ${p.min}–${p.max}。`);
  const count = Math.floor((to - from) / step) + 1;
  if (count > 11)
    throw new Error("一次最多扫描 11 个数值，请缩小范围或增大步长。");
  return Array.from({ length: count }, (_, i) => from + i * step);
}
export function freezeComparisonSetup(
  base: Model,
  input: ExperimentSetup,
): ExperimentSetup {
  const errors = experimentSetupIssues(input, base);
  if (errors.length) throw new Error(errors.join(" "));
  const setup = copy(input);
  for (const p of setup.scenario.participants) {
    p.values = Object.fromEntries(
      base.fields.map((f) => [
        f.id,
        Object.hasOwn(p.values, f.id) ? p.values[f.id] : f.initial,
      ]),
    );
    p.capabilities = Object.fromEntries(
      base.capabilities.map((c) => [
        c.id,
        Object.hasOwn(p.capabilities, c.id) ? p.capabilities[c.id] : c.initial,
      ]),
    );
  }
  return setup;
}
export function versionPlan(
  base: Omit<RuleVariant, "id">,
  candidate: Omit<RuleVariant, "id">,
): ComparisonPlan {
  if (
    base.source === candidate.source &&
    base.versionId === candidate.versionId
  )
    throw new Error("请选择两个不同的规则来源。");
  const { model: _, ...baseline } = copy(base);
  return {
    format: "gameplay-comparison-v1",
    mode: "versions",
    variants: [
      { ...baseline, id: "baseline" },
      { ...copy(candidate), id: "candidate" },
    ],
  };
}
export function parameterPlan(
  base: Model,
  source: Omit<RuleVariant, "id" | "model">,
  ref: ParameterRef,
  from: number,
  to: number,
  step: number,
): ComparisonPlan {
  const option = parameter(base, ref),
    values = scanValues(base, ref, from, to, step).filter(
      (v) => v !== option.value,
    );
  if (!values.length) throw new Error("扫描范围至少需要一个不同于基准的数值。");
  return {
    format: "gameplay-comparison-v1",
    mode: "parameter",
    scan: { parameter: copy(ref), from, to, step, baseline: option.value },
    variants: [
      { ...copy(source), id: "baseline", value: option.value },
      ...values.map((value) => ({
        id: `value-${value}`,
        name: `${option.label.slice(0, 450)} = ${value}`,
        source: "parameter" as const,
        value,
        model: withParameter(base, ref, value),
      })),
    ],
  };
}
function sameIds(a: { id: string }[], b: { id: string }[]) {
  return a.length === b.length && a.every((i) => b.some((j) => j.id === i.id));
}
export function comparisonIssues(
  base: Model,
  setup: ExperimentSetup,
  input: unknown,
): string[] {
  if (
    !object(input) ||
    input.format !== "gameplay-comparison-v1" ||
    !["versions", "parameter"].includes(String(input.mode)) ||
    !Array.isArray(input.variants) ||
    input.variants.length < 2 ||
    input.variants.length > 12
  )
    return ["规则对照计划格式不完整。"];
  const errors: string[] = [],
    ids = new Set<string>();
  let malformed = false;
  const plan = input as unknown as ComparisonPlan;
  if (
    plan.variants.length * setup.arms.length * setup.scenario.seedCount >
    MAX_COMPARISON_SAMPLES
  )
    errors.push(
      `一次对照最多 ${MAX_COMPARISON_SAMPLES} 局，请减少扫描点、种子数量或对照策略。`,
    );
  if (
    setup.scenario.participants.some(
      (p) =>
        !sameIds(
          Object.keys(p.values).map((id) => ({ id })),
          base.fields,
        ) ||
        !sameIds(
          Object.keys(p.capabilities).map((id) => ({ id })),
          base.capabilities,
        ),
    )
  )
    errors.push("对照实验需要固定基准解析后的初始数值与能力。");
  for (const [i, v] of plan.variants.entries()) {
    if (
      !object(v) ||
      !configId(v.id) ||
      ids.has(v.id) ||
      typeof v.name !== "string" ||
      !v.name.trim() ||
      v.name.length > 500 ||
      !["draft", "version", "parameter"].includes(v.source) ||
      (v.source === "version"
        ? !configId(v.versionId)
        : v.versionId !== undefined)
    ) {
      errors.push("规则分组的名称、来源或标识无效。");
      malformed = true;
      continue;
    }
    ids.add(v.id);
    if (i === 0) {
      if (
        v.id !== "baseline" ||
        v.model !== undefined ||
        v.source === "parameter"
      )
        errors.push("基准规则分组无效。");
    } else {
      if (validateModel(v.model).length) {
        errors.push(`「${v.name}」规则无效。`);
        continue;
      }
      const model = v.model!;
      if (
        !sameIds(base.fields, model.fields) ||
        !sameIds(base.capabilities, model.capabilities)
      )
        errors.push(
          `「${v.name}」的状态或能力标识与基准不同，无法固定同一开局。`,
        );
      errors.push(
        ...experimentSetupIssues(setup, model).map((e) => `「${v.name}」${e}`),
      );
    }
  }
  if (malformed) return errors;
  if (plan.mode === "versions") {
    if (
      plan.scan !== undefined ||
      plan.variants.length !== 2 ||
      plan.variants.some(
        (v) => v.source === "parameter" || v.value !== undefined,
      ) ||
      plan.variants[1]?.id !== "candidate"
    )
      errors.push("版本对照需要一份基准与一份候选规则。");
  } else {
    try {
      const scan = plan.scan;
      if (!object(scan)) throw new Error("参数扫描配置不完整。");
      const option = parameter(base, scan.parameter);
      const values = scanValues(
        base,
        scan.parameter,
        scan.from,
        scan.to,
        scan.step,
      ).filter((v) => v !== option.value);
      if (
        !values.length ||
        scan.baseline !== option.value ||
        plan.variants.length !== values.length + 1 ||
        plan.variants[0]?.value !== option.value
      )
        throw new Error("参数扫描分组与范围不一致。");
      for (const [i, value] of values.entries()) {
        const variant = plan.variants[i + 1];
        if (
          variant.id !== `value-${value}` ||
          variant.source !== "parameter" ||
          variant.value !== value ||
          JSON.stringify(variant.model) !==
            JSON.stringify(withParameter(base, scan.parameter, value))
        )
          throw new Error("扫描分组包含参数之外的规则变化，原文件已保留。");
      }
    } catch (cause) {
      errors.push(
        cause instanceof Error ? cause.message : "参数扫描配置无效。",
      );
    }
  }
  return [...new Set(errors)];
}
export function experimentVariants(
  e: Pick<Experiment, "model" | "comparison">,
): RuleVariant[] {
  return (
    e.comparison?.variants ?? [
      { id: "baseline", name: e.model.name, source: "draft" },
    ]
  );
}
export function variantModel(
  e: Pick<Experiment, "model" | "comparison">,
  id = "baseline",
): Model {
  const variant = experimentVariants(e).find((v) => v.id === id);
  if (!variant) throw new Error("样本引用的规则分组不存在。");
  return variant.model ?? e.model;
}
export const sampleModel = (e: Experiment, s: Sample) =>
  variantModel(e, s.variant ?? "baseline");
export const experimentTotal = (e: Experiment) =>
  e.count * e.policies.length * experimentVariants(e).length;
export const round = (v: number) => Math.round(v * 10) / 10;
export function pairedDifference(
  e: Experiment,
  variant: string,
  policy: string,
) {
  const baseline = e.samples.filter(
    (s) =>
      (s.variant ?? "baseline") === "baseline" &&
      s.policy === policy &&
      !s.error,
  );
  const pairs = e.samples
    .filter((s) => s.variant === variant && s.policy === policy && !s.error)
    .flatMap((s) => {
      const b = baseline.find((b) => b.index === s.index);
      return b ? [{ before: b, after: s }] : [];
    });
  const won = (s: Sample, player: string, goal?: string) =>
    Number(
      s.log.final.outcome?.winners.some(
        (w) => w.player === player && (!goal || w.goal === goal),
      ) ?? false,
    );
  const signature = (s: Sample) =>
    JSON.stringify([
      s.log.final.outcome?.kind,
      s.log.final.outcome?.winners.map((w) => `${w.player}:${w.goal}`).sort(),
    ]);
  return {
    count: pairs.length,
    steps: pairs.length
      ? round(
          pairs.reduce(
            (n, p) =>
              n + p.after.log.choices.length - p.before.log.choices.length,
            0,
          ) / pairs.length,
        )
      : null,
    changed: pairs.filter((p) => signature(p.before) !== signature(p.after))
      .length,
    players: Array.from({ length: e.players }, (_, i) => {
      const id = `player-${i}`;
      return {
        id,
        rate: pairs.length
          ? round(
              (100 *
                pairs.reduce(
                  (n, p) => n + won(p.after, id) - won(p.before, id),
                  0,
                )) /
                pairs.length,
            )
          : null,
        goals: variantModel(e, variant).goals.map((g) => ({
          id: g.id,
          rate:
            !e.model.goals.some((b) => b.id === g.id) || !pairs.length
              ? null
              : round(
                  (100 *
                    pairs.reduce(
                      (n, p) =>
                        n + won(p.after, id, g.id) - won(p.before, id, g.id),
                      0,
                    )) /
                    pairs.length,
                ),
        })),
      };
    }),
  };
}
/** Human-readable executable rule changes, derived from frozen models rather than current drafts. */
export function ruleChanges(before: Model, after: Model) {
  const summary = (m: Model) => {
    const result = new Map<string, { label: string; value: string }>();
    const put = (key: string[], label: string, value: unknown) =>
      result.set(JSON.stringify(key), { label, value: String(value) });
    const effects = (list: Effect[]) =>
      list
        .map((e) =>
          e.type === "add"
            ? `${fieldName(m, e.field)} + ${e.value}${e.from ? ` × ${fieldName(m, e.from)}` : ""}`
            : e.type === "grant"
              ? `授予 ${m.capabilities.find((c) => c.id === e.capability)?.name ?? e.capability}`
              : `集合 ${m.collections.find((c) => c.id === e.collection)?.name ?? e.collection} → ${fieldName(m, e.field)}，配对奖励 ${e.pairBonus ?? 15}，倍率 ${e.multiplier !== undefined ? fieldName(m, e.multiplier) : (e.multiplierValue ?? 1)}`,
        )
        .join("；") || "无";
    m.fields.forEach((f) => {
      put(["field", f.id, "initial"], `${f.name} · 模型初始值`, f.initial);
      put(["field", f.id, "role"], `${f.name} · 用途`, f.role);
    });
    m.capabilities.forEach((c) =>
      put(
        ["capability", c.id],
        `${c.name} · 模型初始能力`,
        c.initial ? "拥有" : "未拥有",
      ),
    );
    put(
      ["order", "actions"],
      "行动顺序（同分决策时使用）",
      m.actions.map((a) => a.id).join(" → "),
    );
    put(
      ["order", "collections"],
      "集合初始化顺序",
      m.collections.map((c) => c.id).join(" → "),
    );
    m.actions.forEach((a) => {
      put(
        ["action", a.id, "costs"],
        `${a.name} · 成本`,
        a.costs.map((c) => `${fieldName(m, c.field)} ${c.value}`).join("；") ||
          "无",
      );
      put(
        ["action", a.id, "requires"],
        `${a.name} · 前置能力`,
        a.requires
          .map((id) => m.capabilities.find((c) => c.id === id)?.name ?? id)
          .join("、") || "无",
      );
      put(["action", a.id, "effects"], `${a.name} · 效果`, effects(a.effects));
    });
    m.goals.forEach((g) =>
      put(
        ["goal", g.id],
        `${g.name} · 目标`,
        `${fieldName(m, g.field)} ≥ ${g.threshold}`,
      ),
    );
    m.collections.forEach((c) => {
      put(
        ["collection", c.id, "capacity"],
        `${c.name} · 容量与选择上限`,
        `${c.handSize} / ${c.maxSelect}`,
      );
      put(
        ["collection", c.id, "cards"],
        `${c.name} · 对象`,
        c.cards
          .map((c) => `${c.id} ${c.name} [${c.group}] ${c.value}`)
          .join("；"),
      );
    });
    put(["flow", "actions"], "每阶段行动数", m.flow.actionsPerTurn);
    put(["flow", "rounds"], "轮数上限", m.flow.maxRounds);
    put(["flow", "income"], "周期效果", effects(m.flow.income));
    return result;
  };
  const a = summary(before),
    b = summary(after);
  return [...new Set([...a.keys(), ...b.keys()])].flatMap((key) =>
    a.get(key)?.value === b.get(key)?.value
      ? []
      : [
          {
            label: b.get(key)?.label ?? a.get(key)!.label,
            before: a.get(key)?.value ?? "未定义",
            after: b.get(key)?.value ?? "未定义",
          },
        ],
  );
}
