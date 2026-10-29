import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { type Project } from "../../projects/model";
import { projectRepository } from "../../projects/repository";
import { copy } from "../../shared/utils";
import { choose, current } from "../engine";
import { experimentVariants, sampleModel } from "../experiments/comparison";
import type { PlaytestConfig } from "../playtest/config";
import { initialOf, selectedSetup, type RunSetup } from "../playtest/config";
import { playtestRepository } from "../playtest/repository";
import { advanceSimulatedRun } from "../simulators";
import {
  experimentPolicyName,
  newTrial,
  restoreLog,
  trialChoice,
  type Experiment,
  type Sample,
  type Trial,
} from "./records";
import { historyRepository } from "./repository";
export function useRunSession({
  project,
  config,
  configReady,
  historyReady,
  trials,
  setTrials,
  busy,
  setBusy,
  setError,
  onOpen,
}: {
  project: Project;
  config: PlaytestConfig | null;
  configReady: string;
  historyReady: string;
  trials: Trial[];
  setTrials: Dispatch<SetStateAction<Trial[]>>;
  busy: boolean;
  setBusy(busy: boolean): void;
  setError(message: string): void;
  onOpen(): void;
}) {
  const model = project.model;
  const [activeTrial, setActiveTrial] = useState("");
  const [cursor, setCursor] = useState(-1),
    [cards, setCards] = useState<string[]>([]);
  const [previewTrial, setPreviewTrial] = useState<Trial | null>(null);
  const [previewLabel, setPreviewLabel] = useState("");
  const trial = previewTrial ?? trials.find((t) => t.id === activeTrial);
  const run = trial?.run,
    state = run ? current(run) : null;

  useEffect(() => {
    if (!state || !run) return;
    const next = choose(run, "goal");
    setCards(next.cards ?? []);
  }, [run?.entries.length, activeTrial]);

  async function begin() {
    if (
      busy ||
      historyReady !== project.id ||
      !config ||
      configReady !== project.id
    )
      return;
    setBusy(true);
    try {
      if (!project.simulator) throw new Error("请先在策划概览选择玩法模拟器。");
      const setup = selectedSetup(config, model) as RunSetup;
      const trial = newTrial(
        project.id,
        model,
        setup.scenario.seedStart,
        setup.scenario.participants.length,
        setup,
        project.simulator,
      );
      await projectRepository().saveProject(project);
      await playtestRepository().save(project, config);
      await historyRepository().save(project, trial);
      setTrials((ts) => [trial, ...ts]);
      setPreviewTrial(null);
      setActiveTrial(trial.id);
      setCursor(-1);
      onOpen();
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function execute(action: string, automatic = false) {
    if (!run || !trial || previewTrial || busy) return;
    setBusy(true);
    try {
      const decision = automatic
        ? trialChoice(trial)
        : { driver: "manual", choice: { action, cards } };
      const next = {
        ...trial,
        run: advanceSimulatedRun(run, decision.choice),
        drivers: [...trial.drivers, decision.driver],
        updatedAt: new Date().toISOString(),
      };
      await historyRepository().save(project, next);
      setTrials((ts) => ts.map((t) => (t.id === next.id ? next : t)));
      setCursor(-1);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function previewSample(experiment: Experiment, sample: Sample) {
    try {
      const run = restoreLog(
        sampleModel(experiment, sample),
        sample.seed,
        experiment.players,
        sample.log,
        experiment.setup ? initialOf(experiment.setup.scenario) : undefined,
        experiment.simulator,
      );
      const arm = experiment.setup?.arms.find((a) => a.id === sample.policy);
      const setup =
        experiment.setup && arm
          ? {
              scenario: {
                ...copy(experiment.setup.scenario),
                participants: experiment.setup.scenario.participants.map(
                  (p, i) => ({ ...copy(p), strategyId: arm.strategyIds[i] }),
                ),
              },
              strategies: copy(experiment.setup.strategies),
            }
          : undefined;
      setPreviewTrial({
        ...(setup ? { setup } : {}),
        id: `${experiment.id}-${sample.variant ?? "baseline"}-${sample.policy}-${sample.index}`,
        projectId: experiment.projectId,
        createdAt: experiment.createdAt,
        updatedAt: experiment.updatedAt,
        drivers: [],
        run,
      });
      setPreviewLabel(
        `${experiment.comparison ? experimentVariants(experiment).find((v) => v.id === sample.variant)?.name + " · " : ""}${experimentPolicyName(experiment, sample.policy)} · 种子 ${sample.seed}`,
      );
      setCursor(0);
      onOpen();
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return {
    trial,
    cursor,
    cards,
    previewTrial,
    previewLabel,
    setCursor,
    setCards,
    begin,
    execute,
    previewSample,
    clearSession: () => {
      setPreviewTrial(null);
      setActiveTrial("");
    },
    openTrial: (trial: Trial) => {
      setPreviewTrial(null);
      setActiveTrial(trial.id);
      setCursor(-1);
      onOpen();
    },
  };
}
