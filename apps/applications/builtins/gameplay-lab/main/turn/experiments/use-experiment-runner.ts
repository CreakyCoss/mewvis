import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { type Project } from "../../projects/model";
import { projectRepository } from "../../projects/repository";
import { copy } from "../../shared/utils";
import { validateModel } from "../model";
import {
  selectedSetup,
  type ExperimentSetup,
  type PlaytestConfig,
} from "../playtest/config";
import { playtestRepository } from "../playtest/repository";
import {
  newConfiguredExperiment,
  nextSample,
  type Experiment,
} from "../records/records";
import { historyRepository } from "../records/repository";
import { experimentTotal } from "./comparison";
export function useExperimentRunner({
  project,
  config,
  configReady,
  historyReady,
  blocked,
  setExperiments,
  onStarted,
  onError,
}: {
  project: Project;
  config: PlaytestConfig | null;
  configReady: string;
  historyReady: boolean;
  blocked: boolean;
  setExperiments: Dispatch<SetStateAction<Experiment[]>>;
  onStarted(): void;
  onError(message: string): void;
}) {
  const model = project.model;
  const [progress, setProgress] = useState("");
  const experimentRunning = useRef(false);
  const cancelled = useRef(false);
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  async function experiment(existing?: Experiment, proposed?: Experiment) {
    if (experimentRunning.current || !historyReady) return;
    if (!existing && !proposed && blocked) {
      onError("请先修复模型问题。");
      return;
    }
    experimentRunning.current = true;
    cancelled.current = false;
    const location = copy(project);
    let result: Experiment;
    try {
      if (!existing && (!config || configReady !== project.id))
        throw new Error("请先读取场景与策略配置。");
      result = existing
        ? { ...copy(existing), status: "running" }
        : proposed
          ? copy(proposed)
          : newConfiguredExperiment(
              project.id,
              model,
              selectedSetup(config!, model, true) as ExperimentSetup,
              project.simulator!,
            );
    } catch (cause) {
      onError((cause as Error).message);
      experimentRunning.current = false;
      return;
    }
    const display = (value: Experiment) =>
      setExperiments((es) => [value, ...es.filter((e) => e.id !== value.id)]);
    try {
      if (!existing) {
        if (!proposed || !validateModel(location.model, true).length)
          await projectRepository().saveProject(location);
        await playtestRepository().save(location, config!);
      }
      await historyRepository().save(location, result);
      display(result);
      onStarted();
      while (!cancelled.current) {
        setProgress(`${result.samples.length}/${experimentTotal(result)} 局`);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled.current) break;
        const sample = nextSample(result);
        if (!sample) break;
        const next = {
          ...result,
          samples: [...result.samples, sample],
          updatedAt: new Date().toISOString(),
        };
        await historyRepository().save(location, next);
        result = next;
        display(result);
      }
      result = {
        ...result,
        status:
          result.samples.length === experimentTotal(result)
            ? "completed"
            : "cancelled",
        updatedAt: new Date().toISOString(),
      };
      await historyRepository().save(location, result);
      display(result);
    } catch (cause) {
      display({ ...result, status: "interrupted" });
      onError(`实验已暂停，已写入的样本仍可查看。${(cause as Error).message}`);
    } finally {
      setProgress("");
      experimentRunning.current = false;
    }
  }

  return {
    experiment,
    progress,
    cancelExperiment: () => {
      cancelled.current = true;
    },
  };
}
