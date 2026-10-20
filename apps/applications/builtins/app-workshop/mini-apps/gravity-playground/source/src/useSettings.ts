import { useEffect, useRef, useState } from "react";
import { getApplicationViewClient } from "@mewvis/app-sdk/views";
import { defaultSettings, restoreSettings } from "./engine";

const KEY = "gravity-playground-v1";
export function useSettings() {
  const [settings, setSettings] = useState(defaultSettings),
    [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saved"),
    [reload, setReload] = useState(0),
    [retry, setRetry] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    setLoadError(false);
    getApplicationViewClient()
      .request("state.read", { key: KEY })
      .then((value) => {
        if (active) {
          setSettings(restoreSettings(value));
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setStatus("saving");
    queue.current = queue.current
      .catch(() => {})
      .then(() =>
        getApplicationViewClient().request("state.write", {
          key: KEY,
          value: settings,
        }),
      );
    queue.current
      .then(() => {
        if (active) setStatus("saved");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [settings, ready, retry]);
  return {
    settings,
    setSettings,
    ready,
    loadError,
    status,
    reload: () => setReload((n) => n + 1),
    retrySave: () => setRetry((n) => n + 1),
  };
}
