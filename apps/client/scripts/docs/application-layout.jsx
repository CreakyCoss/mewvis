// Web-only fixture: production shell, routing, application detail and sandbox; all IPC stays in memory.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, NavLink } from "react-router";
import { platform } from "../../src/platform";
import { AppWorkspace } from "../../src/workbench/shell/layout/workspace";
import { ApplicationUiPage } from "../../src/workbench/pages/applications";
import { useApplicationCatalogStore } from "../../src/workbench/pages/applications/catalog-store";
import script from "../../../applications/builtins/docs-reader/mewvis-ui.js?raw";
import style from "../../../applications/builtins/docs-reader/mewvis-ui.css?raw";
import book from "../../../../docs/.generated/book.json";
import { createLibrary } from "../../../applications/builtins/docs-reader/library.js";
import "../../src/App.css";

if (platform.kind !== "web") throw new Error("仅允许浏览器内存验证");
const library = createLibrary(book);
const tools = {
  mewvis_docs_catalog: () => library.catalog(),
  mewvis_docs_read: ({ id }) => library.read(id),
  mewvis_docs_search: ({ query }) => library.search(query),
};
const applications = ["bundled", "installed"].map((source) => ({
  id: `@mewvis/docs-${source}`,
  name: `文档中心 ${source}`,
  version: "0.1.0",
  description: "应用工作区验证",
  runtimeKind: "mewvis",
  source,
  error: null,
  uiError: null,
  ui: { kind: "sandbox" },
  compatibility: [],
  permissions: [],
  permissionStatus: "declared",
  tools: Object.keys(tools).map((name) => ({ name, description: name, parameters: { type: "object" } })),
}));
const browserFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const path = new URL(input instanceof Request ? input.url : input, window.location.href).pathname;
  if (!path.startsWith("/api/")) return browserFetch(input, init);
  const command = decodeURIComponent(path.replace("/api/commands/", ""));
  const payload = JSON.parse(init?.body ?? "{}");
  if (command === "list_application_ui") return Response.json({ applications });
  if (command === "get_application_ui_document") return Response.json({ script, style });
  if (command === "execute_application_ui_tool") {
    const { toolName, arguments: args } = payload.input;
    if (!Object.hasOwn(tools, toolName)) throw new Error("未知工具");
    return Response.json({ value: tools[toolName](args), content: [], meta: {} });
  }
  throw new Error(`预览禁止原生调用：${command}`);
};
useApplicationCatalogStore.setState({ catalog: { applications } });
const sidebar = (
  <nav aria-label="应用侧栏" className="flex w-56 shrink-0 flex-col gap-4 border-r p-4 pt-12">
    <NavLink to="/apps">应用列表</NavLink>
    {applications.map((application) => (
      <NavLink key={application.id} to={`/apps/${encodeURIComponent(application.id)}`}>
        {application.name}
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
    <AppWorkspace sidebar={sidebar}>
      <Routes>
        <Route path="/apps/:applicationId?" element={<ApplicationUiPage />} />
        <Route path="/home" element={<div>其他应用页面</div>} />
      </Routes>
    </AppWorkspace>
  </MemoryRouter>,
);
