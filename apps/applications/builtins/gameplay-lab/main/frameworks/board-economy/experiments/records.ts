import { copy } from "../../../shared/utils";
import { sameJson } from "../../composition/resolve";
import {
  advanceBoard,
  chooseBoard,
  observeBoard,
  startBoard,
} from "../runtime";
import {
  boardExperimentIssues,
  boardExperimentTotal,
  boardInteger,
  boardKeys,
  boardObject,
  type BoardExperiment,
} from "./model";
interface VerifiedSamples {
  signature: string;
  values: Map<string, string>;
}
const invalid = () => {
  throw new Error("棋盘实验无效、版本不受支持或重算不一致，原文件已保留。");
};
function parse(
  input: unknown,
  projectId: string,
  memo?: VerifiedSamples,
): BoardExperiment {
  if (
    !boardObject(input) ||
    !boardKeys(input, [
      "format",
      "id",
      "projectId",
      "createdAt",
      "updatedAt",
      "simulator",
      "policy",
      "variants",
      "seedStart",
      "seedCount",
      "status",
      "samples",
      "scan",
    ]) ||
    input.format !== "gameplay-board-economy-experiment-v1" ||
    typeof input.id !== "string" ||
    !/^board-experiment-[\w-]{1,80}$/.test(input.id) ||
    input.projectId !== projectId ||
    ![input.createdAt, input.updatedAt].every(
      (d) => typeof d === "string" && Number.isFinite(Date.parse(d)),
    ) ||
    !sameJson(input.simulator, { id: "board-economy", version: 1 }) ||
    !sameJson(input.policy, { id: "board-basic", version: 1 }) ||
    typeof input.status !== "string" ||
    !["running", "completed", "cancelled", "interrupted"].includes(
      String(input.status),
    ) ||
    !Array.isArray(input.samples) ||
    boardExperimentIssues(input).length
  )
    invalid();
  const e = input as unknown as BoardExperiment,
    total = boardExperimentTotal(e);
  if (
    e.samples.length > total ||
    (e.status === "completed") !== (e.samples.length === total)
  )
    invalid();
  const signature = JSON.stringify([
    e.id,
    e.projectId,
    e.simulator,
    e.policy,
    e.seedStart,
    e.seedCount,
    e.variants,
    e.scan ?? null,
  ]);
  if (memo && memo.signature !== signature) {
    memo.signature = signature;
    memo.values.clear();
  }
  const seen = new Set<string>();
  for (const sample of e.samples) {
    if (
      !boardObject(sample) ||
      !boardKeys(sample, [
        "variant",
        "index",
        "seed",
        "decisions",
        "final",
        "error",
      ]) ||
      !boardInteger(sample.index, 0, e.seedCount - 1) ||
      sample.seed !== e.seedStart + sample.index ||
      !Array.isArray(sample.decisions) ||
      sample.decisions.length > 400 ||
      (sample.error !== undefined &&
        (typeof sample.error !== "string" ||
          !sample.error.trim() ||
          sample.error.length > 2000))
    )
      invalid();
    const variant = e.variants.find((v) => v.id === sample.variant),
      key = `${sample.index}:${sample.variant}`;
    if (!variant || seen.has(key)) invalid();
    seen.add(key);
    // Shape checks also cover JSON-invisible extra command fields before memo lookup.
    if (
      sample.decisions.some(
        (c) =>
          !boardObject(c) ||
          !boardKeys(c, ["type", "player"]) ||
          typeof c.type !== "string" ||
          !["roll", "buy", "skip"].includes(String(c.type)) ||
          !boardInteger(c.player, 0, 1),
      )
    )
      invalid();
    const fingerprint = JSON.stringify(sample);
    if (memo?.values.get(key) === fingerprint) continue;
    let state = startBoard(variant!.model, sample.seed);
    for (const command of sample.decisions) {
      if (
        state.outcome ||
        !sameJson(
          chooseBoard(
            variant!.model,
            observeBoard(variant!.model, state, state.actor),
          ),
          command,
        )
      )
        invalid();
      state = advanceBoard(variant!.model, state, command).state;
    }
    if (
      !sameJson(state, sample.final) ||
      (!sample.error && !state.outcome) ||
      (!!sample.error && !!state.outcome)
    )
      invalid();
    memo?.values.set(key, fingerprint);
  }
  return copy(e);
}
export const parseBoardExperiment = (input: unknown, projectId: string) =>
  parse(input, projectId);
/** Immutable fingerprints avoid replaying verified samples at every checkpoint. */
export function createBoardExperimentParser() {
  const memo: VerifiedSamples = { signature: "", values: new Map() };
  return (input: unknown, projectId: string) => parse(input, projectId, memo);
}
