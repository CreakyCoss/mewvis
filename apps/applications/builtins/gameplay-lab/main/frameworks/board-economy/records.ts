import { copy, uid } from "../../shared/utils";
import { sameJson } from "../composition/resolve";
import type { BoardModel } from "./model";
import {
  advanceBoard,
  startBoard,
  type BoardCommand,
  type BoardState,
} from "./runtime";
import { validateBoard } from "./validation";
export interface BoardRecord {
  format: "gameplay-board-economy-run-v1";
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  simulator: { id: "board-economy"; version: 1 };
  model: BoardModel;
  seed: number;
  decisions: BoardCommand[];
  drivers: ("manual" | "basic")[];
  final: BoardState;
}
export function newBoardRecord(
  projectId: string,
  model: BoardModel,
  seed = 42,
): BoardRecord {
  const now = new Date().toISOString();
  return {
    format: "gameplay-board-economy-run-v1",
    id: uid("board-run"),
    projectId,
    createdAt: now,
    updatedAt: now,
    simulator: { id: "board-economy", version: 1 },
    model: copy(model),
    seed,
    decisions: [],
    drivers: [],
    final: startBoard(model, seed),
  };
}
export function advanceBoardRecord(
  record: BoardRecord,
  command: BoardCommand,
  driver: "manual" | "basic" = "manual",
): BoardRecord {
  if (!["manual", "basic"].includes(driver)) throw new Error("操作来源无效。");
  const final = advanceBoard(record.model, record.final, command).state;
  return {
    ...copy(record),
    final,
    decisions: [...copy(record.decisions), copy(command)],
    drivers: [...record.drivers, driver],
    updatedAt: new Date().toISOString(),
  };
}
export function boardReplay(
  record: BoardRecord,
  count = record.decisions.length,
): BoardState {
  if (!Number.isInteger(count) || count < 0 || count > record.decisions.length)
    throw new Error("回放步骤无效。");
  let state = startBoard(record.model, record.seed);
  for (const command of record.decisions.slice(0, count))
    state = advanceBoard(record.model, state, command).state;
  return state;
}
export function boardTimeline(record: BoardRecord): BoardState[] {
  const states = [startBoard(record.model, record.seed)];
  for (const command of record.decisions)
    states.push(advanceBoard(record.model, states.at(-1)!, command).state);
  return states;
}
export function parseBoardRecord(
  input: unknown,
  projectId: string,
): BoardRecord {
  const r = input as BoardRecord;
  const object = (v: unknown) =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const date = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v));
  if (
    !object(r) ||
    r.format !== "gameplay-board-economy-run-v1" ||
    Object.keys(r).some(
      (k) =>
        ![
          "format",
          "id",
          "projectId",
          "createdAt",
          "updatedAt",
          "simulator",
          "model",
          "seed",
          "decisions",
          "drivers",
          "final",
        ].includes(k),
    ) ||
    typeof r.id !== "string" ||
    !/^board-run-[\w-]{1,90}$/.test(r.id) ||
    r.projectId !== projectId ||
    !date(r.createdAt) ||
    !date(r.updatedAt) ||
    r.simulator?.id !== "board-economy" ||
    r.simulator.version !== 1 ||
    Object.keys(r.simulator).some((k) => !["id", "version"].includes(k)) ||
    !Array.isArray(r.decisions) ||
    r.decisions.length > 400 ||
    !Array.isArray(r.drivers) ||
    r.drivers.length !== r.decisions.length ||
    !r.drivers.every((d) => d === "manual" || d === "basic") ||
    validateBoard(r.model).length
  )
    throw new Error("棋盘经济记录无效或版本不受支持，原文件已保留。");
  if (!sameJson(boardReplay(r), r.final))
    throw new Error("棋盘记录与冻结规则重算结果不一致，原文件已保留。");
  return copy(r);
}
