import { copy, isNumber, uid, type Amount, type Model } from "./model";
export type BasePolicy = "goal" | "growth" | "random";
export interface InitialPlayer {
  name: string;
  values: Record<string, number>;
  capabilities: Record<string, boolean>;
}
export interface Scenario {
  id: string;
  name: string;
  seedStart: number;
  seedCount: number;
  participants: (InitialPlayer & { strategyId: string })[];
}
export interface Condition {
  field: string;
  op: "gte" | "lte" | "lt" | "gt" | "eq";
  value: number;
}
export interface Strategy {
  id: string;
  name: string;
  base: BasePolicy;
  selection: "priority" | "weighted";
  cards: "best" | "value" | "random";
  fallback: "base" | "end";
  reserves: Amount[];
  rules: { action: string; priority: number; conditions: Condition[] }[];
}
export interface PlaytestConfig {
  format: "gameplay-playtest-v1";
  projectId: string;
  scenarios: Scenario[];
  strategies: Strategy[];
  selectedScenario: string;
  comparedStrategies: string[];
}
export interface RunSetup {
  scenario: Scenario;
  strategies: Strategy[];
}
export interface ExperimentSetup extends RunSetup {
  arms: { id: string; name: string; strategyIds: string[] }[];
}
export const basePolicyNames: Record<BasePolicy, string> = {
  goal: "目标优先",
  growth: "先发展再推进",
  random: "随机合法",
};
export const basePolicyValid = (v: unknown): v is BasePolicy =>
  v === "goal" || v === "growth" || v === "random";
export const builtinStrategies: readonly Strategy[] = (
  Object.keys(basePolicyNames) as BasePolicy[]
).map((id) => ({
  id,
  name: basePolicyNames[id],
  base: id,
  selection: "priority",
  cards: "best",
  fallback: "base",
  reserves: [],
  rules: [],
}));
export const allStrategies = (config: PlaytestConfig) => [
  ...builtinStrategies,
  ...config.strategies,
];
export const initialPlayer = (index = 0): Scenario["participants"][number] => ({
  name: `玩家 ${String.fromCharCode(65 + index)}`,
  values: {},
  capabilities: {},
  strategyId: index ? "random" : "goal",
});
export function defaultPlaytest(projectId: string): PlaytestConfig {
  const scenario: Scenario = {
    id: uid("scenario"),
    name: "基础场景",
    seedStart: 42,
    seedCount: 12,
    participants: [initialPlayer()],
  };
  return {
    format: "gameplay-playtest-v1",
    projectId,
    scenarios: [scenario],
    strategies: [],
    selectedScenario: scenario.id,
    comparedStrategies: ["goal", "random"],
  };
}
export const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const configId = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-zA-Z0-9_-]{1,100}$/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
const definitionId = (v: unknown): v is string =>
  typeof v === "string" &&
  !!v.trim() &&
  v.length <= 300 &&
  !["__proto__", "constructor", "prototype"].includes(v);
const name = (v: unknown, draft: boolean) =>
  typeof v === "string" && v.length <= 100 && (draft || !!v.trim());
const integer = (v: unknown, min = 0, max = 1_000_000) =>
  isNumber(v) && v >= min && v <= max;
