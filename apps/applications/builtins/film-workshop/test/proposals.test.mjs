import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createApplicationFileClient } from "@mewvis/app-sdk/files";
import { fixture as f, memoryStorage } from "./fixture.mjs";
import { createFileHost } from "./file-host.mjs";
const hostRequire = createRequire(
  new URL("../../../../../packages/app/host/package.json", import.meta.url),
);
const schemas = await import(
  pathToFileURL(hostRequire.resolve("@deepseek-ai/dsh-tools")).href
);
const source = () => {
  const project = f.exampleProject();
  return {
    id: "context-one",
    scriptComplete: true,
    chatId: "chat-one",
    episodeId: project.episodes[0].id,
    project,
  };
};
const request = (context, changes) => ({
  contextId: context.id,
  chatId: context.chatId,
  title: "本集创作建议",
  ...changes,
});
const bundle = (context) =>
  request(context, {
    assets: [
      {
        key: "character-new",
        kind: "character",
        name: "听众",
        description: "在雨夜守着收音机的年轻人",
      },
      {
        key: "scene-new",
        kind: "scene",
        name: "街角",
        description: "被雨水打湿的电台街角",
      },
    ],
    shots: [
      {
        title: "等待声音",
        description: "听众站在街角，守着收音机。",
        sceneId: "scene-new",
        characterIds: ["character-new"],
        speakerId: "character-new",
        dialogue: "我还在听。",
        duration: 4,
      },
    ],
  });

test("structured proposals are pending data; adoption adds linked entities without replacing the existing arrays", () => {
  const context = source(),
    original = structuredClone(context.project);
  const proposal = f.createProposal(bundle(context), context);
  assert.deepEqual(context.project, original);
  assert.equal(proposal.changes.length, 3);
  const result = f.applyProposal(
    context.project,
    proposal,
    proposal.changes.map((change) => change.id),
  );
  assert.equal(result.assets.length, original.assets.length + 2);
  const shot = result.episodes[0].shots.at(-1);
  assert.equal(
    shot.sceneId,
    result.assets.find((asset) => asset.name === "街角").id,
  );
  assert.deepEqual(shot.characterIds, [
    result.assets.find((asset) => asset.name === "听众").id,
  ]);
  assert.equal(shot.speakerId, shot.characterIds[0]);
  assert.deepEqual(
    result.episodes[0].shots.slice(0, -1),
    original.episodes[0].shots,
  );
  assert.equal(result.appliedAssistantChangeIds.length, 3);
});

test("partial adoption enforces new-asset dependencies and preserves current shot order", () => {
  const context = source(),
    proposal = f.createProposal(bundle(context), context),
    shot = proposal.changes.at(-1);
  assert.equal(f.changeDependencies(proposal, shot).length, 2);
  assert.throws(
    () => f.applyProposal(context.project, proposal, [shot.id]),
    /同时采用/,
  );
  const first = f.applyProposal(context.project, proposal, [
    proposal.changes[0].id,
  ]);
  assert.equal(first.episodes[0].shots.length, 3);
  first.episodes[0].shots.reverse();
  const order = first.episodes[0].shots.map((shot) => shot.id);
  const result = f.applyProposal(first, proposal, [
    proposal.changes[1].id,
    shot.id,
  ]);
  assert.deepEqual(
    result.episodes[0].shots.slice(0, -1).map((shot) => shot.id),
    order,
  );
  assert.equal(result.assets.length, context.project.assets.length + 2);
});

