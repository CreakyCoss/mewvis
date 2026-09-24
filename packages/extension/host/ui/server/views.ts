import { uiSlotDefinitions } from "@isle/extension-host/ui";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import {
  createExtensionPackageManager,
  readExtensionPackage,
  resolveExtensionConfig,
} from "@isle/extension-host/management";
import {
  ExtensionHost,
  type ExtensionHostAdapter,
} from "../../services/dispatch.js";
import { PluginError as ServiceError } from "../../services/error.js";
type JsonObject = Record<string, unknown>;
const nonempty = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim())
    throw new ServiceError(400, "HOST_INVALID_REQUEST", `${field} 不能为空`);
  return value;
};
const onlyKeys = (input: JsonObject, keys: string[]) => {
  if (Object.keys(input).some((key) => !keys.includes(key)))
    throw new ServiceError(400, "HOST_INVALID_REQUEST", "请求包含未知字段");
};

export interface ExtensionViewServices {
  host: ExtensionHostAdapter;
  changed(): void;
}
type Manager = ReturnType<typeof createExtensionPackageManager>;
type View = {
  id: string;
  fingerprint: string;
  target: { workspacePath: string; chatId: string };
  expires: number;
  cancelledThrough: number;
  pending?: { id: number; abort: AbortController };
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
  private readonly host: ExtensionHost;
  private readonly changed: () => void;
  private readonly views = new Map<string, View>();
  constructor(
    private manager: Manager,
    services?: ExtensionViewServices,
  ) {
    this.changed = services?.changed ?? (() => {});
    this.host = new ExtensionHost({
      ...services?.host,
      "configuration.read": async (_input, context) =>
        this.resolve(context.extensionId!).config,
      "configuration.write": async ({ value }, context) => {
        if (JSON.stringify(value).length > 256_000)
          throw new ServiceError(400, "HOST_INVALID_REQUEST", "插件配置过大");
        await this.manager.configure(context.extensionId!, { config: value });
        const resolved = this.resolve(context.extensionId!);
        for (const view of this.views.values())
          if (view.id === context.extensionId)
            view.fingerprint = resolved.fingerprint;
        this.changed();
        return resolved.config;
      },
    });
  }

  invalidate() {
    for (const view of this.views.values()) view.pending?.abort.abort();
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
      requirements: pkg.manifest.host,
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
        const resolved = this.resolve(id);
        const contribution = resolved.ui.contributions.find(
          (item) => item.id === contributionId,
        );
        if (!contribution) throw denied();
        if (!("view" in contribution) && contribution.type !== "status")
          throw denied();
        if (!("view" in contribution) && input.viewId !== undefined)
          throw denied();
        const definition = Object.values(uiSlotDefinitions).find(
          (item) => item.key === contribution.slot,
        )!;
        const viewId =
          "view" in contribution ? nonempty(input.viewId, "viewId") : "";
        if (
          "view" in contribution &&
          (!resolved.ui.entry || contribution.view.id !== viewId)
        )
          throw denied();
        if (
          definition.scope === "application" &&
          (input.workspacePath || input.chatId)
        )
          throw denied();
        const target =
          definition.scope === "session"
            ? {
                workspacePath: nonempty(input.workspacePath, "workspacePath"),
                chatId: nonempty(input.chatId, "chatId"),
              }
            : { workspacePath: "", chatId: "" };
        const capabilities = this.host.check(resolved.requirements);
        for (const [token, view] of this.views)
          if (view.expires < Date.now()) {
            view.pending?.abort.abort();
            this.views.delete(token);
          }
        if (this.views.size >= 64)
          throw new ServiceError(
            429,
            "EXTENSION_VIEW_LIMIT",
            "插件视图数量已达上限",
          );
        if (resolved.ui.entry && statSync(resolved.ui.entry).size > 1024 * 1024)
          throw new ServiceError(
            413,
            "EXTENSION_UI_TOO_LARGE",
            "插件界面入口超过 1 MiB",
          );
        const source = resolved.ui.entry
          ? readFileSync(resolved.ui.entry, "utf8")
          : "";
        const token = randomUUID();
        this.views.set(token, {
          id,
          fingerprint: resolved.fingerprint,
          target,
          expires: Date.now() + lifetime,
          cancelledThrough: 0,
        });
        return {
          token,
          source,
          id,
          contributionId,
          viewId,
          config: resolved.config,
          capabilities,
        };
      }),
      query_extension_view: guarded(async (input) => {
        onlyKeys(input, ["token", "method", "arguments", "requestId"]);
        const token = nonempty(input.token, "token");
        const view = this.views.get(token);
        if (!view || view.expires < Date.now()) {
          view?.pending?.abort.abort();
          this.views.delete(token);
          throw denied();
        }
        const resolved = this.resolve(view.id);
        if (resolved.fingerprint !== view.fingerprint) {
          view.pending?.abort.abort();
          this.views.delete(token);
          throw denied();
        }
        if (
          !Number.isSafeInteger(input.requestId) ||
          Number(input.requestId) < 1
        )
          throw new ServiceError(400, "HOST_INVALID_REQUEST", "无效请求标识");
        if (Number(input.requestId) <= view.cancelledThrough)
          throw new ServiceError(409, "HOST_CANCELLED", "请求已取消");
        if (view.pending)
          throw new ServiceError(429, "HOST_UNAVAILABLE", "插件数据请求进行中");
        const pending = {
          id: input.requestId as number,
          abort: new AbortController(),
        };
        view.pending = pending;
        view.expires = Date.now() + lifetime;
        try {
          const method = nonempty(input.method, "method");
          if (
            !view.target.chatId &&
            (method.startsWith("session.") ||
              method.startsWith("activity.") ||
              method === "tasks.run")
          )
            throw denied();
          const result = await this.host.invoke(
            nonempty(input.method, "method"),
            input.arguments ?? {},
            resolved.requirements,
            {
              extensionId: view.id,
              target: view.target,
              signal: AbortSignal.any([
                pending.abort.signal,
                AbortSignal.timeout(120000),
              ]),
            },
          );
          if (
            this.views.get(token) !== view ||
            this.resolve(view.id).fingerprint !== view.fingerprint
          )
            throw denied();
          return result;
        } finally {
          if (view.pending === pending) view.pending = undefined;
        }
      }),
      cancel_extension_view_request: guarded((input) => {
        onlyKeys(input, ["token", "requestId"]);
        const view = this.views.get(nonempty(input.token, "token"));
        if (
          !Number.isSafeInteger(input.requestId) ||
          Number(input.requestId) < 1
        )
          throw new ServiceError(400, "HOST_INVALID_REQUEST", "无效请求标识");
        if (view)
          view.cancelledThrough = Math.max(
            view.cancelledThrough,
            Number(input.requestId),
          );
        if (view?.pending && view.pending.id === input.requestId)
          view.pending.abort.abort();
        return null;
      }),
      close_extension_view: guarded((input) => {
        onlyKeys(input, ["token"]);
        const token = nonempty(input.token, "token");
        this.views.get(token)?.pending?.abort.abort();
        this.views.delete(token);
        return null;
      }),
    };
  }
}
