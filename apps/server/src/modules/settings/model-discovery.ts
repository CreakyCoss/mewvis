import { fetchJson } from "../../infrastructure/network/http.js";
import {
  nonempty,
  onlyKeys,
  optionalString,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";

type DiscoveredModel = { modelId: string; modelName: string };

const record = (value: unknown): JsonObject | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
const string = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/** Discover from the submitted connection draft without reading or saving settings. */
export async function discoverProviderModels(
  input: JsonObject,
  caller?: AbortSignal,
): Promise<{ models: DiscoveredModel[] }> {
  onlyKeys(input, ["apiFormat", "apiEndpoint", "apiKey"]);
  const format = nonempty(input.apiFormat, "API Format");
  const endpoint = nonempty(input.apiEndpoint, "API Endpoint");
  const apiKey = optionalString(input.apiKey, "API Key");
  const anthropic = format === "anthropic-messages";
  const google = format === "google-generative-ai";
  if (
    ![
      "openai-completions",
      "openai-responses",
      "openrouter",
      "anthropic-messages",
      "google-generative-ai",
    ].includes(format)
  )
    throw new ServiceError(
      400,
      "MODEL_DISCOVERY_UNSUPPORTED",
      "此 API 格式暂不支持获取模型，请使用新增模型手动添加",
    );

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ServiceError(400, "INVALID_URL", "API Endpoint 不是有效地址");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new ServiceError(400, "INVALID_URL", "请填写 HTTP(S) API 地址");

  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}${anthropic && !basePath.endsWith("/v1") ? "/v1" : ""}${google && !/\/v1(?:beta)?$/.test(basePath) ? "/v1beta" : ""}/models`;
  url.hash = "";
  const headers: Record<string, string> = { accept: "application/json" };
  if (anthropic) {
    headers["anthropic-version"] = "2023-06-01";
    if (apiKey) headers["x-api-key"] = apiKey;
    url.searchParams.set("limit", "1000");
  } else if (google) {
    if (apiKey) headers["x-goog-api-key"] = apiKey;
    url.searchParams.set("pageSize", "1000");
  } else if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const timeout = AbortSignal.timeout(30000);
  const signal = caller ? AbortSignal.any([caller, timeout]) : timeout;
  const models = new Map<string, DiscoveredModel>();
  const cursors = new Set<string>();
  try {
    for (let page = 0; page < 50; page++) {
      const result: unknown = await fetchJson(url.href, {
        headers,
        signal,
        redirect: "error",
      });
      const response = record(result);
      const items = google ? response?.models : response?.data;
      if (!Array.isArray(items))
        throw new ServiceError(
          502,
          "MODEL_DISCOVERY_INVALID_RESPONSE",
          "服务未返回有效的模型列表，请检查 API Endpoint 或手动添加模型",
        );
      for (const item of items) {
        const entry = record(item);
        if (!entry) continue;
        const modelId = google
          ? string(entry.name).replace(/^models\//, "")
          : string(entry.id);
        if (!modelId || models.has(modelId)) continue;
        const modelName =
          string(entry.display_name) ||
          string(entry.displayName) ||
          string(entry.name) ||
          modelId;
        models.set(modelId, { modelId, modelName });
      }

      const cursor = google
        ? string(response?.nextPageToken)
        : anthropic && response?.has_more === true
          ? string(response.last_id)
          : "";
      if (!cursor) {
        if (anthropic && response?.has_more === true) break;
        return { models: [...models.values()] };
      }
      if (cursors.has(cursor)) break;
      cursors.add(cursor);
      url.searchParams.set(google ? "pageToken" : "after_id", cursor);
    }
    throw new ServiceError(
      502,
      "MODEL_DISCOVERY_INVALID_RESPONSE",
      "模型列表分页异常，未能获取完整列表，请重试或手动添加模型",
    );
  } catch (error) {
    if (caller?.aborted)
      throw new ServiceError(499, "REQUEST_CANCELED", "已取消获取模型");
    if (timeout.aborted)
      throw new ServiceError(
        504,
        "MODEL_DISCOVERY_TIMEOUT",
        "获取模型超时，请重试",
      );
    if (error instanceof ServiceError) {
      if (error.code !== "UPSTREAM_ERROR") throw error;
      const status = Number(error.message.match(/HTTP (\d+)/)?.[1]);
      const message =
        status === 401 || status === 403
          ? "获取模型失败：请检查 API Key 及模型访问权限"
          : status === 404 || status === 405
            ? "此地址不支持获取模型，请检查 API Endpoint 或使用新增模型手动添加"
            : status === 429
              ? "请求过于频繁，请稍后重试"
              : `获取模型失败（HTTP ${status || "未知"}），请稍后重试`;
      throw new ServiceError(502, "MODEL_DISCOVERY_FAILED", message);
    }
    throw new ServiceError(
      502,
      "MODEL_DISCOVERY_FAILED",
      "获取模型失败，请检查网络和 API Endpoint 后重试",
    );
  }
}
