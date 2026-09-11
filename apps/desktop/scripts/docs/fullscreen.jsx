// Web-only fixture: production shell, routing, plugin detail and sandbox; all IPC stays in memory.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, NavLink } from "react-router";
import { isTauri } from "@tauri-apps/api/core";
import { mockIPC } from "@tauri-apps/api/mocks";
import { PluginLayoutProvider } from "../../src/features/app/layout/plugin-layout";
import { AppWorkspace } from "../../src/features/app/layout/workspace";
import { PluginUiPage } from "../../src/features/pages/plugin-ui";
import { usePluginCatalogStore } from "../../src/features/pages/plugin-ui/catalog-store";
import script from "../../plugin-host/plugins/docs-reader/isle-ui.js?raw";
import style from "../../plugin-host/plugins/docs-reader/isle-ui.css?raw";
import book from "../../../../docs/.generated/book.json";
import { createLibrary } from "../../plugin-host/plugins/docs-reader/library.js";
import "../../src/App.css";

if (isTauri()) throw new Error("仅允许浏览器内存验证");
window.isTauri = true;
const library = createLibrary(book);
const tools = {
  isle_docs_catalog: () => library.catalog(),
  isle_docs_read: ({ id }) => library.read(id),
  isle_docs_search: ({ query }) => library.search(query),
};
const plugins = ["fullscreen", "full", "contained"].map((layout) => ({
  id: `@isle/docs-${layout}`,
  name: `文档中心 ${layout}`,
  version: "0.1.0",
  description: "全屏布局验证",
  runtimeKind: "isle",
  source: "bundled",
  error: null,
  uiError: null,
  ui: { kind: "sandbox", layout },
  compatibility: [],
  permissions: [],
  permissionStatus: "declared",
  tools: Object.keys(tools).map((name) => ({ name, description: name, inputSchema: { type: "object" } })),
}));
mockIPC((command, payload) => {
  if (command === "list_plugin_ui") return { plugins };
  if (command === "get_plugin_ui_document") return { script, style };
  if (command === "execute_plugin_ui_tool") {
    const { toolName, arguments: args } = payload.input;
    if (!Object.hasOwn(tools, toolName)) throw new Error("未知工具");
    return { value: tools[toolName](args), content: [], meta: {} };
  }
  throw new Error(`预览禁止原生调用：${command}`);
});
usePluginCatalogStore.setState({ catalog: { plugins } });
const sidebar = (
  <nav aria-label="应用侧栏" className="flex w-56 shrink-0 flex-col gap-4 border-r p-4 pt-12">
    <NavLink to="/plugins">插件列表</NavLink>
    {plugins.map((plugin) => (
      <NavLink key={plugin.id} to={`/plugins/${encodeURIComponent(plugin.id)}`}>
        {plugin.ui.layout} 模式
      </NavLink>
    ))}
    <NavLink to="/home">其他页面</NavLink>
    <button
      onClick={() =>
        usePluginCatalogStore.setState({
          catalog: { plugins: plugins.map((plugin) => ({ ...plugin, uiError: "模拟声明失效" })) },
        })
      }
    >
      模拟插件声明失效
    </button>
  </nav>
);
createRoot(document.getElementById("root")).render(
  <MemoryRouter initialEntries={[`/plugins/${encodeURIComponent(plugins[0].id)}`]}>
    <PluginLayoutProvider>
      <AppWorkspace sidebar={sidebar}>
        <Routes>
          <Route path="/plugins/:pluginId?" element={<PluginUiPage />} />
          <Route path="/home" element={<div>其他应用页面</div>} />
        </Routes>
      </AppWorkspace>
    </PluginLayoutProvider>
  </MemoryRouter>,
);
