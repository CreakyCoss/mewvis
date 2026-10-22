import { useEffect, useRef, useState } from "react";
import { getApplicationViewClient } from "@mewvis/app-sdk/views";
import { restore, template, type Design } from "./model";

const KEY = "design-studio-v1";
export function useDesign() {
  const [design, setDesign] = useState(() => template("intro"));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("正在载入…");
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<Design | null>(null);
  const writing = useRef(false);
  const alive = useRef(true);
  const failed = useRef<Design | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoadError("");
    getApplicationViewClient()
      .request("state.read", { key: KEY })
      .then((value) => {
        if (!active) return;
        setDesign(value === null ? template("intro") : restore(value));
        setReady(true);
        setStatus("已保存到当前小应用");
      })
      .catch((error) => {
        if (active) setLoadError(String(error.message ?? error));
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function flush() {
    if (writing.current) return;
    writing.current = true;
    try {
      while (pending.current) {
        const value = pending.current;
        pending.current = null;
        try {
          await getApplicationViewClient().request("state.write", {
            key: KEY,
            value: JSON.parse(JSON.stringify(value)),
          });
          failed.current = null;
          if (alive.current)
            setStatus(pending.current ? "正在保存…" : "已保存到当前小应用");
        } catch {
          failed.current = pending.current ?? value;
          pending.current = null;
          if (alive.current) setStatus("保存失败，改动仍在当前页面");
        }
      }
    } finally {
      writing.current = false;
    }
  }
  useEffect(() => {
    if (!ready) return;
    pending.current = design;
    setStatus("正在保存…");
    void flush();
  }, [design, ready]);
  return {
    design,
    setDesign,
    ready,
    loadError,
    status,
    retryLoad: () => setAttempt((n) => n + 1),
    retrySave: () => {
      if (failed.current) {
        pending.current = failed.current;
        setStatus("正在保存…");
        void flush();
      }
    },
  };
}
