import { isSimulatorRef, type SimulatorRef } from "../../shared/contracts";
import { copy, uid } from "../../shared/utils";
import {
  choose,
  current,
  startRun,
  type Choice,
  type Entry,
  type Policy,
  type Run,
  type State,
} from "../engine";
import {
  comparisonIssues,
  experimentTotal,
  experimentVariants,
  freezeComparisonSetup,
  sampleModel,
  variantModel,
  type ComparisonPlan,
} from "../experiments/comparison";
import { validateModel, type Model } from "../model";
import {
  basePolicyValid,
  experimentSetupIssues,
  initialOf,
  setupIssues,
  type ExperimentSetup,
  type InitialPlayer,
  type RunSetup,
} from "../playtest/config";
import { chooseConfigured } from "../playtest/configured-policy";
import {
  advanceSimulatedRun,
  assertSimulator,
  createSimulatedRun,
} from "../simulators";
export const ENGINE_VERSION = 1;
export interface RunLog {
  choices: Choice[];
  events: Omit<Entry, "state" | "choice">[];
  final: State;
}
export interface Trial {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  drivers: string[];
  setup?: RunSetup;
  run: Run;
}
export interface TrialDocument {
  format: "gameplay-run-v1" | "gameplay-run-v2" | "gameplay-run-v3";
  simulator?: SimulatorRef;
  setup?: RunSetup;
  engine: number;
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  model: Model;
  seed: number;
  players: number;
  drivers: Trial["drivers"];
  log: RunLog;
}
export interface Sample {
  variant?: string;
  policy: string;
  index: number;
  seed: number;
  log: RunLog;
  error?: string;
}
export interface Experiment {
  format:
    | "gameplay-experiment-v1"
    | "gameplay-experiment-v2"
    | "gameplay-experiment-v3"
    | "gameplay-experiment-v4";
  simulator?: SimulatorRef;
  comparison?: ComparisonPlan;
  setup?: ExperimentSetup;
  engine: number;
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  seed: number;
  players: number;
  model: Model;
  policies: string[];
  count: number;
  status: "running" | "completed" | "cancelled" | "interrupted";
  samples: Sample[];
}
export const policyValid = (p: unknown): p is Policy => basePolicyValid(p);
const assert = (ok: unknown, message = "运行记录格式不完整。") => {
  if (!ok) throw new Error(message);
};
const identifier = (v: unknown) =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const date = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const seedValid = (v: unknown) =>
  Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 0xffffffff;
