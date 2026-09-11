import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { dshBundleCompatibilityPlugin } from "@isle/plugin-dev/dsh";

const temp = mkdtempSync(join(tmpdir(), "isle-pi-chat-"));
const requests = [];
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body);
  const url = new URL(request.url, "http://127.0.0.1").pathname;
  requests.push({ url, headers: request.headers, input });
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  if (url.endsWith("/messages")) {
    // The retained Anthropic compatibility fix must work in the bundled SDK too.
    for (const event of [
      {
        type: "message_start",
        message: { id: "test", type: "message", role: "assistant", model: input.model, content: [] },
      },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "中文 chat reply" } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null } },
      { type: "message_stop" },
    ])
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  } else {
    for (const [delta, finishReason] of [
      [{ role: "assistant", content: "中文 chat reply" }, null],
      [{}, "stop"],
    ])
      response.write(
        `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: input.model, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`,
      );
    response.write("data: [DONE]\n\n");
  }
  response.end();
});

try {
  const bundle = join(temp, "chat.mjs");
  await build({
    tsconfig: resolve("agent-runtime/tsconfig.json"),
    entryPoints: [resolve("agent-runtime/src/engines/drivers/native/agent/runtimes/pi/chat/index.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundle,
    plugins: [dshBundleCompatibilityPlugin],
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
  });
  const { PiChatRuntime } = await import(pathToFileURL(bundle).href);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const chat = new PiChatRuntime();
  // Concurrent calls to the same provider must retain separate credentials/endpoints.
  await Promise.all(
    [true, false].flatMap((stream) =>
      ["openai", "isle-custom", "anthropic"].map(async (provider) => {
        const id = `${provider}-${stream}`;
        const events = [];
        const anthropic = provider === "anthropic";
        const result = await chat.chat(
          {
            stream,
            streamId: id,
            systemPrompt: "System instruction",
            messages: [{ role: "user", content: `request ${id}` }],
            runtimeModel: {
              provider,
              apiFormat: anthropic ? "anthropic-messages" : "openai-completions",
              apiEndpoint: `${endpoint}/${id}${anthropic ? "" : "/v1"}`,
              apiKey: `test-key-${id}`,
              modelId: `model-${id}`,
              catalogModelId: "not-in-catalog",
              reasoning: false,
              headers: { "x-isle-request": id },
            },
          },
          { emit: (event) => events.push(event), maxRetries: 0 },
        );
        assert.equal(result.text, "中文 chat reply");
        assert.equal(
          events
            .filter((event) => event.type === "text_delta")
            .map((event) => event.delta)
            .join(""),
          stream ? result.text : "",
        );
        assert.ok(events.every((event) => event.taskId === id));
        const request = requests.find((item) => item.headers["x-isle-request"] === id);
        assert.ok(request);
        assert.equal(request.url, `/${id}/v1/${anthropic ? "messages" : "chat/completions"}`);
        assert.equal(request.input.model, `model-${id}`);
        assert.equal(
          request.headers[anthropic ? "x-api-key" : "authorization"],
          `${anthropic ? "" : "Bearer "}test-key-${id}`,
        );
        assert.match(JSON.stringify(request.input), /System instruction/);
        assert.match(JSON.stringify(request.input), new RegExp(`request ${id}`));
      }),
    ),
  );
  assert.equal(requests.length, 6);
  console.log(
    "PASS Pi chat stream/complete, custom providers, concurrent auth/endpoint isolation and Anthropic missing usage",
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
