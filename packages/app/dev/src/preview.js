// Generated from Mewvis's public Chat components; shares the project's React.
import "../dist/chat-ui.js";
import "../dist/chat-ui.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { createPreviewChat } from "../dist/chat-host.js";
import { createApplicationViewHost } from "@mewvis/app-sdk/views/runtime";

let environment;
export async function mountPreview(App, options) {
  if (globalThis.__TAURI_INTERNALS__)
    throw new Error("内存预览不能在原生宿主中启动");
  if (!environment) {
    const request = async (method, input) => {
      if (!options.endpoint)
        throw new Error(
          "当前是静态预览，未连接 Node 开发宿主。请在 Mewvis 中调用工具，或在应用目录运行 pnpm dev",
        );
      const response = await fetch(options.endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-mewvis-dev-token": options.token,
        },
        ...(input ? { body: JSON.stringify(input) } : {}),
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error("Node 开发宿主不可用，请使用应用目录的 pnpm dev");
      const result = await response.json();
      if (!response.ok || result.error)
        throw new Error(result.error ?? "宿主工具调用失败");
      return result;
    };
    const { tools, skills } = options.endpoint
      ? await request("GET")
      : { tools: options.tools ?? [], skills: options.skills ?? [] };
    const executeTool = (name, args = {}) => request("POST", { name, args });
    const chat = createPreviewChat({
      name: options.name,
      permissions: options.permissions ?? [],
      tools,
      executeTool,
    });
    const info = {
      application: {
        id: options.name,
        name: options.displayName ?? options.name,
        version: options.version ?? "0.1.0",
      },
      tools,
      theme: "light",
    };
    const views = options.permissions?.includes("embedded-views")
      ? createApplicationViewHost({ getTheme: () => info })
      : undefined;
    Object.defineProperty(globalThis, "mewvisApplication", {
      configurable: true,
      value: Object.freeze({
        version: 1,
        ...(views ? { views } : {}),
        chat: chat.transport,
        data: chat.data,
        executeTool,
        getHost: () => info,
        openExternal: async () => {
          throw new Error("外部链接需要在 Mewvis 中验证");
        },
      }),
    });
    environment = { chat, info, skills };
    addEventListener(
      "pagehide",
      () => {
        views?.dispose();
        void chat.dispose();
      },
      { once: true },
    );
  }
  const { chat, info, skills } = environment;
  document.documentElement.style.height = "100%";
  Object.assign(document.body.style, {
    height: "100%",
    margin: "0",
    display: "flex",
    flexDirection: "column",
  });
  const bar = document.createElement("div");
  bar.setAttribute("aria-label", "开发预览控制");
  Object.assign(bar.style, {
    display: "flex",
    flexWrap: "wrap",
    flexShrink: "0",
    alignItems: "center",
    gap: "12px",
    padding: "8px 14px",
    fontSize: "12px",
    background: "#163e36",
    color: "#e5f6ef",
  });
  const label = document.createElement("strong");
  label.textContent = options.endpoint
    ? "内存聊天与工作区预览 · 宿主工具在本机 Node 执行"
    : "内存聊天与工作区预览 · 静态页面未连接 Node 工具服务";
  const stats = document.createElement("span");
  const pause = document.createElement("button");
  pause.textContent = "暂停授权";
  let paused = false;
  pause.onclick = () => {
    paused = !paused;
    chat.pause(paused);
    pause.textContent = paused ? "恢复授权" : "暂停授权";
  };
  const theme = document.createElement("button");
  theme.textContent = "深色预览";
  theme.onclick = () => {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = info.theme = dark
      ? "dark"
      : "light";
    theme.textContent = dark ? "浅色预览" : "深色预览";
    dispatchEvent(new CustomEvent("mewvis:theme", { detail: info.theme }));
  };
  bar.append(label, stats, pause, theme);
  if (skills.length) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `应用技能定义 (${skills.length})`;
    const content = document.createElement("pre");
    content.textContent = skills
      .map((skill) => `${skill.name}\n${skill.description}\n\n${skill.content}`)
      .join("\n\n---\n\n");
    Object.assign(content.style, {
      whiteSpace: "pre-wrap",
      maxHeight: "200px",
      overflow: "auto",
    });
    const note = document.createElement("p");
    note.textContent =
      "仅展示宿主加载的定义；模型是否使用技能需在 Mewvis 中验证。";
    details.append(summary, note, content);
    bar.append(details);
  }
  const container = document.createElement("div");
  container.id = "mewvis-app-root";
  Object.assign(container.style, { flex: "1", minHeight: "0" });
  document.body.append(bar, container);
  const root = createRoot(container);
  root.render(
    React.createElement(React.StrictMode, null, React.createElement(App)),
  );
  const timer = setInterval(() => {
    const value = chat.stats();
    stats.textContent = `会话 ${value.sessions} / 订阅 ${value.subscriptions} / 派发 ${value.dispatches} / 保存 ${value.writes}`;
  }, 250);
  return () => {
    clearInterval(timer);
    root.unmount();
    bar.remove();
    container.remove();
  };
}
