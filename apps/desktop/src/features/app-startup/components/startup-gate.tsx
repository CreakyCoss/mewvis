import { type ReactNode, useEffect, useState } from "react";
import { initializeConfigDatabase } from "@/features/app-recovery/api";
import { StartupScreen } from "./startup-screen";

type StartupGateProps = {
  children: ReactNode;
};

const MIN_STARTUP_DURATION_MS = 3_000;
let configDatabaseInitialization: Promise<void> | null = null;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function initializeConfigDatabaseOnce() {
  configDatabaseInitialization ??= initializeConfigDatabase().then(() => undefined);
  return configDatabaseInitialization;
}

export const StartupGate = ({ children }: StartupGateProps) => {
  const [isReady, setIsReady] = useState(false);
  const [statusText, setStatusText] = useState("正在初始化配置数据库");

  useEffect(() => {
    let isCancelled = false;

    const initialize = async () => {
      const minimumDuration = wait(MIN_STARTUP_DURATION_MS);

      try {
        setStatusText("正在初始化配置数据库");
        await Promise.all([initializeConfigDatabaseOnce(), minimumDuration]);
      } catch {
        await minimumDuration;
      }

      if (!isCancelled) {
        setStatusText("启动检查完成");
        setIsReady(true);
      }
    };

    void initialize();

    return () => {
      isCancelled = true;
    };
  }, []);

  if (!isReady) {
    return <StartupScreen statusText={statusText} />;
  }

  return children;
};
