import { ServiceError } from "../../shared/validation.js";
export async function fetchBytes(
  url: string,
  options: RequestInit = {},
  maxBytes = 4 * 1024 * 1024,
) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new ServiceError(400, "INVALID_URL", "仅支持 HTTP(S) 地址");
  const response = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new ServiceError(
      502,
      "UPSTREAM_ERROR",
      `上游请求失败：HTTP ${response.status}`,
    );
  const parts: Uint8Array[] = [];
  let size = 0;
  if (response.body)
    for await (const chunk of response.body as any) {
      size += chunk.length;
      if (size > maxBytes)
        throw new ServiceError(413, "UPSTREAM_TOO_LARGE", "上游响应超过限制");
      parts.push(chunk);
    }
  return Buffer.concat(parts);
}
export async function fetchJson(
  url: string,
  options: RequestInit = {},
  maxBytes?: number,
): Promise<any> {
  return JSON.parse(
    (await fetchBytes(url, options, maxBytes)).toString("utf8"),
  );
}
