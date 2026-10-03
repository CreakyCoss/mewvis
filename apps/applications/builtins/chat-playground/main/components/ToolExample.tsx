import { APP_DISPLAY_NAME } from "@mewvis/product-config";
import { useId, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  LoaderCircle,
  Play,
  X,
} from "lucide-react";
import { getApplicationHost } from "@mewvis/app-sdk/browser";
import type { TextInspection } from "../contracts";
import { CodeExample, Feedback, errorText } from "./Example";

export const inspectCode = [
  'import { getApplicationHost } from "@mewvis/app-sdk/browser";',
  "",
  "const { value } = await getApplicationHost().executeTool(",
  '  "chat_playground_inspect_text",',
  `  { text: "Hello ${APP_DISPLAY_NAME} 👋" },`,
  ");",
  "",
  "// value: { text, characters, bytes, sha256, runtime }",
].join("\n");

/** Only a successful host call produces a real result. */
export function ToolExample() {
  const id = useId();
  const [text, setText] = useState(`Hello ${APP_DISPLAY_NAME} 👋`);
  const [result, setResult] = useState<{
    value: TextInspection;
    elapsed: number;
  }>();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const inspect = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setResult(undefined);
    setError("");
    setShowResult(false);
    const started = performance.now();
    try {
      const response = await getApplicationHost().executeTool<TextInspection>(
        "chat_playground_inspect_text",
        { text },
      );
      setResult({
        value: response.value,
        elapsed: Math.round(performance.now() - started),
      });
    } catch (error) {
      setError(errorText(error));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const stale = result && text !== result.value.text;
  const sample = !result && !pending && !error;
  return (
    <section className="showcase-tool-example" aria-label="宿主文本分析示例">
      <div className="showcase-feature">
        <div className="showcase-feature-input">
          <span className="showcase-kicker">推荐起点 · 宿主工具</span>
          <h2>让页面调用一次 Node 工具</h2>
          <p>
            通过内置的 Node 工具，计算文本的字符数、UTF-8 字节数和 SHA-256。
            <br />
            不需要模型或工作区，从一次调用开始体验。
          </p>
          <label className="showcase-field-label" htmlFor={id}>
            分析文本
          </label>
          <div className="showcase-input-wrap">
            <input
              id={id}
              value={text}
              maxLength={2000}
              disabled={pending}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing)
                  void inspect();
              }}
            />
            {text && (
              <button
                type="button"
                className="showcase-clear"
                disabled={pending}
                aria-label="清空分析文本"
                onClick={() => setText("")}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="showcase-feature-actions">
            <button
              type="button"
              className="showcase-button is-primary"
              disabled={pending}
              onClick={() => void inspect()}
            >
              {pending ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
              {pending ? "运行中…" : "运行示例"}
            </button>
            <button
              type="button"
              className="showcase-text-button"
              aria-expanded={showCode}
              aria-controls={id + "-code"}
              onClick={() => setShowCode(!showCode)}
            >
              <Code2 aria-hidden="true" />
              {showCode ? "收起接入代码" : "查看接入代码"}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <Feedback error={error} />
        </div>
        <div
          className="showcase-feature-result"
          aria-live="polite"
          aria-busy={pending}
        >
          <h2>{result ? "运行结果" : "你会得到"}</h2>
          <p>
            {pending
              ? "正在等待宿主返回结果…"
              : error
                ? "调用未完成，请检查提示后重试。"
                : result
                  ? stale
                    ? "输入已修改，下方仍是上一次运行结果。"
                    : "工具执行成功，返回以下结果："
                  : "运行后，在这里查看工具返回的结果。"}
          </p>
          <dl className="showcase-result-table">
            <div>
              <dt>字符数</dt>
              <dd>{result?.value.characters ?? (sample ? 14 : "—")}</dd>
            </div>
            <div>
              <dt>UTF-8 字节数</dt>
              <dd>{result?.value.bytes ?? (sample ? 17 : "—")}</dd>
            </div>
            <div>
              <dt>SHA-256</dt>
              <dd className="showcase-hash">
                <span>
                  {result
                    ? result.value.sha256.slice(0, 16) + "…"
                    : "运行后生成"}
                </span>
                {result && (
                  <button
                    type="button"
                    className="showcase-text-button"
                    aria-expanded={showResult}
                    onClick={() => setShowResult(!showResult)}
                  >
                    {showResult ? "收起" : "查看完整结果"}
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt>运行环境</dt>
              <dd>{result ? "Node.js" : sample ? "Node.js（示例）" : "—"}</dd>
            </div>
            <div>
              <dt>调用耗时</dt>
              <dd>{result ? result.elapsed + " ms" : "运行后测量"}</dd>
            </div>
          </dl>
          {sample && (
            <p className="showcase-result-note">
              <CheckCircle2 aria-hidden="true" />
              <span>示例结果 · 基于输入 “Hello {APP_DISPLAY_NAME} 👋”</span>
            </p>
          )}
          {result && (
            <p className="showcase-result-note">
              <CheckCircle2 aria-hidden="true" />
              <span>
                {stale
                  ? "上次结果 · 重新运行以更新"
                  : "实际结果 · 由本次宿主调用返回"}
              </span>
            </p>
          )}
          {showResult && result && (
            <pre className="showcase-json" aria-label="宿主结果">
              {JSON.stringify(result.value, null, 2)}
            </pre>
          )}
        </div>
      </div>
      {showCode && (
        <div id={id + "-code"}>
          <CodeExample code={inspectCode} title="页面调用 · browser SDK" open />
        </div>
      )}
    </section>
  );
}
