import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ApplicationTool } from "@isle/app-sdk/tools";
import { listAgentRuntimeTools } from "@/api/agent-runtime";
import { listApplicationUi } from "@/api/apps";

export type ApplicationToolPolicy = { allowedToolNames: string[] };

export async function listApplicationTools(applicationId: string): Promise<ApplicationTool[]> {
  if (!isTauri()) throw new Error("当前宿主不支持应用工具授权");
  const [runtime, catalog, policy] = await Promise.all([
    listAgentRuntimeTools(),
    listApplicationUi(),
    invoke<ApplicationToolPolicy | null>("get_application_tool_policy", { applicationId }),
  ]);
  const application = catalog.applications.find((item) => item.id === applicationId);
  if (!application || application.error) throw new Error("应用工具加载失败，请重新启用应用后重试");
  const all = [
    ...runtime.tools.map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description ?? "",
      source: "host" as const,
    })),
    ...application.tools.map((tool) => ({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      source: "application" as const,
      risk: tool.risk,
    })),
  ];
  if (new Set(all.map((tool) => tool.name)).size !== all.length) throw new Error("应用工具不能与宿主工具重名");
  return all.map((tool) => ({ ...tool, enabled: policy === null || policy.allowedToolNames.includes(tool.name) }));
}

/** Only the trusted management UI calls this; it is never exposed on the application bridge. */
export async function saveApplicationToolPolicy(applicationId: string, allowedToolNames: string[]): Promise<void> {
  await invoke("set_application_tool_policy", { applicationId, policy: { allowedToolNames: [...new Set(allowedToolNames)] } });
}
