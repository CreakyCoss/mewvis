import test from "node:test";
import assert from "node:assert/strict";
import { createApplicationFileClient } from "@mewvis/app-sdk/files";
import { fixture as f, memoryStorage } from "./fixture.mjs";
import { createFileHost } from "./file-host.mjs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const hostRequire = createRequire(
  new URL("../../../../../packages/app/host/package.json", import.meta.url),
);
const schemas = await import(
  pathToFileURL(hostRequire.resolve("@deepseek-ai/dsh-tools")).href
);

async function fixture(selected = true) {
  const storage = memoryStorage();
  const host = createFileHost(Buffer.from("sample"));
  const files = createApplicationFileClient({
    version: 1,
    request: async (request) => host.request(request),
  });
  const project = f.exampleProject();
  project.workspace = {
    id: "film-workspace",
    root: "/projects",
    directory: `/projects/film-projects/${project.id}`,
  };
  const episode = project.episodes[0],
    shot = episode.shots[2];
  const assistant = f.createAssistantStore(storage, files);
  const source = await assistant.prepare(
    project,
    episode.id,
    "film-chat",
    f.assistantContext(
      project,
      episode,
      "dubbing",
      selected ? shot.id : undefined,
    ).requestContext,
  );
  const store = f.createMediaRequestStore(storage);
  const tool = f.createMediaRequestTool({ storage, files });
  return { storage, project, episode, shot, assistant, source, store, tool };
}
const args = (source, purpose, extra = {}) => ({
  contextId: source.id,
  chatId: source.chatId,
  purpose,
  ...extra,
});
const prepared = (job) => ({
  type: "tool",
  name: "film_prepare_media",
  status: "done",
  events: [{ kind: "output", content: JSON.stringify({ requestId: job.id }) }],
});
const user = () => ({
  role: "user",
  blocks: [{ type: "text", content: "请为当前镜头生成媒体" }],
});
function output(project, job) {
  return {
    type: f.generationType(job).kind,
    filePath: `${project.workspace.directory}/generated/${job.id}/output.bin`,
  };
}
function result(project, job, status = "completed") {
  return {
    type: "tool",
    name: "generate_media",
    status: status === "failed" ? "error" : "done",
    events: [
      {
        kind: "input",
        content: JSON.stringify({
          outputDirectory: `${project.workspace.directory}/generated/${job.id}`,
        }),
      },
    ],
    media: {
      purpose: job.purpose,
      status,
      outputs: status === "completed" ? [output(project, job)] : [],
      ...(status === "failed" ? { error: "provider rejected" } : {}),
    },
  };
}

test("button and assistant registration share one durable request and pin the selected shot", async () => {
  const q = await fixture();
  schemas.assertObjectJsonSchema(q.tool.parameters);
  schemas.assertSupportedJsonSchema(q.tool.output.schema);
  assert.deepEqual(
    schemas.validateJsonSchemaValue(
      q.tool.parameters,
      args(q.source, "speech"),
    ),
    [],
  );
  const fromButton = await q.store.prepare(q.source, "speech", q.shot.id);
  const [fromChat, duplicate] = await Promise.all([
    q.tool.execute(args(q.source, "speech")),
    q.tool.execute(args(q.source, "speech")),
  ]);
  assert.equal(fromChat.requestId, fromButton.id);
  assert.deepEqual(fromChat, duplicate);
  assert.equal(fromButton.shotId, q.shot.id);
  assert.equal(fromButton.contextId, q.source.id);
  assert.equal(q.project.generations, undefined);
  assert.match(fromChat.instruction, /本轮任务已登记/);
  assert.match(fromChat.instruction, /ask_user/);
  assert.match(fromChat.instruction, new RegExp(`/generated/${fromButton.id}`));
  const reopened = f.createMediaRequestStore(q.storage);
  const records = await reopened.unread(q.project, new Set());
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].job, fromButton);
  assert.deepEqual(
    await reopened.unread(
      q.project,
      new Set(records.map((record) => record.key)),
    ),
    [],
  );
});

test("ambiguous, foreign and stale contexts cannot register a target and explicitly require a question", async () => {
  const q = await fixture(false);
  await assert.rejects(q.tool.execute(args(q.source, "speech")), /ask_user/);
  await assert.rejects(
    q.tool.execute(args(q.source, "speech", { shotId: "foreign" })),
    /ask_user/,
  );
  await assert.rejects(
    q.tool.execute(args(q.source, "image-editing")),
    /不支持/,
  );
  const next = await q.assistant.prepare(
    q.project,
    q.episode.id,
    q.source.chatId,
  );
  assert.notEqual(next.id, q.source.id);
  await assert.rejects(
    q.tool.execute(args(q.source, "speech", { shotId: q.shot.id })),
    /上下文已变化/,
  );
  assert.deepEqual(await q.store.unread(q.project, new Set()), []);
});

test("empty dialogue can start a clarification task without fabricating content", async () => {
  const q = await fixture();
  const job = await q.store.prepare(q.source, "speech", q.episode.shots[0].id);
  assert.equal(job.prompt, "");
  assert.equal(job.status, "preparing");
  const plan = await q.tool.execute(
    args(q.source, "speech", { shotId: job.shotId }),
  );
  assert.equal(plan.requestId, job.id);
  assert.match(plan.instruction, /为空时必须先 ask_user/);
});