export function runLog(run: Run): RunLog {
  return copy({
    choices: run.entries.slice(1).map((e) => e.choice!),
    events: run.entries.map(({ actor, title, notes }) => ({
      actor,
      title,
      notes,
    })),
    final: current(run),
  });
}
export function restoreLog(
  model: Model,
  seed: number,
  players: number,
  log: RunLog,
  initial?: InitialPlayer[],
  simulator?: SimulatorRef,
): Run {
  assert(
    log &&
      Array.isArray(log.choices) &&
      log.choices.length <= 200 &&
      Array.isArray(log.events) &&
      log.events.length === log.choices.length + 1,
  );
  let run = simulator
    ? createSimulatedRun(simulator, model, seed, players, initial)
    : startRun(model, seed, players, initial);
  for (const c of log.choices) {
    assert(
      c &&
        typeof c.action === "string" &&
        (c.cards === undefined ||
          (Array.isArray(c.cards) &&
            c.cards.length <= 10 &&
            c.cards.every((v) => typeof v === "string"))),
    );
    run = advanceSimulatedRun(run, c);
  }
  assert(
    JSON.stringify(runLog(run)) === JSON.stringify(log),
    "记录与规则回放不一致，原文件已保留。",
  );
  return run;
}
export function trialDocument(t: Trial): TrialDocument {
  return {
    format: t.run.simulator
      ? "gameplay-run-v3"
      : t.setup
        ? "gameplay-run-v2"
        : "gameplay-run-v1",
    ...(t.run.simulator ? { simulator: copy(t.run.simulator) } : {}),
    ...(t.setup ? { setup: copy(t.setup) } : {}),
    engine: ENGINE_VERSION,
    id: t.id,
    projectId: t.projectId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    model: copy(t.run.model),
    seed: t.run.seed,
    players: t.run.entries[0].state.players.length,
    drivers: copy(t.drivers),
    log: runLog(t.run),
  };
}
export function newTrial(
  projectId: string,
  model: Model,
  seed: number,
  players: number,
  setup?: RunSetup,
  simulator?: SimulatorRef,
): Trial {
  if (
    setup &&
    (setupIssues(setup, model).length ||
      setup.scenario.participants.length !== players ||
      setup.scenario.seedStart !== seed)
  )
    throw new Error("场景或策略配置无效。");
  const now = new Date().toISOString();
  return {
    ...(setup ? { setup: copy(setup) } : {}),
    id: uid("run"),
    projectId,
    createdAt: now,
    updatedAt: now,
    drivers: [],
    run: simulator
      ? createSimulatedRun(
          simulator,
          model,
          seed,
          players,
          setup ? initialOf(setup.scenario) : undefined,
        )
      : startRun(
          model,
          seed,
          players,
          setup ? initialOf(setup.scenario) : undefined,
        ),
  };
}
export function newExperiment(
  projectId: string,
  model: Model,
  seed: number,
  players: number,
  policy: Policy,
): Experiment {
  const now = new Date().toISOString();
  return {
    format: "gameplay-experiment-v1",
    engine: ENGINE_VERSION,
    id: uid("experiment"),
    projectId,
    createdAt: now,
    updatedAt: now,
    seed,
    players,
    model: copy(model),
    policies: [policy, policy === "random" ? "goal" : "random"],
    count: 12,
    status: "running",
    samples: [],
  };
}
export function newConfiguredExperiment(
  projectId: string,
  model: Model,
  setup: ExperimentSetup,
  simulator?: SimulatorRef,
): Experiment {
  if (simulator) assertSimulator(model, simulator);
  const errors = [
    ...validateModel(model).map((i) => i.message),
    ...experimentSetupIssues(setup, model),
  ];
  if (errors.length) throw new Error(errors.join(" "));
  return {
    ...newExperiment(
      projectId,
      model,
      setup.scenario.seedStart,
      setup.scenario.participants.length,
      "goal",
    ),
    format: simulator ? "gameplay-experiment-v4" : "gameplay-experiment-v2",
    ...(simulator ? { simulator: copy(simulator) } : {}),
    setup: copy(setup),
    policies: setup.arms.map((a) => a.id),
    count: setup.scenario.seedCount,
  };
}
export function newComparisonExperiment(
  projectId: string,
  model: Model,
  input: ExperimentSetup,
  comparison: ComparisonPlan,
  simulator?: SimulatorRef,
): Experiment {
  const setup = freezeComparisonSetup(model, input),
    base = newConfiguredExperiment(projectId, model, setup, simulator);
  const errors = comparisonIssues(model, setup, comparison);
  if (errors.length) throw new Error(errors.join(" "));
  if (simulator)
    for (const v of comparison.variants)
      assertSimulator(v.model ?? model, simulator);
  return {
    ...base,
    format: simulator ? "gameplay-experiment-v4" : "gameplay-experiment-v3",
    comparison: copy(comparison),
  };
}
export function trialStrategy(trial: Trial) {
  const id =
    trial.setup?.scenario.participants[current(trial.run).actor].strategyId ??
    "goal";
  return trial.setup?.strategies.find((s) => s.id === id);
}
export function trialChoice(trial: Trial) {
  const strategy = trialStrategy(trial);
  if (trial.setup && !strategy) throw new Error("本局快照中的策略不存在。");
  return {
    driver: strategy?.id ?? "goal",
    choice: strategy
      ? chooseConfigured(trial.run, strategy)
      : choose(trial.run, "goal"),
  };
}
export function experimentPolicyName(e: Experiment, id: string) {
  return (
    e.setup?.arms.find((a) => a.id === id)?.name ??
    (
      {
        goal: "目标优先",
        growth: "先发展再推进",
        random: "随机合法",
      } as Record<string, string>
    )[id] ??
    id
  );
}
export function nextSample(e: Experiment): Sample | null {
  for (const variant of experimentVariants(e))
    for (const policy of e.policies)
      for (let index = 0; index < e.count; index++) {
        if (
          e.samples.some(
            (s) =>
              s.policy === policy &&
              s.index === index &&
              (s.variant ?? "baseline") === variant.id,
          )
        )
          continue;
        const seed = (e.seed + index) >>> 0;
        const model = variantModel(e, variant.id),
          initial = e.setup ? initialOf(e.setup.scenario) : undefined;
        let run = e.simulator
            ? createSimulatedRun(e.simulator, model, seed, e.players, initial)
            : startRun(model, seed, e.players, initial),
          error: string | undefined;
        try {
          while (!current(run).outcome) {
            const id = e.setup?.arms.find((a) => a.id === policy)?.strategyIds[
              current(run).actor
            ];
            const strategy = e.setup?.strategies.find((s) => s.id === id);
            if (e.setup && !strategy)
              throw new Error("实验快照中的策略不存在。");
            run = advanceSimulatedRun(
              run,
              strategy
                ? chooseConfigured(run, strategy)
                : choose(run, policy as Policy),
            );
          }
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
        }
        return {
          ...(e.comparison ? { variant: variant.id } : {}),
          policy,
          index,
          seed,
          log: runLog(run),
          ...(error ? { error } : {}),
        };
      }
  return null;
}
export function experimentRows(e: Experiment) {
  return experimentVariants(e).flatMap((variant) =>
    e.policies.map((policy) => {
      const model = variantModel(e, variant.id);
      const all = e.samples.filter(
          (s) =>
            s.policy === policy && (s.variant ?? "baseline") === variant.id,
        ),
        completed = all.filter((s) => !s.error);
      return {
        variant: variant.id,
        variantName: variant.name,
        value: variant.value,
        policy,
        completed: completed.length,
        reached: completed.filter((s) => s.log.final.outcome?.kind === "won")
          .length,
        limited: completed.filter((s) => s.log.final.outcome?.kind === "limit")
          .length,
        average: completed.length
          ? Math.round(
              (completed.reduce((sum, s) => sum + s.log.choices.length, 0) /
                completed.length) *
                10,
            ) / 10
          : 0,
        error: all.length - completed.length,
        players: Array.from({ length: e.players }, (_, i) => ({
          id: `player-${i}`,
          name:
            e.setup?.scenario.participants[i].name ??
            `玩家 ${String.fromCharCode(65 + i)}`,
          reached: completed.filter((s) =>
            s.log.final.outcome?.winners.some(
              (w) => w.player === `player-${i}`,
            ),
          ).length,
          goals: model.goals.map((g) => ({
            id: g.id,
            name: g.name,
            reached: completed.filter((s) =>
              s.log.final.outcome?.winners.some(
                (w) => w.player === `player-${i}` && w.goal === g.id,
              ),
            ).length,
          })),
        })),
      };
    }),
  );
}
export function parseRecord(
  value: unknown,
  projectId: string,
): Trial | Experiment {
  const v = value as TrialDocument | Experiment;
  assert(v && typeof v === "object" && !Array.isArray(v));
  assert(
    v.engine === ENGINE_VERSION,
    "此记录的引擎版本不受支持，原文件已保留。",
  );
  assert(
    identifier(v.id) &&
      v.projectId === projectId &&
      date(v.createdAt) &&
      date(v.updatedAt) &&
      seedValid(v.seed) &&
      [1, 2].includes(v.players) &&
      !validateModel(v.model).length,
  );
  if (
    v.format === "gameplay-run-v1" ||
    v.format === "gameplay-run-v2" ||
    v.format === "gameplay-run-v3"
  ) {
    if (v.format === "gameplay-run-v3") assert(isSimulatorRef(v.simulator));
    else assert(v.simulator === undefined);
    if (
      v.format === "gameplay-run-v2" ||
      (v.format === "gameplay-run-v3" && v.setup !== undefined)
    )
      assert(
        v.setup &&
          !setupIssues(v.setup, v.model).length &&
          v.setup.scenario.participants.length === v.players &&
          v.setup.scenario.seedStart === v.seed,
      );
    else assert(v.setup === undefined);
    const run = restoreLog(
      v.model,
      v.seed,
      v.players,
      v.log,
      v.setup ? initialOf(v.setup.scenario) : undefined,
      v.simulator,
    );
    assert(
      Array.isArray(v.drivers) &&
        v.drivers.length === v.log.choices.length &&
        v.drivers.every(
          (p) =>
            p === "manual" ||
            (v.setup
              ? v.setup.strategies.some((s) => s.id === p)
              : policyValid(p)),
        ),
    );
    return {
      id: v.id,
      projectId,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      drivers: v.drivers,
      ...(v.setup ? { setup: v.setup } : {}),
      run,
    };
  }
  assert(
    v.format === "gameplay-experiment-v1" ||
      v.format === "gameplay-experiment-v2" ||
      v.format === "gameplay-experiment-v3" ||
      v.format === "gameplay-experiment-v4",
  );
  const e = v as Experiment;
  if (
    e.format === "gameplay-experiment-v2" ||
    e.format === "gameplay-experiment-v3" ||
    e.format === "gameplay-experiment-v4"
  )
    assert(
      e.setup &&
        !experimentSetupIssues(e.setup, e.model).length &&
        e.players === e.setup.scenario.participants.length &&
        e.seed === e.setup.scenario.seedStart &&
        e.count === e.setup.scenario.seedCount &&
        JSON.stringify(e.policies) ===
          JSON.stringify(e.setup.arms.map((a) => a.id)),
    );
  else assert(e.setup === undefined);
  if (
    e.format === "gameplay-experiment-v3" ||
    (e.format === "gameplay-experiment-v4" && e.comparison !== undefined)
  )
    assert(e.setup && !comparisonIssues(e.model, e.setup, e.comparison).length);
  else assert(e.comparison === undefined);
  if (e.format === "gameplay-experiment-v4") {
    assert(isSimulatorRef(e.simulator));
    for (const variant of experimentVariants(e))
      assertSimulator(variantModel(e, variant.id), e.simulator!);
  } else assert(e.simulator === undefined);
  assert(
    Array.isArray(e.policies) &&
      e.policies.length > 0 &&
      e.policies.length <= 4 &&
      e.policies.every((p) =>
        e.setup ? e.setup.arms.some((a) => a.id === p) : policyValid(p),
      ) &&
      new Set(e.policies).size === e.policies.length &&
      Number.isInteger(e.count) &&
      e.count >= 1 &&
      e.count <= 12,
  );
  assert(
    ["running", "completed", "cancelled", "interrupted"].includes(e.status) &&
      Array.isArray(e.samples) &&
      e.samples.length <= experimentTotal(e),
  );
  const keys = new Set<string>();
  for (const s of e.samples) {
    const key = `${s.variant ?? "baseline"}:${s.policy}:${s.index}`;
    assert(
      (e.comparison
        ? experimentVariants(e).some((v) => v.id === s.variant)
        : s.variant === undefined) &&
        e.policies.includes(s.policy) &&
        Number.isInteger(s.index) &&
        s.index >= 0 &&
        s.index < e.count &&
        s.seed === (e.seed + s.index) >>> 0 &&
        !keys.has(key) &&
        (s.error === undefined ||
          (typeof s.error === "string" && !!s.error && s.error.length <= 2000)),
    );
    keys.add(key);
    restoreLog(
      sampleModel(e, s),
      s.seed,
      e.players,
      s.log,
      e.setup ? initialOf(e.setup.scenario) : undefined,
      e.simulator,
    );
    assert(s.error || s.log.final.outcome);
  }
  assert(e.status !== "completed" || e.samples.length === experimentTotal(e));
  return {
    ...e,
    status:
      e.status === "running"
        ? e.samples.length === experimentTotal(e)
          ? "completed"
          : "interrupted"
        : e.status,
  };
}
