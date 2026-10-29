import { copy, uid } from "../../shared/utils";
import type { GameComposition } from "../composition/contracts";
import { sameJson } from "../composition/resolve";
import { resolveDoudizhuComposition } from "./composition/catalog";
import { doudizhuDefinition } from "./definition";
import type { DoudizhuModel } from "./model";
import {
  advanceDoudizhu,
  startDoudizhu,
  type DoudizhuCommand,
  type DoudizhuState,
} from "./runtime/game";
import { validateDoudizhu } from "./validation";
export interface DoudizhuRecord {
  format: "gameplay-doudizhu-run-v1";
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  simulator: { id: "doudizhu"; version: 1 };
  composition?: GameComposition;
  model: DoudizhuModel;
  seed: number;
  decisions: DoudizhuCommand[];
  final: DoudizhuState;
}
export function newDoudizhuRecord(
  projectId: string,
  model: DoudizhuModel,
  seed = 42,
): DoudizhuRecord {
  const date = new Date().toISOString();
  return {
    format: "gameplay-doudizhu-run-v1",
    id: uid("doudizhu-run"),
    projectId,
    createdAt: date,
    updatedAt: date,
    simulator: { id: "doudizhu", version: 1 },
    composition: copy(resolveDoudizhuComposition(model).snapshot),
    model: copy(model),
    seed,
    decisions: [],
    final: startDoudizhu(model, seed),
  };
}
export function advanceDoudizhuRecord(
  record: DoudizhuRecord,
  command: DoudizhuCommand,
): DoudizhuRecord {
  const next = copy(record);
  next.final = advanceDoudizhu(next.model, next.final, command).state;
  next.decisions.push(copy(command));
  next.updatedAt = new Date().toISOString();
  return next;
}
export function doudizhuReplay(
  record: DoudizhuRecord,
  count = record.decisions.length,
) {
  let state = startDoudizhu(record.model, record.seed);
  for (const command of record.decisions.slice(0, count))
    state = advanceDoudizhu(record.model, state, command).state;
  return state;
}
export function parseDoudizhuRecord(
  input: unknown,
  projectId: string,
): DoudizhuRecord {
  const r = input as DoudizhuRecord;
  if (
    !r ||
    typeof r !== "object" ||
    r.format !== "gameplay-doudizhu-run-v1" ||
    typeof r.id !== "string" ||
    !/^[\w-]{1,100}$/.test(r.id) ||
    r.projectId !== projectId ||
    !Number.isFinite(Date.parse(r.createdAt)) ||
    !Number.isFinite(Date.parse(r.updatedAt)) ||
    r.simulator?.id !== doudizhuDefinition.simulator.id ||
    r.simulator.version !== 1 ||
    !Array.isArray(r.decisions) ||
    r.decisions.length > 1000 ||
    validateDoudizhu(r.model).length
  )
    throw new Error("斗地主记录无效或版本不受支持，原文件已保留。");
  if (r.model.composition !== undefined && r.composition === undefined)
    throw new Error("记录缺少冻结的玩法组合。");
  if (
    r.composition !== undefined &&
    !sameJson(r.composition, resolveDoudizhuComposition(r.model).snapshot)
  )
    throw new Error("记录的骨架、布局或模块版本与冻结规则不一致。");
  if (JSON.stringify(doudizhuReplay(r)) !== JSON.stringify(r.final))
    throw new Error("记录与冻结规则重算结果不一致。");
  return copy(r);
}
