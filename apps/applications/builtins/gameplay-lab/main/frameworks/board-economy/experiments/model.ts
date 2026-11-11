import type { Issue } from "../../../shared/contracts";
import { copy, uid } from "../../../shared/utils";
import { sameJson } from "../../composition/resolve";
import type { BoardModel } from "../model";
import type { BoardCommand, BoardState } from "../runtime";
import { validateBoard } from "../validation";
export interface BoardVariant {
  id: "baseline" | "candidate";
  name: string;
  source: { kind: "draft" } | { kind: "version"; id: string };
  model: BoardModel;
}
export interface BoardSample {
  variant: BoardVariant["id"];
  index: number;
  seed: number;
  decisions: BoardCommand[];
  final: BoardState;
  error?: string;
}
export interface BoardExperimentPlan {
  variants: BoardVariant[];
  seedStart: number;
  seedCount: number;
}
export interface BoardExperiment extends BoardExperimentPlan {
  format: "gameplay-board-economy-experiment-v1";
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  simulator: { id: "board-economy"; version: 1 };
  policy: { id: "board-basic"; version: 1 };
  status: "running" | "completed" | "cancelled" | "interrupted";
  samples: BoardSample[];
}
export const MAX_BOARD_SAMPLES = 240;
export const boardExperimentTotal = (plan: BoardExperimentPlan) =>
  plan.seedCount * plan.variants.length;
export const boardObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const boardKeys = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
export const boardInteger = (
  v: unknown,
  low: number,
  high: number,
): v is number =>
  Number.isSafeInteger(v) && Number(v) >= low && Number(v) <= high;
export function boardExperimentIssues(input: unknown): Issue[] {
  const issues: Issue[] = [],
    add = (message: string) => issues.push({ path: "棋盘实验", message });
  if (
    !boardObject(input) ||
    !Array.isArray(input.variants) ||
    !input.variants.length ||
    input.variants.length > 2
  )
    return [
      { path: "棋盘实验", message: "选择一份规则，或两份规则进行版本对照。" },
    ];
  if (
    !boardInteger(input.seedStart, 0, 0xffffffff) ||
    !boardInteger(input.seedCount, 1, MAX_BOARD_SAMPLES)
  )
    add("起始种子须为 0–4,294,967,295 的整数，种子数量为 1–240。");
  else {
    if (input.seedStart + input.seedCount - 1 > 0xffffffff)
      add("种子范围超出上限，请减少起始种子或数量。");
    if (input.seedCount * input.variants.length > MAX_BOARD_SAMPLES)
      add("单次最多 240 局，两版对照时最多 120 个种子。");
  }
  for (const [i, v] of input.variants.entries()) {
    if (
      !boardObject(v) ||
      !boardKeys(v, ["id", "name", "source", "model"]) ||
      v.id !== (i === 0 ? "baseline" : "candidate") ||
      typeof v.name !== "string" ||
      !v.name.trim() ||
      v.name.length > 120 ||
      !boardObject(v.source) ||
      !(
        (v.source.kind === "draft" && boardKeys(v.source, ["kind"])) ||
        (v.source.kind === "version" &&
          boardKeys(v.source, ["kind", "id"]) &&
          typeof v.source.id === "string" &&
          /^[\w-]{1,100}$/.test(v.source.id))
      )
    ) {
      add("规则来源、标识或名称不受支持。");
      continue;
    }
    issues.push(
      ...validateBoard(v.model).map((issue) => ({
        path: "棋盘实验",
        message: `${v.name}：${issue.message}`,
      })),
    );
  }
  if (!issues.length && input.variants.length === 2) {
    const [a, b] = input.variants as unknown as BoardVariant[];
    if (sameJson(a.source, b.source)) add("请选择两个不同的规则来源。");
    else if (
      sameJson(
        { rules: a.model.rules, tiles: a.model.tiles },
        { rules: b.model.rules, tiles: b.model.tiles },
      )
    )
      add("两份规则内容相同，请先修改规则或选择不同版本。");
  }
  return issues;
}
export function newBoardExperiment(
  projectId: string,
  input: BoardExperimentPlan,
): BoardExperiment {
  const issues = boardExperimentIssues(input);
  if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));
  if (!/^[\w-]{1,100}$/.test(projectId)) throw new Error("实验项目标识无效。");
  const now = new Date().toISOString();
  return {
    format: "gameplay-board-economy-experiment-v1",
    id: uid("board-experiment"),
    projectId,
    createdAt: now,
    updatedAt: now,
    simulator: { id: "board-economy", version: 1 },
    policy: { id: "board-basic", version: 1 },
    variants: copy(input.variants),
    seedStart: input.seedStart,
    seedCount: input.seedCount,
    status: "running",
    samples: [],
  };
}
export const boardExperimentAfterLoad = (
  experiment: BoardExperiment,
): BoardExperiment => ({
  ...experiment,
  status: experiment.status === "running" ? "interrupted" : experiment.status,
});
