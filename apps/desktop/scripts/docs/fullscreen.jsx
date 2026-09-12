// Web-only fixture: production shell, routing, application detail and sandbox; all IPC stays in memory.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, NavLink } from "react-router";
import { isTauri } from "@tauri-apps/api/core";
import { mockIPC } from "@tauri-apps/api/mocks";
import { ApplicationLayoutProvider } from "../../src/features/shell/layout/application-layout";
import { AppWorkspace } from "../../src/features/shell/layout/workspace";
import { ApplicationUiPage } from "../../src/features/pages/applications";
import { useApplicationCatalogStore } from "../../src/features/pages/applications/catalog-store";
import script from "../../applications/builtins/docs-reader/isle-ui.js?raw";
import style from "../../applications/builtins/docs-reader/isle-ui.css?raw";
import book from "../../../../docs/.generated/book.json";
import { createLibrary } from "../../applications/builtins/docs-reader/library.js";
import "../../src/App.css";

if (isTauri()) throw new Error("仅允许浏览器内存验证");
window.isTauri = true;
const library = createLibrary(book);
const tools = {
  isle_docs_catalog: () => library.catalog(),
  isle_docs_read: ({ id }) => library.read(id),
  isle_docs_search: ({ query }) => library.search(query),
};
const applications = ["fullscreen", "full", "contained"].map((layout) => ({
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
  if (command === "list_application_ui") return { applications };
  if (command === "get_application_ui_document") return { script, style };
  if (command === "execute_application_ui_tool") {
    const { toolName, arguments: args } = payload.input;
    if (!Object.hasOwn(tools, toolName)) throw new Error("未知工具");
    return { value: tools[toolName](args), content: [], meta: {} };
  }
  throw new Error(`预览禁止原生调用：${command}`);
});
useApplicationCatalogStore.setState({ catalog: { applications } });
const sidebar = (
  <nav aria-label="应用侧栏" className="flex w-56 shrink-0 flex-col gap-4 border-r p-4 pt-12">
    <NavLink to="/apps">应用列表</NavLink>
    {applications.map((application) => (
      <NavLink key={application.id} to={`/apps/${encodeURIComponent(application.id)}`}>
        {application.ui.layout} 模式
      </NavLink>
    ))}
    <NavLink to="/home">其他页面</NavLink>
    <button
      onClick={() =>
        useApplicationCatalogStore.setState({
          catalog: { applications: applications.map((application) => ({ ...application, uiError: "模拟声明失效" })) },
        })
      }
    >
      模拟应用声明失效
    </button>
  </nav>
);
createRoot(document.getElementById("root")).render(
  <MemoryRouter initialEntries={[`/apps/${encodeURIComponent(applications[0].id)}`]}>
    <ApplicationLayoutProvider>
      <AppWorkspace sidebar={sidebar}>
        <Routes>
          <Route path="/apps/:applicationId?" element={<ApplicationUiPage />} />
          <Route path="/home" element={<div>其他应用页面</div>} />
        </Routes>
      </AppWorkspace>
    </ApplicationLayoutProvider>
  </MemoryRouter>,
);
