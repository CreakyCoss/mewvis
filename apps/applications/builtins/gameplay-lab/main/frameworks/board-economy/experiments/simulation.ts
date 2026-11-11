import { copy, uid } from "../../../shared/utils";
import {
  advanceBoard,
  chooseBoard,
  observeBoard,
  startBoard,
} from "../runtime";
import type { BoardRecord } from "../records";
import {
  boardExperimentTotal,
  boardInteger,
  type BoardExperiment,
  type BoardSample,
  type BoardVariant,
} from "./model";
export function runBoardSample(
  experiment: BoardExperiment,
  variant: BoardVariant,
  index: number,
): BoardSample {
  const seed = experiment.seedStart + index,
    decisions: BoardSample["decisions"] = [];
  let state = startBoard(variant.model, seed),
    error: string | undefined;
  try {
    while (!state.outcome) {
      if (decisions.length >= 400)
        throw new Error("自动玩家达到单局 400 步操作预算。");
      const command = chooseBoard(
        variant.model,
        observeBoard(variant.model, state, state.actor),
      );
      const next = advanceBoard(variant.model, state, command);
      decisions.push(copy(command));
      state = next.state;
    }
  } catch (cause) {
    error =
      (cause instanceof Error ? cause.message : String(cause)).slice(0, 2000) ||
      "自动样本执行失败。";
  }
  return {
    variant: variant.id,
    index,
    seed,
    decisions,
    final: state,
    ...(error ? { error } : {}),
  };
}
export function nextBoardSample(
  experiment: BoardExperiment,
): BoardSample | null {
  const present = new Set(
    experiment.samples.map((s) => `${s.index}:${s.variant}`),
  );
  for (let index = 0; index < experiment.seedCount; index++)
    for (const variant of experiment.variants)
      if (!present.has(`${index}:${variant.id}`))
        return runBoardSample(experiment, variant, index);
  return null;
}
export function appendBoardSample(
  experiment: BoardExperiment,
  sample: BoardSample,
): BoardExperiment {
  if (
    experiment.status !== "running" ||
    !experiment.variants.some((v) => v.id === sample.variant) ||
    !boardInteger(sample.index, 0, experiment.seedCount - 1) ||
    sample.seed !== experiment.seedStart + sample.index ||
    experiment.samples.some(
      (s) => s.index === sample.index && s.variant === sample.variant,
    )
  )
    throw new Error("实验状态、样本位置无效或样本已存在。");
  const samples = [...experiment.samples, copy(sample)];
  return {
    ...experiment,
    samples,
    status:
      samples.length === boardExperimentTotal(experiment)
        ? "completed"
        : "running",
    updatedAt: new Date().toISOString(),
  };
}
export function boardSampleRecord(
  experiment: BoardExperiment,
  sample: BoardSample,
): BoardRecord {
  const variant = experiment.variants.find((v) => v.id === sample.variant);
  if (!variant) throw new Error("实验样本缺少冻结规则。");
  return {
    format: "gameplay-board-economy-run-v1",
    id: uid("board-run"),
    projectId: experiment.projectId,
    createdAt: experiment.createdAt,
    updatedAt: experiment.updatedAt,
    simulator: copy(experiment.simulator),
    model: copy(variant.model),
    seed: sample.seed,
    decisions: copy(sample.decisions),
    drivers: sample.decisions.map(() => "basic"),
    final: copy(sample.final),
  };
}
