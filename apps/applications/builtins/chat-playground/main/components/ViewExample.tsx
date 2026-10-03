import { useEffect, useRef, useState } from "react";
import { PanelTop, Play, Send, Square } from "lucide-react";
import {
  mountApplicationView,
  type ApplicationView,
} from "@mewvis/app-sdk/views";
import { embeddedScript } from "../embedded-view.generated";
import { CodeExample, Feedback, PageHeading, errorText } from "./Example";

export const viewCode = [
  'import { mountApplicationView } from "@mewvis/app-sdk/views";',
  "// script 是包含 getApplicationViewClient() 的独立浏览器 bundle。",
  "const view = mountApplicationView(container, {",
  '  id: "demo", title: "独立视图", script,',
  '  methods: { "counter.increment": async () => ++count },',
  "});",
  "await view.ready;",
  'view.postMessage({ message: "来自父应用的消息" });',
  "// 页面退出或替换视图时：",
  "view.dispose();",
].join("\n");

const style = [
  "body{background:var(--background,#f7f8fc);color:var(--foreground,#23232d);font:13px/1.6 system-ui,sans-serif}",
  "main{padding:20px}h3{font-size:16px;line-height:1.4;margin:8px 0}.eyebrow{color:var(--primary,#5a56d6);font-size:12px}",
  ".message{min-height:40px;overflow-wrap:anywhere;color:var(--muted-foreground,#656978)}",
  "button{font:inherit;min-height:34px;padding:6px 12px;border:0;border-radius:6px;color:var(--primary-foreground,#fff);background:var(--primary,#5a56d6);cursor:pointer}",
  "button:disabled{opacity:.5;cursor:wait}button:focus-visible{outline:2px solid var(--primary,#5a56d6);outline-offset:4px}",
].join("\n");

export function ViewExample() {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<ApplicationView | undefined>(undefined);
  const generation = useRef(0);
  const counter = useRef(0);
  const [phase, setPhase] = useState<
    "empty" | "loading" | "ready" | "closed" | "failed"
  >("empty");
  const [message, setMessage] = useState("你好，来自能力实验室！");
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState("");
  const record = (text: string) =>
    setEvents((items) => [...items, text].slice(-6));
  useEffect(
    () => () => {
      generation.current++;
      view.current?.dispose();
      view.current = undefined;
    },
    [],
  );
  const mount = async () => {
    if (!container.current || view.current) return;
    const current = ++generation.current;
    setPhase("loading");
    setError("");
    setEvents([]);
    counter.current = 0;
    try {
      const next = mountApplicationView(container.current, {
        id: "playground-demo",
        title: "调试台内嵌计数示例",
        script: embeddedScript,
        style,
        methods: {
          "counter.increment": async (_params, { signal }) => {
            signal.throwIfAborted();
            const value = ++counter.current;
            record("子视图请求 counter.increment → 返回 " + value);
            return value;
          },
        },
        onError: (error) => {
          if (current === generation.current) setError(errorText(error));
        },
      });
      view.current = next;
      await next.ready;
      if (current !== generation.current) {
        next.dispose();
        return;
      }
      setPhase("ready");
      record("视图已就绪 · 独立实例");
    } catch (error) {
      if (current !== generation.current) return;
      view.current?.dispose();
      view.current = undefined;
      setPhase("failed");
      setError(errorText(error));
    }
  };
  const send = () => {
    setError("");
    try {
      if (!view.current || view.current.state !== "ready")
        throw new Error("请先挂载视图，等待它就绪。");
      view.current.postMessage({ message });
      record("父应用发送消息 → " + message);
    } catch (error) {
      setError(errorText(error));
    }
  };
  const dispose = () => {
    generation.current++;
    view.current?.dispose();
    view.current = undefined;
    setPhase("closed");
    setError("");
    record("视图已卸载 · 监听器与连接已释放");
  };
  return (
    <>
      <PageHeading
        title="把一个小应用嵌进来"
        description="挂载独立界面，双向传递消息，再释放它。子视图只访问父应用明确提供的方法。"
      />
      <div className="showcase-split-panel">
        <section className="showcase-panel-body">
          <span className="showcase-kicker">生命周期与通信</span>
          <h2>由父应用掌控边界</h2>
          <p className="showcase-muted">
            先挂载示例，再向子视图发送消息；点击子视图里的按钮，观察方法调用返回。
          </p>
          <div className="showcase-actions">
            <button
              type="button"
              className="showcase-button is-primary"
              disabled={phase === "ready" || phase === "loading"}
              onClick={() => void mount()}
            >
              <Play />
              {phase === "loading" ? "挂载中…" : "挂载示例"}
            </button>
            <button
              type="button"
              className="showcase-button"
              disabled={phase !== "ready" && phase !== "loading"}
              onClick={dispose}
            >
              <Square />
              卸载视图
            </button>
          </div>
          <label className="showcase-field-label" htmlFor="demo-view-message">
            发送给子视图的消息
          </label>
          <input
            id="demo-view-message"
            value={message}
            maxLength={500}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button
            type="button"
            className="showcase-button showcase-send-message"
            disabled={phase !== "ready" || !message.trim()}
            onClick={send}
          >
            <Send />
            发送消息
          </button>
          <Feedback error={error} />
          <div className="showcase-event-log" aria-live="polite">
            <h3>通信记录</h3>
            {events.length ? (
              <ol>
                {events.map((event, index) => (
                  <li key={index}>{event}</li>
                ))}
              </ol>
            ) : (
              <p className="showcase-muted">
                运行示例后，这里会记录实际发生的通信。
              </p>
            )}
          </div>
        </section>
        <section className="showcase-panel-body showcase-panel-result">
          <div className="showcase-inline-heading">
            <h2>独立视图</h2>
            <span className="showcase-small-tag" role="status">
              {
                {
                  empty: "未挂载",
                  loading: "正在挂载",
                  ready: "已就绪",
                  closed: "已释放",
                  failed: "挂载失败",
                }[phase]
              }
            </span>
          </div>
          <div className="showcase-view-stage">
            <div
              ref={container}
              className="showcase-view-container"
              hidden={phase !== "ready" && phase !== "loading"}
            />
            {phase !== "ready" && phase !== "loading" && (
              <div className="showcase-empty">
                <PanelTop aria-hidden="true" />
                <p>
                  {phase === "closed"
                    ? "视图已释放，可以重新挂载一个新实例。"
                    : "点击挂载，开始体验一个独立界面。"}
                </p>
              </div>
            )}
          </div>
          <p className="showcase-muted">
            离开本页会释放视图。它不会继承应用的工具、数据或聊天连接。
          </p>
        </section>
      </div>
      <CodeExample code={viewCode} />
    </>
  );
}
