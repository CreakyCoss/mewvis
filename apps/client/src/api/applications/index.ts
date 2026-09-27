import { invoke } from "@/transport";
import type { AgentAccess } from "@isle/chat-contracts";
import type { IsleToolRisk } from "@isle/app-sdk";

export type ApplicationRuntimeKind = "isle" | "dsh";

export type ApplicationPermission =
  | "network"
  | "application-data"
  | "application-workspaces"
  | "workspace-files"
  | "open-external"
  | "process"
  | "chat"
  | "chat-knowledge";
export type ApplicationPermissionStatus = "declared" | "isle-upgrade-required" | "dsh-unsupported";

export type ApplicationDescriptor = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: "bundled" | "installed";
  enabled: boolean;
  defaultEnabled: boolean;
  path: string;
  runtimeKind: ApplicationRuntimeKind;
  entry: string;
  compatibility: ApplicationCompatibility[];
  permissions: ApplicationPermission[];
  agentAccess?: AgentAccess | null;
  permissionStatus: ApplicationPermissionStatus;
  origin: ApplicationOrigin | null;
};

export type ApplicationCompatibility = {
  adapter: string;
};

export type ApplicationOrigin = {
  kind: "marketplace";
  marketplace: string;
  fullName: string;
  package: string;
  repoUrl: string;
};

export type MarketplaceApplication = {
  fullName: string;
  name: string;
  owner: string;
  summary: string;
  summaryZh: string;
  category: string;
  language: string;
  license: string;
  stars: number;
  pushedAt: string;
  repoUrl: string;
  npmPackage: string | null;
  installable: boolean;
  installCheck: "passed" | "needs-approval" | "not-a-layer" | "failed" | "timeout" | null;
  blockedBuilds: string[];
  riskFlags: string[];
  inRegistry: boolean;
  url: string;
};

export type MarketplaceSearchResult = {
  total: number;
  count: number;
  results: MarketplaceApplication[];
};

export type ApplicationMarketplaceProviderId = "dsh-community";

export type RemovedApplication = {
  id: string;
  path: string;
};

export type ApplicationUiTool = {
  risk?: IsleToolRisk;
  name: string;
  description: string;
  parameters: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
};

export type ApplicationUiApplication = {
  runtimeKind: ApplicationRuntimeKind;
  id: string;
  name: string;
  version: string;
  description: string;
  source: "bundled" | "installed";
  tools: ApplicationUiTool[];
  error: string | null;
  ui: { kind: "sandbox"; title?: string } | null;
  uiError: string | null;
  compatibility: { adapter: string; clientPlatform?: string | null }[];
  permissions: ApplicationPermission[];
  agentAccess?: AgentAccess | null;
  permissionStatus: ApplicationPermissionStatus;
};

export type ApplicationUiCatalog = {
  applications: ApplicationUiApplication[];
};

export type ApplicationUiToolResult = {
  value: unknown;
  content: unknown[];
  meta: unknown;
};

export type ApplicationUiDocument = {
  script: string;
  style: string;
};

export async function listApplications() {
  return invoke<ApplicationDescriptor[]>("list_applications");
}

export async function installApplication(sourcePath: string, enable = false) {
  return invoke<ApplicationDescriptor>("install_application", {
    input: { sourcePath, enable },
  });
}

export async function inspectApplication(sourcePath: string) {
  return invoke<ApplicationDescriptor>("inspect_application", {
    input: { sourcePath },
  });
}

export async function searchApplicationMarketplace(
  provider: ApplicationMarketplaceProviderId,
  query: string,
  page = 1,
  limit = 20,
) {
  return invoke<MarketplaceSearchResult>("search_application_marketplace", {
    input: { provider, query, page, limit },
  });
}

export async function installApplicationFromMarketplace(
  provider: ApplicationMarketplaceProviderId,
  application: MarketplaceApplication,
) {
  if (!application.npmPackage) throw new Error("该条目没有可安全下载的 npm 发布包");
  return invoke<ApplicationDescriptor>("install_application_from_marketplace", {
    input: {
      provider,
      fullName: application.fullName,
      npmPackage: application.npmPackage,
      repoUrl: application.repoUrl,
    },
  });
}

export async function setApplicationEnabled(id: string, enabled: boolean) {
  return invoke<ApplicationDescriptor>("set_application_enabled", {
    input: { id, enabled },
  });
}

export async function removeApplication(id: string) {
  return invoke<RemovedApplication>("remove_application", {
    input: { id },
  });
}

export async function listApplicationUi() {
  return invoke<ApplicationUiCatalog>("list_application_ui");
}

export async function executeApplicationUiTool(applicationId: string, toolName: string, args: unknown = {}) {
  return invoke<ApplicationUiToolResult>("execute_application_ui_tool", {
    input: { applicationId, toolName, arguments: args },
  });
}

export async function getApplicationUiDocument(applicationId: string) {
  return invoke<ApplicationUiDocument>("get_application_ui_document", {
    input: { applicationId },
  });
}
