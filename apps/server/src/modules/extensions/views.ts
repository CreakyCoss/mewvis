import { createHash, randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import {
  createExtensionPackageManager,
  readExtensionPackage,
  resolveExtensionConfig,
} from "@isle/extension-host";
import type { ExtensionSessionSnapshot } from "@isle/extension-sdk/ui";
import {
  nonempty,
  object,
  onlyKeys,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";

export interface ExtensionViewServices {
  readSession(target: {
    workspacePath: string;
    chatId: string;
  }): Promise<unknown>;
  changed(): void;
}
type Manager = ReturnType<typeof createExtensionPackageManager>;
type View = {
  id: string;
  fingerprint: string;
  target: { workspacePath: string; chatId: string };
  expires: number;
  busy: boolean;
};
const lifetime = 30 * 60 * 1000;
const denied = () =>
  new ServiceError(
    403,
    "EXTENSION_VIEW_UNAVAILABLE",
    "插件视图已停用或过期，请重新打开",
  );

/** UI receives an opaque view lease, never a general host invocation API. */
export class ExtensionViews {
  private revision = 0;
  private readonly views = new Map<string, View>();
  constructor(
    private manager: Manager,
    private services?: ExtensionViewServices,
  ) {}

  invalidate() {
    this.views.clear();
    this.revision++;
  }

  private resolve(id: string) {
    const record = this.manager
      .list()
      .find((item) => item.id === id && item.enabled);
    if (!record) throw denied();
    const pkg = readExtensionPackage(record.path, { module: "ui" });
    if (pkg.manifest.id !== id || !pkg.modules.ui) throw denied();
    const config = resolveExtensionConfig(pkg.manifest, record.config);
    return {
      pkg,
      ui: pkg.modules.ui,
      config,
      fingerprint: createHash("sha256")
        .update(JSON.stringify([pkg.root, pkg.manifest, config]))
        .digest("hex"),
    };
  }

  commands(
    guarded: (
      action: (input: JsonObject) => unknown,
    ) => (input: JsonObject) => Promise<unknown>,
  ) {
    return {
      list_extension_ui_contributions: guarded((input) => {
        onlyKeys(input, []);
        return this.manager
          .list()
          .filter((record) => record.enabled)
          .flatMap((record) => {
            try {
              const { ui, fingerprint } = this.resolve(record.id);
              return ui.contributions.map((panel) => ({
                ...panel,
                extensionId: record.id,
                revision: `${fingerprint}:${this.revision}`,
              }));
            } catch {
              return [];
            } // Broken packages remain visible in plugin management.
          });
      }),
      open_extension_view: guarded((input) => {
        onlyKeys(input, [
          "id",
          "contributionId",
          "viewId",
          "workspacePath",
          "chatId",
        ]);
        const id = nonempty(input.id, "id");
        const contributionId = nonempty(input.contributionId, "contributionId");
        const viewId = nonempty(input.viewId, "viewId");
        const resolved = this.resolve(id);
        if (
          !resolved.ui.entry ||
          !resolved.ui.contributions.some(
            (item) =>
              item.id === contributionId &&
              "view" in item &&
              item.view.id === viewId,
          )
        )
          throw denied();
        for (const [token, view] of this.views)
          if (view.expires < Date.now()) this.views.delete(token);
        if (this.views.size >= 64)
          throw new ServiceError(
            429,
            "EXTENSION_VIEW_LIMIT",
            "插件视图数量已达上限",
          );
        if (statSync(resolved.ui.entry).size > 1024 * 1024)
          throw new ServiceError(
            413,
            "EXTENSION_UI_TOO_LARGE",
            "插件界面入口超过 1 MiB",
          );
        const source = readFileSync(resolved.ui.entry, "utf8");
        const token = randomUUID();
        this.views.set(token, {
          id,
          fingerprint: resolved.fingerprint,
          target: {
            workspacePath: nonempty(input.workspacePath, "workspacePath"),
            chatId: nonempty(input.chatId, "chatId"),
          },
          expires: Date.now() + lifetime,
          busy: false,
        });
        return {
          token,
          source,
          id,
          contributionId,
          viewId,
          config: resolved.config,
        };
      }),
      query_extension_view: guarded(async (input) => {
        onlyKeys(input, ["token", "method"]);
        const token = nonempty(input.token, "token");
        const view = this.views.get(token);
        if (!view || view.expires < Date.now()) {
          this.views.delete(token);
          throw denied();
        }
        const { ui, fingerprint } = this.resolve(view.id);
        if (fingerprint !== view.fingerprint) {
          this.views.delete(token);
          throw denied();
        }
        if (
          input.method !== "session.read" ||
          !ui.capabilities.includes("session.read") ||
          !this.services
        )
          throw new ServiceError(
            403,
            "EXTENSION_CAPABILITY_DENIED",
            "插件未获得此数据接口",
          );
        if (view.busy)
          throw new ServiceError(
            429,
            "EXTENSION_VIEW_BUSY",
            "插件数据请求进行中",
          );
        view.busy = true;
        view.expires = Date.now() + lifetime;
        try {
          const result = await this.services.readSession(view.target);
          // Disabling or changing config while a read is pending revokes its result too.
          if (
            this.views.get(token) !== view ||
            this.resolve(view.id).fingerprint !== view.fingerprint
          )
            throw denied();
          return sessionSnapshot(result);
        } finally {
          view.busy = false;
        }
      }),
      close_extension_view: guarded((input) => {
        onlyKeys(input, ["token"]);
        this.views.delete(nonempty(input.token, "token"));
        return null;
      }),
    };
  }
}

/** Project a stable public DTO rather than exposing runtime ledger objects to plugins. */
function sessionSnapshot(value: unknown): ExtensionSessionSnapshot {
  const result = object(value, "session");
  const messages = (Array.isArray(result.messages) ? result.messages : [])
    .map((item) => object(item))
    .filter(
      (item) =>
        (item.role === "user" || item.role === "assistant") &&
        (!item.metadata || object(item.metadata).scope !== "agent_private"),
    );
  const visibleIds = new Set(messages.map((item) => item.messageRecordId));
  const runs = (Array.isArray(result.runtimeLinks) ? result.runtimeLinks : [])
    .map((item) => object(item))
    .filter(
      (item) =>
        Array.isArray(item.messageRecordIds) &&
        item.messageRecordIds.some((id) => visibleIds.has(id)),
    );
  return {
    messages: messages.slice(-1000).map((item) => ({
      id: String(item.messageRecordId ?? ""),
      role: item.role as "user" | "assistant",
      text: String(item.content ?? "").slice(0, 8000),
      timestamp: Number(item.timestamp) || 0,
    })),
    runs: runs.slice(-1000).map((item) => ({
      id: String(item.linkId ?? ""),
      status:
        item.status === "running" ||
        item.status === "done" ||
        item.status === "error"
          ? item.status
          : null,
      startedAt: typeof item.startedAt === "number" ? item.startedAt : null,
      endedAt: typeof item.endedAt === "number" ? item.endedAt : null,
    })),
    truncated:
      messages.length > 1000 ||
      runs.length > 1000 ||
      messages.some((item) => String(item.content ?? "").length > 8000),
  };
}
