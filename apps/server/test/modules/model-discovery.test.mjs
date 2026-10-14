import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverProviderModels } from "../../dist/modules/settings/model-discovery.js";
import { startServer } from "../../dist/server.js";
import { token } from "../support/helpers.mjs";

async function upstream(t, respond) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, headers: request.headers });
    respond(request, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}
const json = (response, data, status = 200) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(data));
};
const input = (apiEndpoint, extra = {}) => ({
  apiEndpoint,
  apiFormat: "openai-completions",
  apiKey: " discovery-test-key ",
  ...extra,
});

test("OpenAI-compatible discovery preserves endpoint paths, authenticates, and deduplicates model IDs", async (t) => {
  const s = await upstream(t, (_request, response) =>
    json(response, {
      data: [
        { id: " custom-model ", name: " Custom Model " },
        { id: "custom-model", name: "Duplicate" },
        { id: "model-2" },
        { id: "model-3", display_name: "Third Model" },
        null,
        { id: "" },
      ],
    }),
  );
  for (const apiFormat of [
    "openai-completions",
    "openai-responses",
    "openrouter",
  ]) {
    assert.deepEqual(
      await discoverProviderModels(
        input(`${s.url}/gateway/v1/?region=test`, { apiFormat }),
      ),
      {
        models: [
          { modelId: "custom-model", modelName: "Custom Model" },
          { modelId: "model-2", modelName: "model-2" },
          { modelId: "model-3", modelName: "Third Model" },
        ],
      },
    );
    const request = s.requests.at(-1);
    assert.equal(request.url, "/gateway/v1/models?region=test");
    assert.equal(request.headers.authorization, "Bearer discovery-test-key");
  }
  await discoverProviderModels(input(s.url, { apiKey: "" }));
  assert.equal(s.requests.at(-1).url, "/models");
  assert.equal(s.requests.at(-1).headers.authorization, undefined);
});

test("Anthropic discovery uses compatible base paths and follows all model pages", async (t) => {
  const s = await upstream(t, (request, response) => {
    const url = new URL(request.url, "http://localhost");
    json(
      response,
      url.searchParams.has("after_id")
        ? {
            data: [{ id: "claude-2", display_name: "Claude Two" }],
            has_more: false,
          }
        : {
            data: [{ id: "claude-1", display_name: "Claude One" }],
            has_more: true,
            last_id: "claude-1",
          },
    );
  });
  for (const base of ["/anthropic", "/anthropic/v1", "/v1", ""]) {
    const { models } = await discoverProviderModels(
      input(`${s.url}${base}`, { apiFormat: "anthropic-messages" }),
    );
    assert.equal(models.length, 2);
    assert.equal(models[1].modelName, "Claude Two");
    const request = s.requests.at(-1);
    const url = new URL(request.url, s.url);
    assert.equal(
      url.pathname,
      `${base.endsWith("/v1") ? base : `${base}/v1`}/models`,
    );
    assert.equal(url.searchParams.get("after_id"), "claude-1");
    assert.equal(request.headers["x-api-key"], "discovery-test-key");
    assert.equal(request.headers["anthropic-version"], "2023-06-01");
    assert.equal(request.headers.authorization, undefined);
  }
});

test("Gemini discovery follows pagination and converts resource names to usable model IDs", async (t) => {
  const s = await upstream(t, (request, response) =>
    json(
      response,
      request.url.includes("pageToken=")
        ? { models: [{ name: "models/gemini-two", displayName: "Gemini Two" }] }
        : {
            models: [{ name: "models/gemini-one", displayName: "Gemini One" }],
            nextPageToken: "next page",
          },
    ),
  );
  const result = await discoverProviderModels(
    input(`${s.url}/v1beta/`, { apiFormat: "google-generative-ai" }),
  );
  assert.deepEqual(
    result.models.map((model) => model.modelId),
    ["gemini-one", "gemini-two"],
  );
  assert.equal(s.requests[0].url, "/v1beta/models?pageSize=1000");
  assert.equal(s.requests[1].headers["x-goog-api-key"], "discovery-test-key");
  assert.equal(
    new URL(s.requests[1].url, s.url).searchParams.get("pageToken"),
    "next page",
  );
});