test("ordinary conversation results bind all three media purposes through registered context", async () => {
  const q = await fixture();
  const jobs = [];
  for (const purpose of ["image-generation", "video-generation", "speech"])
    jobs.push(await q.store.prepare(q.source, purpose));
  const snapshot = {
    phase: "idle",
    execution: { taskId: "chat-task", state: "completed" },
    messages: [
      user(),
      {
        role: "assistant",
        status: "done",
        blocks: jobs.flatMap((job) => [prepared(job), result(q.project, job)]),
      },
    ],
  };
  let project = { ...q.project, generations: jobs };
  for (const job of jobs) {
    const media = f.generationResult(job, snapshot);
    assert.equal(media.status, "completed");
    assert.equal(media.taskId, "chat-task");
    assert.deepEqual(media.outputs, [output(q.project, job)]);
    const item = {
      id: f.newId(),
      path: f.relativeMediaPath(project, media.outputs[0].filePath),
      name: "output",
      kind: f.generationType(job).kind,
      source: "generated",
      mimeType: "",
      size: 4,
      createdAt: 1,
    };
    project = f.applyGeneration(project, job.id, media.status, [item]);
    assert.equal(
      project.episodes[0].shots[2][f.generationType(job).field],
      item.id,
    );
    assert.equal(
      project.episodes[0].shots[0][f.generationType(job).field],
      undefined,
    );
  }
  assert.equal(f.validateProject(project).media.length, 3);
});

test("two image targets in one conversation never consume each other's results or failures", async () => {
  const q = await fixture();
  const a = await q.store.prepare(
    q.source,
    "image-generation",
    q.episode.shots[0].id,
  );
  const b = await q.store.prepare(
    q.source,
    "image-generation",
    q.episode.shots[1].id,
  );
  const snapshot = {
    phase: "idle",
    messages: [
      user(),
      {
        role: "assistant",
        status: "done",
        blocks: [
          prepared(a),
          prepared(b),
          result(q.project, a),
          result(q.project, b, "failed"),
        ],
      },
    ],
  };
  assert.equal(f.generationResult(a, snapshot).status, "completed");
  assert.deepEqual(f.generationResult(a, snapshot).outputs, [
    output(q.project, a),
  ]);
  assert.equal(f.generationResult(b, snapshot).status, "failed");
  assert.equal(f.generationResult(b, snapshot).error, "provider rejected");
  assert.deepEqual(f.generationResult(b, snapshot).outputs, []);
});

test("ask_user keeps the registered task alive and the answer continues the same task", async () => {
  const q = await fixture();
  const job = await q.store.prepare(q.source, "speech");
  const snapshot = {
    phase: "waiting",
    pendingQuestion: { questionId: "voice-question" },
    execution: { taskId: "voice-task", state: "running" },
    messages: [
      user(),
      {
        role: "assistant",
        status: "streaming",
        blocks: [
          prepared(job),
          { type: "tool", name: "ask_user", status: "running", events: [] },
        ],
      },
    ],
  };
  const waiting = f.generationResult(job, snapshot);
  assert.equal(waiting.status, "running");
  assert.equal(waiting.error, undefined);
  assert.equal(waiting.taskId, "voice-task");
  snapshot.phase = "idle";
  snapshot.execution.state = "completed";
  snapshot.messages[1].status = "done";
  snapshot.messages[1].blocks.push(result(q.project, job));
  assert.equal(
    f.generationResult({ ...job, taskId: waiting.taskId }, snapshot).status,
    "completed",
  );
  assert.equal((await q.store.unread(q.project, new Set())).length, 1);
  const cancelled = structuredClone(snapshot);
  cancelled.messages[1].blocks = [
    prepared(job),
    {
      type: "tool",
      name: "ask_user",
      status: "done",
      events: [
        {
          kind: "output",
          content: JSON.stringify({
            details: { cancelled: true, answer: null },
          }),
        },
      ],
    },
  ];
  assert.equal(f.generationResult(job, cancelled).status, "stopped");
  cancelled.messages[1].blocks[1].events[0].content = JSON.stringify({
    cancelled: true,
    answer: null,
  });
  assert.equal(
    f.generationResult(job, cancelled).status,
    "failed",
    "cancellation must use the host's structured details field",
  );
});

test("retry requests are explicit, ordered and idempotent, with a fresh output directory", async () => {
  const q = await fixture();
  await assert.rejects(
    q.tool.execute(args(q.source, "speech", { attempt: 1 })),
    /重试前/,
  );
  const first = await q.tool.execute(args(q.source, "speech"));
  const retry = await q.tool.execute(args(q.source, "speech", { attempt: 1 }));
  assert.notEqual(first.requestId, retry.requestId);
  assert.deepEqual(
    await q.tool.execute(args(q.source, "speech", { attempt: 1 })),
    retry,
  );
  await assert.rejects(
    q.tool.execute(args(q.source, "speech", { attempt: -1 })),
    /序号/,
  );
  assert.equal((await q.store.unread(q.project, new Set())).length, 2);
});

test("unregistered conversations do not guess a binding; malformed persisted targets fail closed", async () => {
  const q = await fixture();
  const job = await q.store.prepare(q.source, "speech");
  assert.equal(
    f.generationResult(job, {
      phase: "idle",
      messages: [
        user(),
        { role: "assistant", status: "done", blocks: [result(q.project, job)] },
      ],
    }),
    null,
  );
  const records = await q.store.unread(q.project, new Set());
  const stored = q.storage.values.get(records[0].key);
  stored.job.workspaceId = "foreign-workspace";
  await assert.rejects(q.store.unread(q.project, new Set()), /工作区不一致/);
});
