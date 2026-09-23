import type { JsonObject } from "../../shared.js";
import type { UISessionContext } from "../index.js";
import type { ExtensionUIContribution } from "../protocol/transport";

type DialogContribution = Extract<ExtensionUIContribution, { type: "dialog" }>;
export interface DialogOwner {
  key: symbol;
  extensionId: string;
  revision: string;
  context: UISessionContext;
}
export interface DialogRequest {
  id: number;
  owner: DialogOwner;
  contribution: DialogContribution;
  input: JsonObject;
}
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
  private resolve?: () => void;
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
    if (
      request &&
      !catalog.some(
        (item) =>
          item.type === "dialog" &&
          item.extensionId === request.owner.extensionId &&
          item.id === request.contribution.id &&
          item.revision === request.contribution.revision,
      )
    )
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
        this.resolve = resolve;
        this.current = {
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
  close(id?: number) {
    if (!this.current || (id !== undefined && this.current.id !== id)) return;
    const resolve = this.resolve;
    this.current = null;
    this.resolve = undefined;
    this.emit();
    resolve?.();
  }
  release(owner: symbol) {
    if (this.current?.owner.key === owner) this.close();
  }
}
