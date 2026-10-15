import { setTimeout as delay } from "node:timers/promises";
import {
  buildModelRequest,
  parseModelResponse,
  type JsonValue,
  type ModelPurpose,
  type ModelTemplateContext,
} from "@mewvis/chat-contracts/model-configuration";

export type MediaOutput = ReturnType<
  typeof parseModelResponse
>["outputs"][number];
export type MediaTransport = {
  signal: AbortSignal;
  authorizeUrl(url: URL): void;
  fetch?: typeof globalThis.fetch;
};

/** Never forward credentials to a redirect target. Templates own the initial authority. */
export async function fetchMedia(
  address: string,
  init: RequestInit,
  transport: MediaTransport,
): Promise<Response> {
  let url = new URL(address);
  let headers = new Headers(init.headers);
  for (let redirects = 0; redirects <= 5; redirects++) {
    transport.signal.throwIfAborted();
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("媒体请求仅支持无用户名密码的 HTTP/HTTPS 地址");
    transport.authorizeUrl(url);
    const response = await (transport.fetch ?? globalThis.fetch)(url, {
      ...init,
      headers,
      redirect: "manual",
      signal: transport.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      // Replaying a paid submission, or changing its method, is deliberately unsupported.
      if (!location || init.method !== "GET")
        throw new Error(
          "生成请求发生重定向，请修正模型配置中的请求地址；没有重新提交",
        );
      const next = new URL(location, url);
      if (url.protocol === "https:" && next.protocol !== "https:")
        throw new Error("不允许将媒体请求降级到 HTTP");
      if (next.origin !== url.origin) headers = new Headers();
      url = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`媒体服务请求失败（HTTP ${response.status}）`);
    }
    return response;
  }
  throw new Error("媒体下载重定向次数过多");
}

async function readJson(response: Response): Promise<JsonValue> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (!response.body) throw new Error("媒体服务返回空响应");
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 64 * 1024 * 1024)
        throw new Error("媒体 JSON 响应超过 64 MiB，请配置 URL 输出");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonValue;
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("媒体服务没有返回有效 JSON，请检查模型响应配置");
    throw error;
  }
}

export async function executeMedia(options: {
  purpose: ModelPurpose;
  context: Omit<ModelTemplateContext, "params">;
  parameters: Record<string, JsonValue>;
  transport: MediaTransport;
  progress(stage: string, taskId?: string): void;
}): Promise<MediaOutput[]> {
  const { purpose, context, parameters, transport, progress } = options;
  const request = async (phase: "initial" | "result") => {
    const built = buildModelRequest(purpose, context, parameters, phase);
    const response = await fetchMedia(
      built.url,
      {
        method: built.method,
        headers: built.headers,
        ...(built.body === undefined
          ? {}
          : { body: JSON.stringify(built.body) }),
      },
      transport,
    );
    return parseModelResponse(purpose, await readJson(response), phase);
  };
  progress("submitting");
  let result = await request("initial");
  if (result.status === "pending") {
    context.task = { id: result.taskId! };
    progress("running", result.taskId);
    while (result.status === "pending") {
      await delay(purpose.response!.task!.intervalSeconds * 1000, undefined, {
        signal: transport.signal,
      });
      result = await request("result");
    }
  }
  if (result.status === "failed")
    throw new Error(result.error || "媒体生成失败");
  if (!result.outputs.length)
    throw new Error("生成已结束，但没有匹配到产物，请检查响应提取规则");
  if (result.outputs.length > 64) throw new Error("单次生成产物超过 64 项");
  progress("collecting", context.task?.id);
  return result.outputs;
}
