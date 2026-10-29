import { type ReadinessIssue, type SimulatorRef } from "../shared/contracts";
import { copy, uid } from "../shared/utils";
import { startRun, step, type Choice, type Run } from "./engine";
import { validateModel, type Model } from "./model";
import type { InitialPlayer } from "./playtest/config";
export interface SimulatorDefinition {
  ref: SimulatorRef;
  name: string;
  description: string;
  validate(model: Model): ReadinessIssue[];
  initialize: typeof startRun;
  advance: typeof step;
}
const resource: SimulatorDefinition = {
  ref: { id: "resource-turns", version: 1 },
  name: "回合发展",
  description: "通过资源投入、周期产出、能力解锁和目标竞速验证回合玩法。",
  validate(model) {
    const issues: ReadinessIssue[] = [];
    if (model.collections.length)
      issues.push({
        path: "集合",
        message: "回合发展不支持牌池，请选择卡牌组合模拟器，或移除集合。",
        view: "rules",
      });
    for (const a of model.actions)
      if (a.effects.some((e) => e.type === "combination"))
        issues.push({
          path: a.id,
          message: "组合计分需要卡牌组合模拟器。",
          view: "model",
          nodeId: a.id,
        });
    return issues;
  },
  initialize: startRun,
  advance: step,
};
const cards: SimulatorDefinition = {
  ref: { id: "card-combination", version: 1 },
  name: "卡牌组合",
  description: "配置自己的牌池、手牌、选择与计分规则，执行出牌、弃置和补充。",
  validate(model) {
    const issues: ReadinessIssue[] = [];
    if (!model.collections.length)
      issues.push({
        path: "牌池",
        message: "添加一个牌池，并设置卡牌、手牌容量和选择上限。",
        view: "rules",
      });
    if (
      !model.actions.some((a) =>
        a.effects.some((e) => e.type === "combination"),
      )
    )
      issues.push({
        path: "计分行动",
        ...(model.actions[0] ? { nodeId: model.actions[0].id } : {}),
        message: "为一个行动添加组合计分效果，选择牌池和得分状态。",
        view: "model",
      });
    return issues;
  },
  initialize: startRun,
  advance: step,
};
export const simulators: readonly SimulatorDefinition[] = [resource, cards];
export const simulatorDefinition = (ref: SimulatorRef | null | undefined) =>
  simulators.find(
    (s) => s.ref.id === ref?.id && s.ref.version === ref?.version,
  );
export const simulatorName = (ref: SimulatorRef | null | undefined) =>
  ref
    ? (simulatorDefinition(ref)?.name ??
      `未支持的模拟器 ${ref.id} v${ref.version}`)
    : "尚未选择";
/** Only legacy documents need inference. New projects always save an explicit selection, including null. */
export const inferLegacySimulator = (model: Model): SimulatorRef =>
  copy(
    model.collections.length ||
      model.actions.some((a) => a.effects.some((e) => e.type === "combination"))
      ? cards.ref
      : resource.ref,
  );
export const exampleSimulator = (id: "development" | "combination") =>
  copy(id === "combination" ? cards.ref : resource.ref);
export function blankModel(name: string): Model {
  return {
    format: "gameplay-model-v1",
    id: uid("model"),
    name,
    description: "",
    fields: [],
    capabilities: [],
    actions: [],
    goals: [],
    collections: [],
    flow: { actionsPerTurn: 2, maxRounds: 15, income: [] },
  };
}
export function modelReadiness(
  model: Model,
  ref: SimulatorRef | null,
): ReadinessIssue[] {
  const nodes = [
    ...model.fields,
    ...model.capabilities,
    ...model.actions,
    ...model.goals,
  ];
  const errors: ReadinessIssue[] = validateModel(model).map((issue) => ({
    ...issue,
    view:
      model.collections.some((c) => c.id === issue.path) ||
      ["流程", "周期结算"].includes(issue.path)
        ? "rules"
        : "model",
    ...(nodes.some((n) => n.id === issue.path) ? { nodeId: issue.path } : {}),
  }));
  if (!ref)
    errors.unshift({
      path: "模拟器",
      message: "选择回合发展或卡牌组合模拟器。",
      view: "simulator",
    });
  else {
    const simulator = simulatorDefinition(ref);
    if (!simulator)
      errors.unshift({
        path: "模拟器",
        message: `本机不支持 ${ref.id} v${ref.version}，请选择可用的模拟器。`,
        view: "simulator",
      });
    else if (!validateModel(model, true).length)
      errors.push(...simulator.validate(model));
  }
  return errors;
}
export function assertSimulator(model: Model, ref: SimulatorRef) {
  const issues = modelReadiness(model, ref);
  if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));
  return simulatorDefinition(ref)!;
}
export function createSimulatedRun(
  ref: SimulatorRef,
  model: Model,
  seed = 42,
  players = 1,
  initial?: InitialPlayer[],
): Run {
  const simulator = assertSimulator(model, ref);
  return {
    ...simulator.initialize(model, seed, players, initial),
    simulator: copy(ref),
  };
}
export function advanceSimulatedRun(run: Run, choice: Choice): Run {
  if (!run.simulator) return step(run, choice);
  const simulator = simulatorDefinition(run.simulator);
  if (!simulator) throw new Error("本局使用的模拟器版本不可用，原记录已保留。");
  return simulator.advance(run, choice);
}
