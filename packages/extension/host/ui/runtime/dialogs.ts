import type { JsonObject } from "../../shared.js";
import type { UIHostContext } from "../index.js";
import type { ExtensionUIContribution } from "../protocol/transport";

type DialogContribution = Extract<ExtensionUIContribution, { type: "dialog" }>;
export interface DialogOwner {
  key: symbol;
  extensionId: string;
  revision: string;
  context: UIHostContext;
}
export interface ViewDialogRequest {
  kind: "view";
  id: number;
  owner: DialogOwner;
  contribution: DialogContribution;
  input: JsonObject;
}
export interface ConfirmDialogRequest {
  kind: "confirm";
  id: number;
  owner: DialogOwner;
  title: string;
  description?: string;
  confirmText: string;
  cancelText: string;
  tone: "default" | "danger";
}
export type DialogRequest = ViewDialogRequest | ConfirmDialogRequest;
function isJSON(value: unknown, ancestors = new Set<unknown>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  ancestors.add(value);
  const valid = Object.values(value).every((item) => isJSON(item, ancestors));
  ancestors.delete(value);
  return valid;
}
const failure = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

/** Owns requests, not layout. Only a mounted DialogSlot makes this capability available. */
export class DialogRuntime {
  private catalog: readonly ExtensionUIContribution[] = [];
  private listeners = new Set<() => void>();
  private mounted = false;
  private sequence = 0;
  private current: DialogRequest | null = null;
  private finish?: (confirmed: boolean) => void;
  get available() {
    return this.mounted;
  }
  snapshot = () => this.current;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
  update(catalog: readonly ExtensionUIContribution[]) {
    this.catalog = catalog;
    const request = this.current;
    if (request && !catalog.some((item) =>
      item.extensionId === request.owner.extensionId &&
      item.revision === request.owner.revision &&
      (request.kind === "confirm" ||
        (item.type === "dialog" && item.id === request.contribution.id)),
    ))
      this.close(request.id);
  }
  attach() {
    if (this.mounted)
      throw new Error(
        "Only one DialogSlot may be mounted per PluginUIProvider",
      );
    this.mounted = true;
    this.emit();
    return () => {
      this.mounted = false;
      this.close();
      this.emit();
    };
  }
  open(owner: DialogOwner, value: unknown): Promise<void> {
    try {
      if (!this.mounted)
        throw failure("UI_UNSUPPORTED", "当前界面没有提供弹窗插槽");
      if (this.current) throw failure("UI_BUSY", "请先关闭当前插件弹窗");
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw failure("UI_INVALID_REQUEST", "无效的弹窗请求");
      const request = value as { id?: unknown; input?: unknown };
      if (
        Object.keys(request).some((key) => key !== "id" && key !== "input") ||
        typeof request.id !== "string"
      )
        throw failure("UI_INVALID_REQUEST", "无效的弹窗请求");
      const contribution = this.catalog.find(
        (item): item is DialogContribution =>
          item.type === "dialog" &&
          item.id === request.id &&
          item.extensionId === owner.extensionId &&
          item.revision === owner.revision,
      );
      if (!contribution) throw failure("UI_DENIED", "插件未声明此弹窗或已停用");
      const input = request.input ?? {};
      if (!isJSON(input))
        throw failure("UI_INVALID_REQUEST", "弹窗参数必须是 JSON 数据");
      const json = JSON.stringify(input);
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        !json ||
        new TextEncoder().encode(json).byteLength > 65536
      )
        throw failure(
          "UI_INVALID_REQUEST",
          "弹窗参数必须是 64 KiB 以内的 JSON 对象",
        );
      const cleanInput = JSON.parse(json);
      return new Promise((resolve) => {
        this.finish = () => resolve();
        this.current = {
          kind: "view",
          id: ++this.sequence,
          owner,
          contribution,
          input: cleanInput,
        };
        this.emit();
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  confirm(owner: DialogOwner, value: unknown): Promise<boolean> {
    try {
      if (!this.mounted)
        throw failure("UI_UNSUPPORTED", "当前界面没有提供确认弹窗");
      if (this.current) throw failure("UI_BUSY", "请先关闭当前插件弹窗");
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw failure("UI_INVALID_REQUEST", "无效的确认请求");
      const request = value as Record<string, unknown>;
      if (Object.keys(request).some((key) =>
        !["title", "description", "confirmText", "cancelText", "tone"].includes(key),
      )) throw failure("UI_INVALID_REQUEST", "无效的确认请求");
      const text = (key: string, max: number, required: boolean) => {
        const field = request[key];
        if (field === undefined && !required) return undefined;
        if (typeof field !== "string" || !field.trim() || field.length > max)
          throw failure("UI_INVALID_REQUEST", `确认请求的 ${key} 无效`);
        return field;
      };
      const title = text("title", 100, true)!;
      const description = text("description", 1000, false);
      const confirmText = text("confirmText", 32, true)!;
      const cancelText = text("cancelText", 32, false) ?? "取消";
      const tone = request.tone ?? "default";
      if (tone !== "default" && tone !== "danger")
        throw failure("UI_INVALID_REQUEST", "无效的确认框类型");
      if (!this.catalog.some((item) =>
        item.extensionId === owner.extensionId && item.revision === owner.revision,
      )) throw failure("UI_DENIED", "插件已停用或更新");
      return new Promise((resolve) => {
        this.finish = resolve;
        this.current = {
          kind: "confirm",
          id: ++this.sequence,
          owner,
          title,
          description,
          confirmText,
          cancelText,
          tone,
        };
        this.emit();
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  close(id?: number, confirmed = false) {
    if (!this.current || (id !== undefined && this.current.id !== id)) return;
    const finish = this.finish;
    this.current = null;
    this.finish = undefined;
    this.emit();
    finish?.(confirmed);
  }
  release(owner: symbol) {
    if (this.current?.owner.key === owner) this.close();
  }
}
