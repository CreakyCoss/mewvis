import { PRODUCT_KEYS } from "@mewvis/product-config";

export class ApplicationMediaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ApplicationMediaError";
    this.code = code;
  }
}
export function createApplicationMediaClient(transport) {
  if (
    !transport ||
    transport.version !== 1 ||
    typeof transport.request !== "function"
  )
    throw new ApplicationMediaError(
      "CAPABILITY_UNAVAILABLE",
      "当前宿主未提供媒体处理服务",
    );
  const request = async (method, params = {}) => {
    let snapshot;
    try {
      snapshot = structuredClone(params);
    } catch {
      throw new ApplicationMediaError(
        "INVALID_ARGUMENT",
        "媒体参数必须为可序列化数据",
      );
    }
    let response;
    try {
      response = await transport.request({
        version: 1,
        method,
        params: snapshot,
      });
    } catch (error) {
      throw new ApplicationMediaError(
        error?.code ?? "TRANSPORT_ERROR",
        error?.message ?? "媒体连接失败",
      );
    }
    if (
      !response ||
      typeof response.ok !== "boolean" ||
      (response.ok && !Object.hasOwn(response, "value"))
    )
      throw new ApplicationMediaError("INVALID_RESPONSE", "媒体服务响应无效");
    if (!response.ok)
      throw new ApplicationMediaError(
        response.error?.code ?? "MEDIA_ERROR",
        response.error?.message ?? "媒体操作失败",
      );
    return response.value;
  };
  const job = (value) => {
    if (
      !value ||
      typeof value.id !== "string" ||
      ![
        "queued",
        "running",
        "cancelling",
        "completed",
        "failed",
        "cancelled",
      ].includes(value.status) ||
      !Number.isFinite(value.progress) ||
      value.progress < 0 ||
      value.progress > 1 ||
      typeof value.outputFilePath !== "string" ||
      !Number.isFinite(value.createdAt) ||
      !Number.isFinite(value.updatedAt)
    )
      throw new ApplicationMediaError("INVALID_RESPONSE", "媒体任务响应无效");
    return Object.freeze(value);
  };
  return Object.freeze({
    capabilities: async () => {
      const value = await request("capabilities");
      if (
        !value ||
        typeof value.available !== "boolean" ||
        !value.inputs ||
        !value.output ||
        !value.limits
      )
        throw new ApplicationMediaError("INVALID_RESPONSE", "媒体能力响应无效");
      return Object.freeze(value);
    },
    probe: async (filePath) => {
      const value = await request("probe", { filePath });
      if (
        !value ||
        typeof value.filePath !== "string" ||
        !Number.isFinite(value.size) ||
        (!value.video && !value.audio)
      )
        throw new ApplicationMediaError("INVALID_RESPONSE", "媒体信息响应无效");
      return Object.freeze(value);
    },
    compose: async (input) => job(await request("compose", input)),
    get: async (id) => job(await request("get", { id })),
    list: async (options = {}) => {
      const values = await request("list", options);
      if (!Array.isArray(values))
        throw new ApplicationMediaError("INVALID_RESPONSE", "媒体任务列表无效");
      return values.map(job);
    },
    cancel: async (id) => job(await request("cancel", { id })),
  });
}
let client, transport;
export function getApplicationMediaClient() {
  const next = globalThis[PRODUCT_KEYS.applicationGlobal]?.media;
  if (!next)
    throw new ApplicationMediaError(
      "CAPABILITY_UNAVAILABLE",
      "当前宿主未提供媒体处理服务",
    );
  if (next !== transport) {
    client = createApplicationMediaClient(next);
    transport = next;
  }
  return client;
}
