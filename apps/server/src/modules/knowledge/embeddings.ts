import { fetchJson } from "../../infrastructure/network/http.js";
import { ServiceError } from "../../shared/validation.js";
export async function embed(
  profile: any,
  items: { content: string; title?: string }[],
  query = false,
  signal?: AbortSignal,
): Promise<number[][]> {
  const ollama = profile.providerKind === "ollama";
  let base = String(
    profile.baseUrl ||
      (ollama ? "http://127.0.0.1:11434" : "https://api.openai.com/v1"),
  ).replace(/\/+$/, "");
  base = base.replace(
    /\/(chat\/completions|responses|embeddings|api\/embed)$/,
    "",
  );
  if (ollama) base = base.replace(/\/(api|v1)$/, "") + "/api/embed";
  else {
    if (new URL(base).pathname === "/") base += "/v1";
    base += "/embeddings";
  }
  const gemma = String(profile.modelId)
    .toLowerCase()
    .startsWith("embeddinggemma");
  const input = items.map((x) =>
    gemma
      ? query
        ? `task: search result | query: ${x.content}`
        : `title: ${x.title || "none"} | text: ${x.content}`
      : x.content,
  );
  const data = await fetchJson(
    base,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(!ollama && profile.apiKey
          ? { authorization: `Bearer ${profile.apiKey}` }
          : {}),
      },
      body: JSON.stringify({ model: profile.modelId, input }),
      signal: AbortSignal.any([
        AbortSignal.timeout(ollama ? 600000 : 120000),
        ...(signal ? [signal] : []),
      ]),
    },
    32 * 1024 * 1024,
  );
  const vectors = ollama
    ? (data.embeddings ?? (data.embedding ? [data.embedding] : null))
    : data.data
        ?.sort((a: any, b: any) => a.index - b.index)
        .map((x: any) => x.embedding);
  if (
    !Array.isArray(vectors) ||
    vectors.length !== items.length ||
    vectors.some(
      (v) =>
        !Array.isArray(v) ||
        v.length !== profile.dimensions ||
        v.some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
        Math.hypot(...v) === 0,
    )
  )
    throw new ServiceError(
      502,
      "INVALID_EMBEDDING",
      "Embedding 响应数量、维度或数值无效",
    );
  return vectors;
}
