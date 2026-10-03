import { APP_DISPLAY_NAME, PRODUCT_KEYS } from "@mewvis/product-config";
export const APPLICATION_DATA_PERMISSIONS = Object.freeze({
  storage: "application-data",
  workspaces: "application-workspaces",
});

const ERROR_CODES = new Set([
  "CAPABILITY_UNAVAILABLE",
  "PERMISSION_DENIED",
  "INVALID_ARGUMENT",
  "WORKSPACE_NOT_FOUND",
  "WORKSPACE_UNAVAILABLE",
  "WORKSPACE_MARKER_INVALID",
  "CONFIRMATION_UNAVAILABLE",
  "STORAGE_ERROR",
  "INTERNAL_ERROR",
  "INVALID_RESPONSE",
  "TRANSPORT_ERROR",
]);

export class ApplicationDataError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "ApplicationDataError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ApplicationDataError(code, message);
};
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;

// Validate before serialization so unsupported values cannot silently disappear or change type.
const copyJson = (value, code) => {
  const ancestors = new Set();
  const visit = (item, depth) => {
    if (depth > 100) fail(code, "应用数据嵌套不能超过 100 层");
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object" || item === null)
      fail(code, "应用数据必须是有限且可序列化的 JSON 值");
    const array = Array.isArray(item);
    if (
      !(array ? [Array.prototype] : [Object.prototype, null]).includes(
        Object.getPrototypeOf(item),
      )
    )
      fail(code, "应用数据只能包含普通 JSON 对象和数组");
    if (ancestors.has(item)) fail(code, "应用数据不能包含循环引用");
    ancestors.add(item);
    const keys = Reflect.ownKeys(item).filter(
      (key) => !array || key !== "length",
    );
    if (array && keys.length !== item.length)
      fail(code, "应用数据不能包含稀疏数组或数组附加属性");
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (
        typeof key !== "string" ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length))
      )
        fail(code, "应用数据不能包含访问器、符号或非 JSON 属性");
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
  };
  visit(value, 0);
  return JSON.parse(JSON.stringify(value));
};

const workspaceValue = (value) => {
  if (
    !isObject(value) ||
    !nonempty(value.id) ||
    !nonempty(value.name) ||
    !nonempty(value.path) ||
    typeof value.isDefault !== "boolean"
  )
    fail("INVALID_RESPONSE", "宿主返回的应用工作区无效");
  return Object.freeze({
    id: value.id,
    name: value.name,
    path: value.path,
    isDefault: value.isDefault,
  });
};
const voidValue = (value) => {
  if (value !== null) fail("INVALID_RESPONSE", "宿主未返回空的操作结果");
};
const keyParams = (key) => {
  if (typeof key !== "string")
    fail("INVALID_ARGUMENT", "应用存储键必须是字符串");
  return { key };
};

export function createApplicationDataClient(transport) {
  if (
    !transport ||
    transport.version !== 1 ||
    typeof transport.request !== "function"
  )
    fail("CAPABILITY_UNAVAILABLE", "当前宿主未提供应用数据 v1 能力");

  const request = async (method, params) => {
    let response;
    try {
      response = await transport.request({
        version: 1,
        method,
        ...(params === undefined ? {} : { params }),
      });
    } catch (cause) {
      throw new ApplicationDataError(
        "TRANSPORT_ERROR",
        "应用数据请求传输失败，操作结果可能尚未确认",
        { cause },
      );
    }
    if (!isObject(response) || typeof response.ok !== "boolean")
      fail("INVALID_RESPONSE", "宿主返回的应用数据响应无效");
    if (!response.ok) {
      if (
        !isObject(response.error) ||
        !ERROR_CODES.has(response.error.code) ||
        typeof response.error.message !== "string"
      )
        fail("INVALID_RESPONSE", "宿主返回的应用数据错误无效");
      throw new ApplicationDataError(
        response.error.code,
        response.error.message,
      );
    }
    return response.value;
  };

  const storage = Object.freeze({
    async getItem(key) {
      return copyJson(
        await request("storage.getItem", keyParams(key)),
        "INVALID_RESPONSE",
      );
    },
    async setItem(key, value) {
      const params = {
        ...keyParams(key),
        value: copyJson(value, "INVALID_ARGUMENT"),
      };
      voidValue(await request("storage.setItem", params));
    },
    async removeItem(key) {
      voidValue(await request("storage.removeItem", keyParams(key)));
    },
    async clear() {
      voidValue(await request("storage.clear"));
    },
    async keys() {
      const value = copyJson(await request("storage.keys"), "INVALID_RESPONSE");
      if (!Array.isArray(value) || value.some((key) => typeof key !== "string"))
        fail("INVALID_RESPONSE", "宿主返回的应用存储键列表无效");
      return value;
    },
  });
  const workspaces = Object.freeze({
    async remove(input) {
      if (
        !isObject(input) ||
        !nonempty(input.id) ||
        Object.keys(input).some(
          (key) => !["id", "deleteContent"].includes(key),
        ) ||
        (input.deleteContent !== undefined &&
          typeof input.deleteContent !== "boolean")
      )
        fail("INVALID_ARGUMENT", "工作区移除参数无效");
      voidValue(
        await request("workspaces.remove", copyJson(input, "INVALID_ARGUMENT")),
      );
    },
    async selectDirectory() {
      const value = await request("workspaces.selectDirectory");
      if (value !== null && !nonempty(value))
        fail("INVALID_RESPONSE", "目录选择结果无效");
      return value;
    },
    async create(input) {
      if (!isObject(input)) fail("INVALID_ARGUMENT", "工作区参数必须是对象");
      const params = copyJson(input, "INVALID_ARGUMENT");
      if (
        Object.keys(params).some(
          (key) => !["name", "path", "exclusive"].includes(key),
        ) ||
        !nonempty(params.name) ||
        ("path" in params && !nonempty(params.path)) ||
        ("exclusive" in params && typeof params.exclusive !== "boolean")
      )
        fail("INVALID_ARGUMENT", "工作区参数只允许非空的 name 和可选 path");
      const value = await request("workspaces.create", params);
      return value === null ? null : workspaceValue(value);
    },
    async list() {
      const value = copyJson(
        await request("workspaces.list"),
        "INVALID_RESPONSE",
      );
      if (!Array.isArray(value))
        fail("INVALID_RESPONSE", "宿主返回的应用工作区列表无效");
      return value.map(workspaceValue);
    },
    async get(id) {
      if (!nonempty(id)) fail("INVALID_ARGUMENT", "工作区 ID 必须是非空字符串");
      return workspaceValue(await request("workspaces.get", { id }));
    },
  });
  return Object.freeze({ storage, workspaces });
}

/** Resolve on every call so a reconnected bridge cannot reuse another connection's client. */
export function getApplicationDataClient() {
  const host = globalThis[PRODUCT_KEYS.applicationGlobal];
  if (!host || host.version !== 1)
    fail(
      "CAPABILITY_UNAVAILABLE",
      `当前页面未连接支持应用数据的 ${APP_DISPLAY_NAME} 宿主`,
    );
  return createApplicationDataClient(host.data);
}