test("updates preserve unrelated manual edits and media; edits to the same field produce a conflict", () => {
  const context = source(),
    shot = context.project.episodes[0].shots[0];
  const proposal = f.createProposal(
    request(context, {
      shots: [{ id: shot.id, imagePrompt: "新的蓝色雨夜画面" }],
    }),
    context,
  );
  const current = structuredClone(context.project);
  current.episodes[0].shots[0].description = "生成期间修改的手动画面";
  current.episodes[0].shots[0].imageReference = "保留文件备注";
  const media = {
    id: f.newId(),
    name: "existing.png",
    path: "media/existing.png",
    kind: "image",
    size: 100,
    mimeType: "image/png",
    source: "imported",
    createdAt: 1,
  };
  current.workspace = {
    id: "workspace",
    root: "/projects",
    directory: `/projects/film-projects/${current.id}`,
  };
  current.media = [media];
  current.episodes[0].shots[0].mediaIds = [media.id];
  current.episodes[0].shots[0].imageMediaId = media.id;
  const changed = f.applyProposal(current, proposal, [proposal.changes[0].id]);
  assert.equal(
    changed.episodes[0].shots[0].description,
    "生成期间修改的手动画面",
  );
  assert.equal(changed.episodes[0].shots[0].imageReference, "保留文件备注");
  assert.equal(changed.episodes[0].shots[0].imagePrompt, "新的蓝色雨夜画面");
  assert.deepEqual(changed.media, [media]);
  assert.equal(changed.episodes[0].shots[0].imageMediaId, media.id);
  current.episodes[0].shots[0].imagePrompt = "手动指定的画面";
  assert.equal(
    f.changeStatus(current, proposal, proposal.changes[0]),
    "conflict",
  );
  assert.throws(
    () => f.applyProposal(current, proposal, [proposal.changes[0].id]),
    /已修改或删除/,
  );
  assert.equal(current.episodes[0].shots[0].imagePrompt, "手动指定的画面");
});

test("script conflicts and deleted targets never overwrite newer content or recreate entities", () => {
  const context = source(),
    episode = context.project.episodes[0];
  assert.throws(
    () =>
      f.createProposal(request(context, { script: "不能用摘要替换的全文" }), {
        ...context,
        scriptComplete: false,
      }),
    /剧本摘要/,
  );
  const proposal = f.createProposal(
    request(context, {
      script: "修改后的剧本",
      shots: [{ id: episode.shots[0].id, title: "建议标题" }],
    }),
    context,
  );
  const current = structuredClone(context.project);
  current.episodes[0].script = "用户的新剧本";
  current.episodes[0].shots.shift();
  assert.ok(
    proposal.changes.every(
      (change) => f.changeStatus(current, proposal, change) === "conflict",
    ),
  );
  assert.throws(
    () =>
      f.applyProposal(
        current,
        proposal,
        proposal.changes.map((change) => change.id),
      ),
    /已修改或删除/,
  );
  current.episodes = [f.blankEpisode("其他分集")];
  assert.throws(() => f.applyProposal(current, proposal, []), /分集已删除/);
  assert.throws(
    () => f.applyProposal(f.createProject("另一个项目", "movie"), proposal, []),
    /不属于/,
  );
});

test("adoption is idempotent after reload and does not recreate a subsequently deleted AI asset", () => {
  const context = source(),
    proposal = f.createProposal(
      request(context, {
        assets: [{ key: "new", kind: "prop", name: "磁带盒" }],
      }),
      context,
    );
  const selected = proposal.changes.map((change) => change.id);
  const result = f.validateProject(
    JSON.parse(
      JSON.stringify(f.applyProposal(context.project, proposal, selected)),
    ),
  );
  assert.equal(f.applyProposal(result, proposal, selected), result);
  result.assets = result.assets.filter(
    (asset) => asset.id !== proposal.changes[0].targetId,
  );
  assert.equal(f.applyProposal(result, proposal, selected), result);
  assert.equal(f.copyProject(result).appliedAssistantChangeIds, undefined);
});

