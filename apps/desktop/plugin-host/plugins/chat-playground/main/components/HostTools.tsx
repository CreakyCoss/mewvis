import { useState } from "react";
import { getPluginHost } from "@isle/plugin-sdk/browser";
import type { TextInspection } from "../contracts";

/** Ordinary React business UI. The SDK transports the call to this plugin's Node tool. */
export function HostTools() {
  const [text, setText] = useState("Hello Isle 👋");
  const [result, setResult] = useState<TextInspection>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inspect = async () => {
    setPending(true);
    setResult(undefined);
    setError("");
    try {
      const response = await getPluginHost().executeTool<TextInspection>("chat_playground_inspect_text", { text });
      setResult(response.value);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <details className="lab-host-tools">
      <summary>宿主能力示例 · 文本分析</summary>
      <p>页面通过 SDK 调用本插件的 Node 工具，计算字符数、UTF-8 字节数和 SHA-256。</p>
      <div className="lab-host-input">
        <label htmlFor="lab-host-text">分析文本</label>
        <input id="lab-host-text" value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} />
        <button type="button" disabled={pending} onClick={() => void inspect()}>
          {pending ? "分析中…" : "调用宿主工具"}
        </button>
      </div>
      {pending && <p role="status">等待宿主返回…</p>}
      {error && (
        <p className="lab-error" role="alert">
          {error}
        </p>
      )}
      {result && <pre aria-label="宿主结果">{JSON.stringify(result, null, 2)}</pre>}
      <p className="lab-help">此操作不会调用模型或读写文件。清空文本后调用，可检查宿主参数校验。</p>
    </details>
  );
}