test("Anthropic discovery preserves explicit limits, vision, thinking support and effort levels", async (t) => {
  const s = await upstream(t, (_request, response) =>
    json(response, {
      data: [
        {
          id: "future-claude",
          display_name: "Future Claude",
          max_input_tokens: 1000000,
          max_tokens: 128000,
          capabilities: {
            image_input: { supported: true },
            thinking: { supported: true },
            effort: {
              supported: true,
              low: { supported: true },
              medium: { supported: false },
              high: { supported: true },
              custom: { supported: true },
            },
            server_tools: { supported: true },
          },
        },
        {
          id: "no-thinking",
          capabilities: {
            image_input: { supported: false },
            thinking: { supported: false },
            effort: { supported: false },
          },
        },
      ],
    }),
  );
  const { models } = await discoverProviderModels(
    input(s.url, { apiFormat: "anthropic-messages" }),
  );
  assert.deepEqual(models[0], {
    modelId: "future-claude",
    modelName: "Future Claude",
    limits: { contextWindow: 1000000, maxTokens: 128000 },
    capabilities: { input: ["text", "image"], reasoning: true },
    thinking: { levels: ["low", "high", "custom"] },
  });
  assert.deepEqual(models[1].capabilities, {
    input: ["text"],
    reasoning: false,
  });
  assert.equal(models[1].thinking, undefined);
  assert.equal(models[0].capabilities.toolCalling, undefined);
});

