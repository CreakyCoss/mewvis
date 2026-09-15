export class BackendError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

/** Same-origin proxy owns credentials; they never enter URLs or the browser bundle. */
export async function requestBackend(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new BackendError("无法连接 Node 服务，请检查 Web 服务是否已启动", "CONNECTION_FAILED");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new BackendError(
      body?.error?.message ?? `后端请求失败（HTTP ${response.status}）`,
      body?.error?.code ?? "HTTP_ERROR",
      response.status,
    );
  }
  return response;
}

export async function invokeNode<T>(
  command: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await requestBackend(`commands/${encodeURIComponent(command)}`, {
    signal,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new BackendError("Node API 未接通，请使用 pnpm dev:web 启动", "INVALID_RESPONSE");
  return response.json() as Promise<T>;
}
