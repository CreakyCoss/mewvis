import { type ReactNode, useEffect, useState } from "react";
import { initializeConfigDatabase } from "@/api/recovery";
import { APP_DISPLAY_NAME } from "@/product-config";

type StartupGateProps = {
  children: ReactNode;
};

type StartupScreenProps = {
  isComplete?: boolean;
  statusText: string;
};

const STARTUP_PREVIEW_COMPLETE_DELAY_MS = 320;
const STARTUP_PREVIEW_DURATION_MS = 10_000;
const BRAND_I_DOT_IMAGE = "/assets/startup/mewvis-i-dot.png";

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

const StartupBrandName = () => {
  const dotIndex = APP_DISPLAY_NAME.lastIndexOf("i");

  if (dotIndex < 0) {
    return <h1 className="startup-welcome__brand-name">{APP_DISPLAY_NAME}</h1>;
  }

  return (
    <h1 className="startup-welcome__brand-name" aria-label={APP_DISPLAY_NAME}>
      <span aria-hidden="true">{APP_DISPLAY_NAME.slice(0, dotIndex)}</span>
      <span className="startup-welcome__brand-i" aria-hidden="true">
        <span className="startup-welcome__brand-i-letter">i</span>
        <img
          className="startup-welcome__brand-i-dot"
          src={BRAND_I_DOT_IMAGE}
          alt=""
          width="256"
          height="256"
          decoding="sync"
        />
      </span>
      <span aria-hidden="true">{APP_DISPLAY_NAME.slice(dotIndex + 1)}</span>
    </h1>
  );
};

export const StartupGate = ({ children }: StartupGateProps) => {
  const [isComplete, setIsComplete] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [statusText, setStatusText] = useState("正在准备创作空间");

  useEffect(() => {
    let isCancelled = false;

    const initialize = async () => {
      if (shouldHoldStartupPreview()) {
        const holdLoadingState = shouldHoldStartupLoadingPreview();
        await wait(STARTUP_PREVIEW_COMPLETE_DELAY_MS);

        if (!isCancelled && !holdLoadingState) {
          setStatusText("准备好了");
          setIsComplete(true);
        }

        await wait(Math.max(STARTUP_PREVIEW_DURATION_MS - STARTUP_PREVIEW_COMPLETE_DELAY_MS, 0));

        if (!isCancelled) {
          setIsReady(true);
        }
        return;
      }

      try {
        await initializeConfigDatabaseOnce();
      } catch {
        // Recovery UI handles initialization failures after the application renders.
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
          <StartupBrandName />
          <p className="startup-welcome__tagline">你的 AI 工作伙伴</p>
        </header>

        <div className="startup-welcome__status" role="status" aria-live="polite">
          <span className="startup-welcome__status-dot" aria-hidden="true" />
          <span>{statusText}</span>
        </div>
      </section>
    </main>
  );
};