export function initialIssues(input: unknown, model?: Model): string[] {
  if (!Array.isArray(input) || ![1, 2].includes(input.length))
    return ["参与者需要为 1–2 位。"];
  const errors: string[] = [];
  for (const p of input) {
    if (
      !object(p) ||
      !name(p.name, false) ||
      !object(p.values) ||
      !object(p.capabilities)
    ) {
      errors.push("参与者初始配置不完整。");
      continue;
    }
    const values = Object.entries(p.values),
      abilities = Object.entries(p.capabilities);
    if (
      values.length > 80 ||
      abilities.length > 80 ||
      values.some(
        ([k, v]) =>
          !definitionId(k) ||
          !integer(v) ||
          (model && !model.fields.some((f) => f.id === k)),
      ) ||
      abilities.some(
        ([k, v]) =>
          !definitionId(k) ||
          typeof v !== "boolean" ||
          (model && !model.capabilities.some((c) => c.id === k)),
      )
    )
      errors.push(`参与者「${p.name}」存在无效的初始状态或能力引用。`);
  }
  return errors;
}
export function scenarioIssues(
  input: unknown,
  model?: Model,
  draft = false,
): string[] {
  if (!object(input)) return ["场景格式不完整。"];
  const errors: string[] = [];
  if (
    !configId(input.id) ||
    !name(input.name, draft) ||
    !Number.isInteger(input.seedStart) ||
    Number(input.seedStart) < 0 ||
    Number(input.seedStart) > 0xffffffff ||
    !integer(input.seedCount, 1, 12) ||
    Number(input.seedStart) + Number(input.seedCount) - 1 > 0xffffffff
  )
    errors.push("场景名称或种子范围无效，每场景支持 1–12 个连续种子。");
  // Empty names are allowed while editing; execution always checks full names.
  const players = Array.isArray(input.participants)
    ? input.participants.map((p) =>
        object(p) && draft && typeof p.name === "string" && !p.name.trim()
          ? { ...p, name: "未命名" }
          : p,
      )
    : input.participants;
  errors.push(...initialIssues(players, model));
  if (
    !Array.isArray(input.participants) ||
    input.participants.some((p) => !object(p) || !configId(p.strategyId))
  )
    errors.push("请选择参与者使用的策略。");
  return errors;
}
export function strategyIssues(
  input: unknown,
  model?: Model,
  draft = false,
): string[] {
  if (!object(input)) return ["策略格式不完整。"];
  const errors: string[] = [];
  if (
    !configId(input.id) ||
    !name(input.name, draft) ||
    !basePolicyValid(input.base) ||
    !["priority", "weighted"].includes(String(input.selection)) ||
    !["best", "value", "random"].includes(String(input.cards)) ||
    !["base", "end"].includes(String(input.fallback))
  )
    errors.push("策略基础配置无效。");
  if (
    !Array.isArray(input.reserves) ||
    input.reserves.length > 80 ||
    !Array.isArray(input.rules) ||
    input.rules.length > 80
  )
    return [...errors, "策略最多支持 80 项门槛和行动规则。"];
  const reserveIds = new Set<string>(),
    actionIds = new Set<string>();
  for (const r of input.reserves) {
    if (
      !object(r) ||
      !definitionId(r.field) ||
      !integer(r.value) ||
      reserveIds.has(r.field) ||
      (model && !model.fields.some((f) => f.id === r.field))
    )
      errors.push("资源保留门槛存在重复或失效的状态。");
    else reserveIds.add(r.field);
  }
  for (const r of input.rules) {
    if (
      !object(r) ||
      !definitionId(r.action) ||
      actionIds.has(r.action) ||
      !integer(r.priority, 0, 1000) ||
      !Array.isArray(r.conditions) ||
      r.conditions.length > 10 ||
      (model && !model.actions.some((a) => a.id === r.action))
    ) {
      errors.push("行动规则存在重复、无效引用或优先级，范围为 0–1000。");
      continue;
    }
    actionIds.add(r.action);
    for (const c of r.conditions)
      if (
        !object(c) ||
        !definitionId(c.field) ||
        !["gte", "lte", "lt", "gt", "eq"].includes(String(c.op)) ||
        !integer(c.value) ||
        (model && !model.fields.some((f) => f.id === c.field))
      )
        errors.push("行动条件存在无效的状态、比较符或门槛。");
  }
  return [...new Set(errors)];
}
export function parsePlaytest(
  input: unknown,
  projectId: string,
): PlaytestConfig {
  if (
    !object(input) ||
    input.format !== "gameplay-playtest-v1" ||
    input.projectId !== projectId ||
    !Array.isArray(input.scenarios) ||
    input.scenarios.length > 20 ||
    !Array.isArray(input.strategies) ||
    input.strategies.length > 20 ||
    typeof input.selectedScenario !== "string" ||
    !Array.isArray(input.comparedStrategies) ||
    input.comparedStrategies.length > 4 ||
    input.comparedStrategies.some((s) => !configId(s)) ||
    new Set(input.comparedStrategies).size !== input.comparedStrategies.length
  )
    throw new Error("场景与策略文件格式不完整，原文件已保留。");
  const ids = new Set<string>([
    ...builtinStrategies.map((s) => s.id),
    "manual",
  ]);
  for (const s of input.strategies) {
    if (
      !object(s) ||
      strategyIssues(s, undefined, true).length ||
      ids.has(String(s.id))
    )
      throw new Error("自定义策略配置无效或标识重复，原文件已保留。");
    ids.add(String(s.id));
  }
  const scenarios = new Set<string>();
  for (const s of input.scenarios) {
    if (
      !object(s) ||
      scenarioIssues(s, undefined, true).length ||
      scenarios.has(String(s.id))
    )
      throw new Error("场景配置无效或标识重复，原文件已保留。");
    scenarios.add(String(s.id));
  }
  if (
    (input.selectedScenario && !scenarios.has(input.selectedScenario)) ||
    input.comparedStrategies.some((id) => !ids.has(id as string)) ||
    input.scenarios.some((s) =>
      (s as Scenario).participants.some((p) => !ids.has(p.strategyId)),
    )
  )
    throw new Error("场景或策略选择引用无效，原文件已保留。");
  return copy(input as unknown as PlaytestConfig);
}
export function setupIssues(input: unknown, model: Model): string[] {
  if (
    !object(input) ||
    !Array.isArray(input.strategies) ||
    input.strategies.length < 1 ||
    input.strategies.length > 23
  )
    return ["运行配置不完整。"];
  const errors = scenarioIssues(input.scenario, model),
    ids = new Set<string>();
  for (const s of input.strategies) {
    errors.push(...strategyIssues(s, model));
    if (object(s)) {
      if (ids.has(String(s.id))) errors.push("策略标识重复。");
      ids.add(String(s.id));
    }
  }
  if (object(input.scenario) && Array.isArray(input.scenario.participants))
    for (const p of input.scenario.participants)
      if (object(p) && !ids.has(String(p.strategyId)))
        errors.push("场景引用的策略不存在。");
  return [...new Set(errors)];
}
export function experimentSetupIssues(input: unknown, model: Model): string[] {
  const errors = setupIssues(input, model);
  if (errors.length || !object(input)) return errors;
  const setup = input as unknown as ExperimentSetup,
    ids = new Set<string>();
  if (
    !Array.isArray(setup.arms) ||
    setup.arms.length < 1 ||
    setup.arms.length > 4
  )
    return ["请选择 1–4 个对照策略。"];
  for (const arm of setup.arms) {
    if (!object(arm)) {
      errors.push("实验策略组合无效。");
      continue;
    }
    if (
      !object(arm) ||
      !configId(arm.id) ||
      ids.has(arm.id) ||
      !name(arm.name, false) ||
      !Array.isArray(arm.strategyIds) ||
      arm.strategyIds.length !== setup.scenario.participants.length ||
      arm.strategyIds.some((id) => !setup.strategies.some((s) => s.id === id))
    )
      errors.push("实验策略组合无效。");
    ids.add(arm.id);
  }
  return errors;
}
export function selectedSetup(
  config: PlaytestConfig,
  model: Model,
  experiment = false,
): RunSetup | ExperimentSetup {
  const scenario = config.scenarios.find(
    (s) => s.id === config.selectedScenario,
  );
  if (!scenario) throw new Error("请先创建并选择一个场景。");
  const catalogue = allStrategies(config),
    required = new Set(scenario.participants.map((p) => p.strategyId));
  if (experiment) for (const id of config.comparedStrategies) required.add(id);
  const setup: ExperimentSetup = {
    scenario: copy(scenario),
    strategies: copy(catalogue.filter((s) => required.has(s.id))),
    arms: config.comparedStrategies.map((id) => ({
      id,
      name: catalogue.find((s) => s.id === id)?.name ?? "缺失策略",
      strategyIds: scenario.participants.map((p, i) =>
        i === 0 ? id : p.strategyId,
      ),
    })),
  };
  const errors = experiment
    ? experimentSetupIssues(setup, model)
    : setupIssues(setup, model);
  if (errors.length) throw new Error(errors.join(" "));
  if (!experiment)
    return { scenario: setup.scenario, strategies: setup.strategies };
  return setup;
}
export const initialOf = (scenario: Scenario): InitialPlayer[] =>
  scenario.participants.map(({ name, values, capabilities }) =>
    copy({ name, values, capabilities }),
  );
export function playtestReferences(
  config: PlaytestConfig,
  id: string,
): string[] {
  const refs = new Set<string>();
  for (const s of config.scenarios)
    if (
      s.participants.some(
        (p) => Object.hasOwn(p.values, id) || Object.hasOwn(p.capabilities, id),
      )
    )
      refs.add(`场景「${s.name}」的初始配置`);
  for (const s of config.strategies)
    if (
      s.reserves.some((r) => r.field === id) ||
      s.rules.some(
        (r) => r.action === id || r.conditions.some((c) => c.field === id),
      )
    )
      refs.add(`策略「${s.name}」`);
  return [...refs];
}
