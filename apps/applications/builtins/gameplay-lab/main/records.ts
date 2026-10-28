import { copy, uid, validateModel, type Model } from "./model";
import {
  choose,
  current,
  startRun,
  step,
  type Choice,
  type Entry,
  type Policy,
  type Run,
  type State,
} from "./engine";
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
  drivers: ("manual" | Policy)[];
  run: Run;
}
export interface TrialDocument {
  format: "gameplay-run-v1";
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
  policy: Policy;
  index: number;
  seed: number;
  log: RunLog;
  error?: string;
}
export interface Experiment {
  format: "gameplay-experiment-v1";
  engine: number;
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  seed: number;
  players: number;
  model: Model;
  policies: Policy[];
  count: number;
  status: "running" | "completed" | "cancelled" | "interrupted";
  samples: Sample[];
}
export const policyValid = (p: unknown): p is Policy =>
  p === "goal" || p === "growth" || p === "random";
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
): Run {
  assert(
    log &&
      Array.isArray(log.choices) &&
      log.choices.length <= 200 &&
      Array.isArray(log.events) &&
      log.events.length === log.choices.length + 1,
  );
  let run = startRun(model, seed, players);
  for (const c of log.choices) {
    assert(
      c &&
        typeof c.action === "string" &&
        (c.cards === undefined ||
          (Array.isArray(c.cards) &&
            c.cards.length <= 10 &&
            c.cards.every((v) => typeof v === "string"))),
    );
    run = step(run, c);
  }
  assert(
    JSON.stringify(runLog(run)) === JSON.stringify(log),
    "记录与规则回放不一致，原文件已保留。",
  );
  return run;
}
export function trialDocument(t: Trial): TrialDocument {
  return {
    format: "gameplay-run-v1",
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
): Trial {
  const now = new Date().toISOString();
  return {
    id: uid("run"),
    projectId,
    createdAt: now,
    updatedAt: now,
    drivers: [],
    run: startRun(model, seed, players),
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
export function nextSample(e: Experiment): Sample | null {
  for (const policy of e.policies)
    for (let index = 0; index < e.count; index++) {
      if (e.samples.some((s) => s.policy === policy && s.index === index))
        continue;
      const seed = (e.seed + index) >>> 0;
      let run = startRun(e.model, seed, e.players),
        error: string | undefined;
      try {
        while (!current(run).outcome) run = step(run, choose(run, policy));
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }
      return {
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
  return e.policies.map((policy) => {
    const all = e.samples.filter((s) => s.policy === policy),
      completed = all.filter((s) => !s.error);
    return {
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
    };
  });
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
  if (v.format === "gameplay-run-v1") {
    const run = restoreLog(v.model, v.seed, v.players, v.log);
    assert(
      Array.isArray(v.drivers) &&
        v.drivers.length === v.log.choices.length &&
        v.drivers.every((p) => p === "manual" || policyValid(p)),
    );
    return {
      id: v.id,
      projectId,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      drivers: v.drivers,
      run,
    };
  }
  assert(v.format === "gameplay-experiment-v1");
  const e = v as Experiment;
  assert(
    Array.isArray(e.policies) &&
      e.policies.length > 0 &&
      e.policies.length <= 3 &&
      e.policies.every(policyValid) &&
      new Set(e.policies).size === e.policies.length &&
      Number.isInteger(e.count) &&
      e.count >= 1 &&
      e.count <= 12,
  );
  assert(
    ["running", "completed", "cancelled", "interrupted"].includes(e.status) &&
      Array.isArray(e.samples) &&
      e.samples.length <= e.count * e.policies.length,
  );
  const keys = new Set<string>();
  for (const s of e.samples) {
    const key = `${s.policy}:${s.index}`;
    assert(
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
    restoreLog(e.model, s.seed, e.players, s.log);
    assert(s.error || s.log.final.outcome);
  }
  assert(
    e.status !== "completed" ||
      e.samples.length === e.count * e.policies.length,
  );
  return {
    ...e,
    status:
      e.status === "running"
        ? e.samples.length === e.count * e.policies.length
          ? "completed"
          : "interrupted"
        : e.status,
  };
}
