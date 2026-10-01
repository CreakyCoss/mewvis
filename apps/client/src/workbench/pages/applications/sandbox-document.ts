import type { ApplicationUiDocument } from "@/api/applications";
import themeTokensCss from "design-system/tokens.css?raw";
import { createApplicationViewHost } from "@isle/app-sdk/views/runtime";

// Only the public design-system tokens cross the sandbox boundary.
const themeTokenNames = [...new Set([...themeTokensCss.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]))];
export const readApplicationTheme = () => {
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  return {
    theme: root.classList.contains("dark") || root.dataset.theme === "dark" ? "dark" : "light",
    themeTokens: Object.fromEntries(themeTokenNames.map((name) => [name, computed.getPropertyValue(name).trim()])),
  };
};

const BRIDGE_SOURCE = String.raw`
(() => {
  const channel = "isle-app-ui-v1";
  const pending = new Map();
  let nextId = 1;
  let host = null;
  /* EMBEDDED_VIEWS */
  const chatListeners = new Set();
  let appliedThemeTokens = [];
  const applyTheme = (theme, tokens) => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    appliedThemeTokens.forEach((name) => root.style.removeProperty(name));
    appliedThemeTokens = [];
    if (!tokens || typeof tokens !== "object") return;
    Object.entries(tokens).forEach(([name, value]) => {
      if (!/^--[\w-]+$/.test(name) || typeof value !== "string" || !value.trim()) return;
      root.style.setProperty(name, value);
      appliedThemeTokens.push(name);
    });
  };
  const send = (message) => parent.postMessage({ channel, ...message }, "*");
  const api = Object.freeze({
    version: 1,
    ...(views ? { views } : {}),
    writeClipboardText(text) {
      if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > 256 * 1024) return Promise.reject(new Error("复制内容超过 256 KiB 或格式无效"));
      if (navigator.userActivation && !navigator.userActivation.isActive) return Promise.reject(new Error("复制需要用户操作"));
      const id = String(nextId++);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject }); send({ type: "host:clipboard-write", id, text });
      });
    },
    data: Object.freeze({
      version: 1,
      request(request) {
        const id = String(nextId++);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { pending.delete(id); reject(new Error("应用数据请求超时，请重新读取确认结果")); }, ["workspaces.create", "workspaces.selectDirectory"].includes(request?.method) ? 75000 : 30000);
          pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
          send({ type: "data:request", id, request });
        });
      },
    }),
    chat: Object.freeze({
      request(request) {
        const id = String(nextId++);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { pending.delete(id); reject(new Error("聊天宿主响应超时；请重新连接以确认状态")); }, 120000);
          pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
          send({ type: "chat:request", id, request });
        });
      },
      subscribe(listener) { chatListeners.add(listener); return () => chatListeners.delete(listener); },
    }),
    executeTool(toolName, args = {}) {
      if (typeof toolName !== "string" || !toolName) return Promise.reject(new Error("toolName must be a non-empty string"));
      const id = String(nextId++);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ type: "tool:execute", id, toolName, args });
      });
    },
    openExternal(url) {
      if (typeof url !== "string" || !url) return Promise.reject(new Error("url must be a non-empty string"));
      if (navigator.userActivation && !navigator.userActivation.isActive) {
        return Promise.reject(new Error("openExternal must be called from a user action"));
      }
      const id = String(nextId++);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ type: "host:open-external", id, url });
      });
    },
    getHost() {
      return host;
    },
  });
  Object.defineProperty(window, "isleApplication", { value: api, enumerable: true });
  addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const message = event.data;
    if (!message || message.channel !== channel) return;
    if (message.type === "chat:snapshot") { chatListeners.forEach((listener) => listener(message.event)); return; }
    if (message.type === "host:init") {
      host = Object.freeze(message.host);
      applyTheme(host.theme, host.themeTokens);
      dispatchEvent(new CustomEvent("isle:ready", { detail: host }));
      return;
    }
    if (message.type === "host:theme") {
      if (host) host = Object.freeze({ ...host, theme: message.theme, themeTokens: message.themeTokens });
      applyTheme(message.theme, message.themeTokens);
      dispatchEvent(new CustomEvent("isle:theme", { detail: message.theme }));
      return;
    }
    if (message.type !== "host:result" || typeof message.id !== "string") return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
  });
  addEventListener("error", (event) => send({ type: "application:error", message: event.message || "Application UI script failed" }));
  addEventListener("unhandledrejection", (event) => send({ type: "application:error", message: String(event.reason?.message || event.reason || "Unhandled rejection") }));
  send({ type: "application:ready" });
})();`;

const BASE_STYLE = `
:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
:root[data-theme="dark"] { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { min-height: 100%; margin: 0; }
body { background: transparent; color: CanvasText; }
button, input, textarea, select { font: inherit; }
`;

const escapeScript = (value: string) => value.replace(/<\/script/gi, "<\\/script");
const escapeStyle = (value: string) => value.replace(/<\/style/gi, "<\\/style");

export const sandboxDocument = (
  document: ApplicationUiDocument,
  chat?: ApplicationUiDocument,
  options: { embeddedViews?: boolean } = {},
) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action 'none'; frame-src ${options.embeddedViews ? "blob:" : "'none'"}; img-src data: blob:; media-src 'none'; object-src 'none'; font-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
    <style>${escapeStyle(themeTokensCss)}${chat ? escapeStyle(chat.style) : ""}${chat ? "html, body { height: 100%; margin: 0; }" : escapeStyle(BASE_STYLE)}${escapeStyle(document.style)}</style>
  </head>
  <body>
    <script>${escapeScript(BRIDGE_SOURCE.replace("/* EMBEDDED_VIEWS */", options.embeddedViews
      ? `const views = (${createApplicationViewHost.toString()})({ getTheme: () => host });`
      : "const views = null;"))}</script>
    ${chat ? `<script>${escapeScript(chat.script)}</script>` : ""}
    <script>${escapeScript(document.script)}\n//# sourceURL=isle-app-ui.js</script>
  </body>
</html>`;