test("Gemini discovery reads reported token limits and thinking without inventing effort levels or modalities", async (t) => {
  const s = await upstream(t, (_request, response) =>
    json(response, {
      models: [
        {
          name: "models/future-gemini",
          displayName: "Future Gemini",
          inputTokenLimit: 1048576,
          outputTokenLimit: 65536,
          thinking: true,
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
        {
          name: "models/no-thinking",
          thinking: false,
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/embed-only",
          supportedGenerationMethods: ["embedContent"],
        },
      ],
    }),
  );
  const { models } = await discoverProviderModels(
    input(s.url, { apiFormat: "google-generative-ai" }),
  );
  assert.deepEqual(models[0].limits, {
    contextWindow: 1048576,
    maxTokens: 65536,
  });
  assert.deepEqual(models[0].capabilities, {
    reasoning: true,
    operations: ["chat"],
  });
  assert.equal(models[0].thinking, undefined);
  assert.deepEqual(models[1].capabilities, {
    reasoning: false,
    operations: ["chat"],
  });
  assert.deepEqual(models[2].capabilities, { operations: [] });
});

test("OpenRouter metadata maps modalities and supported parameters while unsupported outputs stay outside chat", async (t) => {
  const s = await upstream(t, (_request, response) =>
    json(response, {
      data: [
        {
          id: "vendor/multimodal",
          context_length: 200000,
          architecture: {
            input_modalities: ["text", "image", "file", "image"],
            output_modalities: ["text", "image"],
          },
          top_provider: { max_completion_tokens: 32000 },
          supported_parameters: ["tools", "reasoning"],
        },
        {
          id: "vendor/plain",
          architecture: {
            input_modalities: ["text"],
            output_modalities: ["text"],
          },
          supported_parameters: ["temperature"],
        },
        {
          id: "vendor/embedding",
          architecture: {
            input_modalities: ["text"],
            output_modalities: ["embeddings"],
          },
        },
      ],
    }),
  );
  const { models } = await discoverProviderModels(
    input(s.url, { apiFormat: "openrouter" }),
  );
  assert.deepEqual(models[0].limits, {
    contextWindow: 200000,
    maxTokens: 32000,
  });
  assert.deepEqual(models[0].capabilities, {
    input: ["text", "image"],
    output: ["text", "image"],
    operations: ["chat", "image-generation", "image-editing"],
    reasoning: true,
    toolCalling: true,
  });
  assert.equal(models[0].thinking, undefined);
  assert.equal(models[1].capabilities.reasoning, false);
  assert.equal(models[1].capabilities.toolCalling, false);
  assert.deepEqual(models[2].capabilities, {
    input: ["text"],
    output: [],
    operations: [],
  });
  assert.equal(s.requests.length, 1);
});

test("compatible metadata preserves false and empty values, ignores malformed fields, and never leaks raw metadata", async (t) => {
  const s = await upstream(t, (_request, response) =>
    json(response, {
      data: [
        {
          id: "custom",
          limits: { contextWindow: 8192, maxTokens: 2048 },
          capabilities: {
            operations: [],
            input: [],
            output: [],
            reasoning: false,
            toolCalling: false,
          },
          thinking: { levels: ["low", "high"] },
          secret: "private-response",
        },
        {
          id: "bad-values",
          context_length: -1,
          max_output_tokens: 1.5,
          limits: { contextWindow: "1000", maxTokens: 0 },
          capabilities: {
            input: [1, "text"],
            output: null,
            reasoning: "false",
            toolCalling: {},
          },
          supported_parameters: null,
          thinking: { levels: [1] },
        },
        {
          id: "contradictory",
          context_length: 4096,
          max_output_tokens: 8192,
        },
        {
          id: "efforts-only",
          reasoning_efforts: ["low", "high", "low"],
        },
        {
          id: "no-effort-options",
          thinking: { levels: [] },
        },
      ],
    }),
  );
  const { models } = await discoverProviderModels(input(s.url));
  assert.deepEqual(models[0], {
    modelId: "custom",
    modelName: "custom",
    limits: { contextWindow: 8192, maxTokens: 2048 },
    capabilities: {
      operations: [],
      input: [],
      output: [],
      reasoning: false,
      toolCalling: false,
    },
  });
  assert.deepEqual(models[1], {
    modelId: "bad-values",
    modelName: "bad-values",
  });
  assert.deepEqual(models[2].limits, { contextWindow: 4096 });
  assert.deepEqual(models[3].thinking, { levels: ["low", "high"] });
  assert.equal(models[3].capabilities.reasoning, true);
  assert.deepEqual(models[4].thinking, { levels: [] });
  assert.doesNotMatch(
    JSON.stringify(models),
    /private-response|discovery-test-key/,
  );
});

test("upstream failures and invalid responses are actionable and never expose credentials or response bodies", async (t) => {
  let status = 401;
  let payload = { error: "discovery-test-key private upstream response" };
  const s = await upstream(t, (_request, response) =>
    json(response, payload, status),
  );
  for (const [code, message] of [
    [401, /API Key/],
    [403, /访问权限/],
    [404, /不支持获取模型/],
    [405, /不支持获取模型/],
    [429, /稍后重试/],
    [500, /HTTP 500/],
  ]) {
    status = code;
    await assert.rejects(discoverProviderModels(input(s.url)), (error) => {
      assert.equal(error.code, "MODEL_DISCOVERY_FAILED");
      assert.match(error.message, message);
      assert.doesNotMatch(error.message, /discovery-test-key|private upstream/);
      return true;
    });
  }
  status = 200;
  await assert.rejects(discoverProviderModels(input(s.url)), {
    code: "MODEL_DISCOVERY_INVALID_RESPONSE",
  });
  payload = { data: [] };
  assert.deepEqual(await discoverProviderModels(input(s.url)), { models: [] });
  payload = { data: [{ id: "one" }], has_more: true, last_id: "one" };
  await assert.rejects(
    discoverProviderModels(input(s.url, { apiFormat: "anthropic-messages" })),
    { code: "MODEL_DISCOVERY_INVALID_RESPONSE" },
  );
});

test("invalid connection drafts are rejected and discovery requests can be canceled", async (t) => {
  const s = await upstream(t, () => {});
  for (const bad of [
    input("invalid-url"),
    input("file:///tmp/models"),
    input("https://user:password@example.com"),
    input(""),
    input(s.url, { apiFormat: "unknown" }),
    input(s.url, { apiKey: 42 }),
    input(s.url, { models: [] }),
  ])
    await assert.rejects(
      discoverProviderModels(bad),
      (error) => error.status === 400,
    );
  const controller = new AbortController();
  const pending = discoverProviderModels(input(s.url), controller.signal);
  controller.abort();
  await assert.rejects(pending, { code: "REQUEST_CANCELED" });
});

test("authenticated discovery accepts unsaved drafts and leaves persisted LLM settings unchanged", async (t) => {
  const s = await upstream(t, (_request, response) =>
    json(response, {
      data: [
        {
          id: "unsaved-model",
          context_length: 64000,
          max_output_tokens: 8000,
          capabilities: { input: ["text", "image"], toolCalling: false },
          reasoning_efforts: ["low", "high"],
        },
      ],
    }),
  );
  const root = await mkdtemp(join(tmpdir(), "mewvis-model-discovery-"));
  const server = await startServer({
    token,
    port: 0,
    runtime: {
      dataDir: root,
      cliPath: fileURLToPath(
        new URL("../support/fixtures/runtime.mjs", import.meta.url),
      ),
    },
  });
  t.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const invoke = async (command, args = {}, authorized = true) => {
    const response = await fetch(`${server.url}/api/commands/${command}`, {
      method: "POST",
      headers: authorized ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(args),
    });
    return { status: response.status, body: await response.json() };
  };
  const before = await invoke("get_llm_settings");
  assert.equal(
    (await invoke("discover_provider_models", { input: input(s.url) }, false))
      .status,
    401,
  );
  assert.equal(s.requests.length, 0);
  const discovered = await invoke("discover_provider_models", {
    input: input(s.url),
  });
  assert.deepEqual(discovered, {
    status: 200,
    body: {
      models: [
        {
          modelId: "unsaved-model",
          modelName: "unsaved-model",
          limits: { contextWindow: 64000, maxTokens: 8000 },
          capabilities: {
            input: ["text", "image"],
            toolCalling: false,
            reasoning: true,
          },
          thinking: { levels: ["low", "high"] },
        },
      ],
    },
  });
  assert.deepEqual(await invoke("get_llm_settings"), before);
  assert.equal(
    (
      await invoke("discover_provider_models", {
        input: input(s.url),
        unexpected: true,
      })
    ).status,
    400,
  );
});
