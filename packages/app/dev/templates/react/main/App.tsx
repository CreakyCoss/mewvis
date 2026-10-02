import { useEffect, useState } from "react";
import { getApplicationHost } from "@mewvis/app-sdk/browser";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
} from "@mewvis/app-sdk/chat";
import { Chat } from "@mewvis/app-sdk/chat/react";
import { getApplicationDataClient } from "@mewvis/app-sdk/data";
import type { TextInspection } from "./contracts";
import "./styles.css";

export default function App() {
  const [text, setText] = useState("Hello Mewvis 👋");
  const [result, setResult] = useState<TextInspection>();
  const [session, setSession] = useState<ApplicationChatSession>();
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [workspaceId, setWorkspaceId] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getApplicationDataClient()
      .workspaces.list()
      .then((items) => {
        if (active) {
          setWorkspaces(items);
          setWorkspaceId(
            items.find((item) => item.isDefault)?.id ?? items[0]?.id ?? "",
          );
        }
      })
      .catch((error) => {
        if (active) setError(String(error.message ?? error));
      });
    return () => {
      active = false;
    };
  }, []);

  async function run(label: string, action: () => Promise<void>) {
    setPending(label);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending("");
    }
  }

  return (
    <main className="application-app">
      <header>
        <h1>__APPLICATION_NAME__</h1>
        <p>React 页面 · 宿主工具与技能 · 共享 Chat</p>
      </header>
      <section className="host-panel">
        <label>
          分析文本
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
          />
        </label>
        <button
          disabled={!!pending}
          onClick={() =>
            void run("分析中…", async () => {
              setResult(undefined);
              const response =
                await getApplicationHost().executeTool<TextInspection>(
                  "__TOOL_NAME__",
                  { text },
                );
              setResult(response.value);
            })
          }
        >
          调用宿主工具
        </button>
        {result && (
          <pre aria-label="宿主结果">{JSON.stringify(result, null, 2)}</pre>
        )}
      </section>
      <section className="connection">
        <label>
          工作区
          <select
            value={workspaceId}
            disabled={!!pending}
            onChange={(event) => {
              setWorkspaceId(event.target.value);
              setSession(undefined);
            }}
          >
            {!workspaces.length && <option value="">暂无工作区</option>}
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!!pending || !workspaceId}
          onClick={() =>
            void run("连接中…", async () => {
              setSession(
                await getApplicationChatClient().createSession({
                  workspaceId,
                  sceneId: "assistant",
                  profile: {
                    id: "assistant-v1",
                    systemPrompt: "你是应用助手，需要分析文本时使用应用工具。",
                    allowedToolNames: ["__TOOL_NAME__"],
                  },
                }),
              );
            })
          }
        >
          新建对话
        </button>
      </section>
      {pending && <p role="status">{pending}</p>}
      {error && <p role="alert">{error}</p>}
      <section className="chat-panel">
        <p>
          技能示例：新建对话后发送“请使用 __SKILL_NAME__ 技能分析文本 Hello Mewvis
          👋 的字符数、UTF-8 字节数和 SHA-256”。
        </p>
        {session ? <Chat session={session} /> : <p>选择工作区并新建对话。</p>}
      </section>
    </main>
  );
}
