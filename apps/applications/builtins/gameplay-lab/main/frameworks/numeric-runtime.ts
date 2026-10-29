import { collectionsOf } from "../domains/card/collections";
import { cardSimulator } from "../domains/card/model";
import { startRun, step, type Choice, type Run } from "../domains/turn/engine";
import {
  validateModel,
  type Model,
  type NumericModel,
} from "../domains/turn/model";
import { type ReadinessIssue, type SimulatorRef } from "../shared/contracts";
import { copy, uid } from "../shared/utils";
import type { InitialPlayer } from "../validation/playtest/config";
import { cardScoringSimulator as cardV2 } from "./card-scoring/runtime";
import { resourceSimulator as resource } from "./resource-development/runtime";
export interface SimulatorDefinition {
  ref: SimulatorRef;
  name: string;
  description: string;
  validate(model: Model): ReadinessIssue[];
  initialize: typeof startRun;
  advance: typeof step;
}
export const simulators: readonly SimulatorDefinition[] = [resource, cardV2];
export const simulatorDefinition = (ref: SimulatorRef | null | undefined) =>
  simulators.find(
    (s) => s.ref.id === ref?.id && s.ref.version === ref?.version,
  );
export const simulatorName = (ref: SimulatorRef | null | undefined) =>
  ref
    ? (simulatorDefinition(ref)?.name ??
      `未支持的模拟器 ${ref.id} v${ref.version}`)
    : "尚未选择";
export const exampleSimulator = (id: "development" | "combination") =>
  copy(id === "combination" ? cardSimulator : resource.ref);
export function blankModel(name: string): NumericModel {
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
      collectionsOf(model).some((c) => c.id === issue.path) ||
      (model.format === "gameplay-card-v1" &&
        model.cards.some((card) => card.id === issue.path)) ||
      ["流程", "周期结算", "牌库", "卡牌", "卡牌与牌库"].includes(issue.path)
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
  const simulator = simulatorDefinition(run.simulator);
  if (!simulator) throw new Error("本局使用的模拟器版本不可用，原记录已保留。");
  return simulator.advance(run, choice);
}
