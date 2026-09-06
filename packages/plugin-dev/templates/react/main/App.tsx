import { useEffect, useState } from "react";
import { getPluginHost } from "@isle/plugin-sdk/browser";
import {
  getPluginChatClient,
  type PluginChatSession,
} from "@isle/plugin-sdk/chat";
import { Chat } from "@isle/plugin-sdk/chat/react";
import type { TextInspection } from "./contracts";
import "./styles.css";

export default function App() {
  const [text, setText] = useState("Hello Isle 👋");
  const [result, setResult] = useState<TextInspection>();
  const [session, setSession] = useState<PluginChatSession>();
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [workspaceId, setWorkspaceId] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getPluginChatClient()
      .listWorkspaces()
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
    <main className="plugin-app">
      <header>
        <h1>__PLUGIN_NAME__</h1>
        <p>React 页面 · 宿主工具 · 共享 Chat</p>
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
                await getPluginHost().executeTool<TextInspection>(
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
                await getPluginChatClient().createSession({
                  workspaceId,
                  sceneId: "assistant",
                  profile: {
                    id: "assistant-v1",
                    systemPrompt: "你是插件助手，需要分析文本时使用插件工具。",
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
        {session ? <Chat session={session} /> : <p>选择工作区并新建对话。</p>}
      </section>
    </main>
  );
}
