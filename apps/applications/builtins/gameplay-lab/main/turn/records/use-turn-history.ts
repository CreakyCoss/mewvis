import { useEffect, useState } from "react";
import type { IncompatibleData } from "../../projects/incompatible";
import { type Project } from "../../projects/model";
import { type Experiment, type Trial } from "./records";
import { historyRepository } from "./repository";
export function useTurnHistory(project: Project) {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [incompatible, setIncompatible] = useState<IncompatibleData[]>([]);
  const [historyReady, setHistoryReady] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);

  useEffect(() => {
    if (!project.id) return;
    let active = true;
    setHistoryReady("");
    setHistoryError("");
    setIncompatible([]);
    void historyRepository()
      .list(project)
      .then((result) => {
        if (!active) return;
        setTrials((ts) => [
          ...ts.filter((t) => t.projectId !== project.id),
          ...result.trials,
        ]);
        setExperiments((es) => [
          ...es.filter((e) => e.projectId !== project.id),
          ...result.experiments,
        ]);
        setHistoryError(result.errors.join("；"));
        setIncompatible(result.incompatible);
        setHistoryReady(project.id);
      })
      .catch((cause) => {
        if (active)
          setHistoryError(
            `记录加载失败：${cause instanceof Error ? cause.message : String(cause)}`,
          );
      });
    return () => {
      active = false;
    };
  }, [project.id, project.path, historyRevision]);

  return {
    trials,
    setTrials,
    experiments,
    setExperiments,
    historyReady,
    historyError,
    incompatible,
    reloadHistory: () => setHistoryRevision((n) => n + 1),
  };
}
