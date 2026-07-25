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

const MIN_STARTUP_DURATION_MS = 320;
const STARTUP_COMPLETE_SETTLE_MS = 120;
const STARTUP_PREVIEW_DURATION_MS = 10_000;
const STARTUP_CATS = [
  {
    id: "mewvis",
    image: "/assets/startup-cats/portraits/mewvis.png",
    label: "喵维斯",
  },
  {
    id: "lihua",
    image: "/assets/startup-cats/portraits/lihua.png",
    label: "狸花猫",
  },
  {
    id: "orange",
    image: "/assets/startup-cats/portraits/orange.png",
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

function shouldHoldStartupLoadingPreview() {
  return new URLSearchParams(window.location.search).has("startup-loading");
}

export const StartupGate = ({ children }: StartupGateProps) => {
  const [isComplete, setIsComplete] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [statusText, setStatusText] = useState("正在准备创作空间");

  useEffect(() => {
    let isCancelled = false;

    const initialize = async () => {
      if (shouldHoldStartupPreview()) {
        const holdLoadingState = shouldHoldStartupLoadingPreview();
        await wait(MIN_STARTUP_DURATION_MS);

        if (!isCancelled && !holdLoadingState) {
          setStatusText("准备好了");
          setIsComplete(true);
        }

        await wait(Math.max(STARTUP_PREVIEW_DURATION_MS - MIN_STARTUP_DURATION_MS, 0));

        if (!isCancelled) {
          setIsReady(true);
        }
        return;
      }

      if (!isTauri()) {
        if (!isCancelled) {
          setIsReady(true);
        }
        return;
      }

      const minimumDuration = wait(MIN_STARTUP_DURATION_MS);

      try {
        setStatusText("正在准备创作空间");
        await Promise.all([initializeConfigDatabaseOnce(), minimumDuration]);
      } catch {
        await minimumDuration;
      }

      if (!isCancelled) {
        setStatusText("准备好了");
        setIsComplete(true);
        await wait(STARTUP_COMPLETE_SETTLE_MS);
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

const StartupScreen = ({ isComplete = false, statusText }: StartupScreenProps) => {
  return (
    <main
      className={`startup-welcome${isComplete ? " startup-welcome--complete" : ""}`}
      aria-busy={!isComplete}
      aria-label={`${APP_DISPLAY_NAME} 正在启动`}
    >
      <section className="startup-welcome__content">
        <header className="startup-welcome__brand">
          <div className="startup-welcome__brand-lockup">
            <h1 className="startup-welcome__brand-name">{APP_DISPLAY_NAME}</h1>
            <div className="startup-welcome__cats" role="img" aria-label="喵维斯、狸花猫和橘猫">
              {STARTUP_CATS.map((cat) => (
                <span key={cat.id} className={`startup-welcome__cat startup-welcome__cat--${cat.id}`}>
                  <img
                    className="startup-welcome__cat-image"
                    src={cat.image}
                    alt=""
                    width="512"
                    height="512"
                    decoding="sync"
                    aria-hidden="true"
                  />
                </span>
              ))}
            </div>
          </div>
          <p className="startup-welcome__tagline">你的 AI 故事创作伙伴</p>
        </header>

        <div className="startup-welcome__status" role="status" aria-live="polite">
          <span className="startup-welcome__status-dot" aria-hidden="true" />
          <span>{statusText}</span>
        </div>
      </section>
    </main>
  );
};
