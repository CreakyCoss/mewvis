import { type ReactNode, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { initializeConfigDatabase } from "@/features/app-recovery/api";
import { StartupScreen } from "./startup-screen";

type StartupGateProps = {
  children: ReactNode;
};

const MIN_STARTUP_DURATION_MS = 2_000;
const STARTUP_COMPLETE_SPARKLE_MS = 1_000;
const STARTUP_PREVIEW_DURATION_MS = 10_000;
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

function shouldHoldStartupPreview() {
  return Array.from(new URLSearchParams(window.location.search).keys()).some((key) =>
    key.startsWith("startup-")
  );
}

export const StartupGate = ({ children }: StartupGateProps) => {
  const [isComplete, setIsComplete] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [statusText, setStatusText] = useState("正在初始化配置数据库");

  useEffect(() => {
    let isCancelled = false;

    const initialize = async () => {
      if (!isTauri()) {
        if (shouldHoldStartupPreview()) {
          await wait(MIN_STARTUP_DURATION_MS);

          if (!isCancelled) {
            setIsComplete(true);
          }

          await wait(Math.max(STARTUP_PREVIEW_DURATION_MS - MIN_STARTUP_DURATION_MS, 0));
        }

        if (!isCancelled) {
          setIsReady(true);
        }
        return;
      }

      const minimumDuration = wait(MIN_STARTUP_DURATION_MS);

      try {
        setStatusText("正在初始化配置数据库");
        await Promise.all([initializeConfigDatabaseOnce(), minimumDuration]);
      } catch {
        await minimumDuration;
      }

      if (!isCancelled) {
        setStatusText("启动检查完成");
        setIsComplete(true);
        await wait(STARTUP_COMPLETE_SPARKLE_MS);
      }

      if (!isCancelled) {
        setIsReady(true);
      }
    };

    void initialize();

    return () => {
      isCancelled = true;
    };
  }, []);

  if (!isReady) {
    return <StartupScreen isComplete={isComplete} statusText={statusText} />;
  }

  return children;
};
