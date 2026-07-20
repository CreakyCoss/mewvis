import { type ReactNode, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { initializeConfigDatabase } from "@/api/recovery";
import { APP_DISPLAY_NAME } from "@/product-config";

type StartupGateProps = {
  children: ReactNode;
};

type StartupScreenProps = {
  isComplete?: boolean;
  statusText: string;
};

const MIN_STARTUP_DURATION_MS = 2_000;
const STARTUP_COMPLETE_SPARKLE_MS = 1_000;
const STARTUP_PREVIEW_DURATION_MS = 10_000;
const STARTUP_CATS = [
  {
    id: "mewvis",
    sheet: "/assets/startup-cats/spritesheets/mewvis-walk.png",
    label: "Mewvis",
  },
  {
    id: "lihua",
    sheet: "/assets/startup-cats/spritesheets/lihua-walk.png",
    label: "狸花猫",
  },
  {
    id: "orange",
    sheet: "/assets/startup-cats/spritesheets/orange-walk.png",
    label: "橘猫",
  },
];

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
  return Array.from(new URLSearchParams(window.location.search).keys()).some((key) => key.startsWith("startup-"));
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

const StartupLogo = () => (
  <img className="startup-screen__logo" src="/assets/startup-cat-icon.png" alt="" aria-hidden="true" />
);

const StartupScreen = ({ isComplete = false, statusText }: StartupScreenProps) => {
  return (
    <main
      className={`startup-screen${isComplete ? " startup-screen--complete" : ""}`}
      aria-busy="true"
      aria-label={`${APP_DISPLAY_NAME} 正在启动`}
    >
      <section className="startup-screen__content">
        <div className="startup-screen__brand">
          <StartupLogo />
          <h1 className="startup-screen__brand-name">{APP_DISPLAY_NAME}</h1>
        </div>
        <div className="startup-screen__cat-progress" aria-hidden="true">
          <div className="startup-screen__cat-lane">
            <span className="startup-screen__lane-fill" />
            <span className="startup-screen__paw-trail" />
            <span className="startup-screen__lane-head" />
            {STARTUP_CATS.map((cat) => (
              <span key={cat.id} className={`startup-screen__cat-walker startup-screen__cat-walker--${cat.id}`}>
                <span className="startup-screen__cat-sprite">
                  <img className="startup-screen__cat-sheet" src={cat.sheet} alt="" />
                </span>
                <span className="startup-screen__cat-name">{cat.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="startup-screen__status">{statusText}</div>
      </section>
    </main>
  );
};
