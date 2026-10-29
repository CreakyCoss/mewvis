import { useEffect, useMemo, useRef, useState } from "react";
import { type Project } from "../../projects/model";
import { selectedSetup, type PlaytestConfig } from "./config";
import { playtestRepository } from "./repository";
export function usePlaytestConfig(project: Project, busy: boolean) {
  const model = project.model;
  const [config, setConfig] = useState<PlaytestConfig | null>(null);
  const [configReady, setConfigReady] = useState("");
  const [configError, setConfigError] = useState("");
  const [configStatus, setConfigStatus] = useState("正在加载");
  const [configRevision, setConfigRevision] = useState(0);
  const configSequence = useRef(0);

  const setupValidation = useMemo(() => {
    if (
      !config ||
      config.projectId !== project.id ||
      configReady !== project.id
    )
      return {
        runError: "正在读取场景与策略配置。",
        experimentError: "正在读取场景与策略配置。",
      };
    let runError = "",
      experimentError = "";
    try {
      selectedSetup(config, model);
    } catch (cause) {
      runError = (cause as Error).message;
    }
    try {
      selectedSetup(config, model, true);
    } catch (cause) {
      experimentError = (cause as Error).message;
    }
    return { runError, experimentError };
  }, [config, configReady, model, project.id]);

  useEffect(() => {
    if (!project.id) return;
    let active = true;
    setConfigReady("");
    setConfigError("");
    setConfigStatus("正在加载");
    setConfig(null);
    void playtestRepository()
      .load(project)
      .then((value) => {
        if (!active) return;
        setConfig(value);
        setConfigReady(project.id);
        setConfigStatus("已读取");
      })
      .catch((cause) => {
        if (active) {
          setConfigError((cause as Error).message);
          setConfigStatus("读取失败");
        }
      });
    return () => {
      active = false;
    };
  }, [project.id, project.path, configRevision]);
  useEffect(() => {
    if (!config || configReady !== project.id || busy) return;
    const sequence = ++configSequence.current;
    setConfigStatus("保存中");
    const timer = setTimeout(() => {
      void playtestRepository()
        .save(project, config)
        .then(() => {
          if (sequence === configSequence.current) {
            setConfigStatus("已保存");
            setConfigError("");
          }
        })
        .catch((cause) => {
          if (sequence === configSequence.current) {
            setConfigStatus("保存失败");
            setConfigError((cause as Error).message);
          }
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [config, configReady, project.id, project.path, busy]);

  return {
    config,
    setConfig,
    configReady,
    configError,
    configStatus,
    setupValidation,
    reloadConfig: () => setConfigRevision((n) => n + 1),
  };
}