test("proposal validation rejects stale scopes, foreign targets, invalid references, protected fields and no-op changes", () => {
  const context = source(),
    shot = context.project.episodes[0].shots[0];
  const rejects = (changes, pattern) =>
    assert.throws(
      () => f.createProposal(request(context, changes), context),
      pattern,
    );
  rejects({ contextId: "stale", script: "新剧本" }, /上下文/);
  rejects({ chatId: "other", script: "新剧本" }, /上下文/);
  rejects({ shots: [{ id: "missing", title: "镜头" }] }, /当前分集/);
  rejects(
    {
      assets: [{ key: "new", kind: "scene", name: "场景" }],
      shots: [{ title: "镜头", characterIds: ["new"] }],
    },
    /类型不匹配/,
  );
  rejects({ shots: [{ title: "镜头", sceneId: "missing" }] }, /不存在/);
  rejects({ shots: [{ id: shot.id, mediaIds: [] }] }, /不支持/);
  rejects({ shots: [{ title: "镜头", duration: 0 }] }, /时长/);
  rejects(
    {
      assets: [
        { key: "new", kind: "prop", name: "道具" },
        { key: "new", kind: "prop", name: "道具2" },
      ],
    },
    /重复/,
  );
  rejects({ script: "" }, /不能为空/);
  rejects({ script: context.project.episodes[0].script }, /没有包含新的变更/);
  const proposal = f.createProposal(bundle(context), context);
  proposal.changes[0].after.mediaIds = [];
  assert.throws(() => f.validateProposal(proposal), /不支持/);
});

test("project limits are checked atomically before proposals are published", () => {
  const context = source();
  context.project.assets = Array.from({ length: 150 }, () =>
    f.blankAsset("prop"),
  );
  context.project.episodes[0].shots = [];
  assert.throws(
    () =>
      f.createProposal(
        request(context, {
          assets: [{ key: "new", kind: "prop", name: "过量素材" }],
        }),
        context,
      ),
    /150/,
  );
  assert.equal(context.project.assets.length, 150);
});

test("host proposal tool persists full text outside truncated chat output and reloads pending proposals", async () => {
  const host = createFileHost(Buffer.from("sample")),
    storage = memoryStorage();
  const files = createApplicationFileClient({
    version: 1,
    request: async (request) => host.request(request),
  });
  const store = f.createAssistantStore(storage, files),
    project = f.exampleProject();
  const context = await store.prepare(
    project,
    project.episodes[0].id,
    "chat-one",
  );
  const tool = f.createProposalTool({ storage, files });
  schemas.assertObjectJsonSchema(tool.parameters);
  schemas.assertSupportedJsonSchema(tool.output.schema);
  const args = request(context, { script: "场景与台词。".repeat(9000) });
  assert.deepEqual(schemas.validateJsonSchemaValue(tool.parameters, args), []);
  const result = await tool.execute(args);
  assert.equal(result.status, "pending");
  assert.deepEqual(
    schemas.validateJsonSchemaValue(tool.output.schema, result),
    [],
  );
  assert.ok(JSON.stringify(result).length < 2000);
  assert.equal(
    project.episodes[0].script,
    f.exampleProject().episodes[0].script,
  );
  const [index] = await store.list(
    project.id,
    project.episodes[0].id,
    "chat-one",
  );
  const proposal = await f.createAssistantStore(storage, files).read(index);
  assert.equal(proposal.changes[0].after, args.script);
  assert.deepEqual(
    await store.list(project.id, project.episodes[0].id, "chat-other"),
    [],
  );
  const next = await store.prepare(project, project.episodes[0].id, "chat-one");
  assert.notEqual(next.id, context.id);
  await assert.rejects(tool.execute(args), /上下文已变化/);
  assert.equal(
    (await store.list(project.id, project.episodes[0].id, "chat-one")).length,
    1,
  );
  await store.dismiss(index);
  project.episodes[0].script = "长".repeat(78000);
  const summary = f.assistantContext(project, project.episodes[0], "script");
  const truncated = await store.prepare(
    project,
    project.episodes[0].id,
    "chat-one",
    summary.requestContext,
  );
  assert.equal(truncated.scriptComplete, false);
  await assert.rejects(
    tool.execute(request(truncated, { script: "不能用摘要替换的全文" })),
    /剧本摘要/,
  );
  assert.deepEqual(
    await store.list(project.id, project.episodes[0].id, "chat-one"),
    [],
  );
  assert.equal(
    (await store.read(index)).id,
    proposal.id,
    "dismissal retains the recoverable proposal file",
  );
});
