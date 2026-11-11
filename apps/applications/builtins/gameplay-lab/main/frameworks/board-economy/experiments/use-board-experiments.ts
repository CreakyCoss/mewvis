import { useEffect, useRef, useState } from "react";
import type { Project } from "../../../app/projects/model";
import type { IncompatibleData } from "../../../app/projects/incompatible";
import { copy } from "../../../shared/utils";
import {
  newBoardExperiment,
  type BoardExperiment,
  type BoardExperimentPlan,
} from "./model";
import { boardExperimentHistory } from "./repository";
import { runBoardExperimentBatch } from "./runner";
import type { BoardModel } from "../model";
interface Job {
  cancelled: boolean;
  done: Promise<boolean>;
}
export function useBoardExperiments(
  project: Project<BoardModel>,
  saveProject: () => Promise<void>,
) {
  const [records, setRecords] = useState<BoardExperiment[]>([]),
    [ready, setReady] = useState(false),
    [errors, setErrors] = useState<string[]>([]),
    [incompatible, setIncompatible] = useState<IncompatibleData[]>([]),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [activeId, setActiveId] = useState(""),
    [running, setRunning] = useState(false),
    [stopping, setStopping] = useState(false);
  const live = useRef(true),
    job = useRef<Job | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (job.current) job.current.cancelled = true;
    };
  }, []);
  useEffect(() => {
    let current = true;
    setReady(false);
    void boardExperimentHistory()
      .list(project)
      .then((result) => {
        if (current) {
          setRecords(result.records);
          setErrors(result.errors);
          setIncompatible(result.incompatible);
          setReady(true);
        }
      })
      .catch((e) => {
        if (current) {
          setErrors([e.message]);
          setReady(false);
        }
      });
    return () => {
      current = false;
    };
  }, [project.id, revision]);
  const display = (value: BoardExperiment) => {
    if (live.current)
      setRecords((items) => [value, ...items.filter((e) => e.id !== value.id)]);
  };
  async function launch(initial: BoardExperiment, isNew: boolean) {
    if (job.current || !ready) return;
    const location = copy(project),
      control: Job = { cancelled: false, done: Promise.resolve(true) };
    job.current = control;
    setRunning(true);
    setStopping(false);
    setError("");
    control.done = (async () => {
      let latest: BoardExperiment | null = null;
      try {
        if (isNew) await saveProject();
        await boardExperimentHistory().save(location, initial);
        latest = initial;
        display(initial);
        if (live.current) setActiveId(initial.id);
        await runBoardExperimentBatch(initial, {
          persist: (next) => boardExperimentHistory().save(location, next),
          changed: (next) => {
            latest = next;
            display(next);
          },
          cancelled: () => control.cancelled,
        });
        return true;
      } catch (cause) {
        if (latest && latest.status === "running")
          display({ ...latest, status: "interrupted" });
        if (live.current)
          setError(
            `实验已中断，已保存样本仍可查看；请重新加载后继续。${(cause as Error).message}`,
          );
        return false;
      } finally {
        if (job.current === control) job.current = null;
        if (live.current) {
          setRunning(false);
          setStopping(false);
        }
      }
    })();
    await control.done;
  }
  function start(plan: BoardExperimentPlan) {
    try {
      void launch(newBoardExperiment(project.id, plan), true);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function resume(experiment: BoardExperiment) {
    if (experiment.status === "completed") return;
    void launch(
      {
        ...copy(experiment),
        status: "running",
        updatedAt: new Date().toISOString(),
      },
      false,
    );
  }
  async function cancel() {
    const current = job.current;
    if (current) {
      current.cancelled = true;
      setStopping(true);
      await current.done;
    }
  }
  async function stopAndFlush() {
    await cancel();
    await boardExperimentHistory().flush();
  }
  function reload() {
    if (!job.current) {
      setError("");
      setRevision((n) => n + 1);
    }
  }
  return {
    records,
    ready,
    errors,
    incompatible,
    error,
    running,
    stopping,
    activeId,
    setActiveId,
    start,
    resume,
    cancel,
    stopAndFlush,
    reload,
    remove: (id: string) =>
      boardExperimentHistory().removeIncompatible(project, id),
  };
}
