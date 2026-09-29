import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({
  stdin: {
    contents:
      'export * from "./main/stories/story/workbench/model.ts"; export * from "./main/stories/story/workbench/persistence.ts"; export * from "./main/stories/story/workbench/manuscript-drafts.ts"; export { createStoryProjectApi } from "./core/project/index.ts";',
    resolveDir: root,
    loader: "ts",
  },
  tsconfig: `${root}/tsconfig.json`,
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  buildChapters,
  newChapterWrites,
  renameChapterWrites,
  manuscriptWrites,
  manuscriptText,
  wordCount,
  applySuggestion,
  encodeWritingRequest,
  decodeWritingRequest,
  parseSuggestion,
  createStoryProjectApi,
  commitDocumentWrites,
  conversationTitle,
  createManuscriptDrafts,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const doc = (kind, id, data = {}) => ({
  ref: { kind, identity: { id } },
  value: { kind, id, ...data },
  displayName: id,
  updatedAt: null,
});

test("associate independently named plans and results without duplicating chapters", () => {
  const documents = [
    doc("story-chapter-plan", "plan-a", {
      number: 1,
      title: "雨夜",
      volumeId: "v1",
    }),
    doc("story-chapter", "result-b", {
      number: 1,
      title: "雨夜",
      planId: "plan-a",
    }),
    doc("story-chapter-content", "result-b", { content: "正文" }),
    doc("story-chapter-plan", "plan-2", { number: 2, title: "旧信" }),
  ];
  const chapters = buildChapters(documents);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].id, "result-b");
  assert.equal(chapters[0].key, "story-chapter-plan?id=plan-a");
  assert.equal(manuscriptText(chapters[0].content), "正文");
  assert.equal(chapters[1].content, undefined);
});

test("selection proposals target exact offsets, including repeated prose and Unicode", () => {
  const source = "雨落。🌧雨落。";
  const target = {
    chapterKey: "a",
    chapterLabel: "第1章",
    source,
    selection: { chapterKey: "a", start: 5, end: 8, text: "雨落。" },
    action: "润色",
  };
  assert.equal(applySuggestion("a", source, target, "风起。"), "雨落。🌧风起。");
  assert.throws(() => applySuggestion("b", source, target, "风起。"), /回到/);
  assert.throws(
    () => applySuggestion("a", "雨落。🌧雨停。", target, "风起。"),
    /原文已变化/,
  );
});

test("continuation refuses to overwrite a changed draft", () => {
  const target = {
    chapterKey: "a",
    chapterLabel: "第1章",
    source: "开头",
    selection: null,
    action: "续写",
  };
  assert.equal(applySuggestion("a", "开头", target, "后续"), "开头\n\n后续");
  assert.throws(
    () => applySuggestion("a", "改过的开头", target, "后续"),
    /正文已变化/,
  );
});

test("persist request targets with conversation messages, parse only explicit suggestion blocks", () => {
  const request = {
    chapterKey: "a",
    chapterLabel: "第1章",
    source: "雨夜",
    selection: null,
    action: "续写",
  };
  const encoded = encodeWritingRequest("续写，保持悬疑感。", request);
  assert.equal(
    conversationTitle("续写，保持悬疑感。 <isle-writing-co"),
    "续写，保持悬疑感。",
  );
  assert.deepEqual(decodeWritingRequest(encoded), {
    text: "续写，保持悬疑感。",
    request,
  });
  assert.deepEqual(decodeWritingRequest("普通对话"), { text: "普通对话" });
  assert.equal(
    decodeWritingRequest(encoded.replace('"source":"雨夜"', '"source":null'))
      .request,
    undefined,
  );
  assert.deepEqual(
    parseSuggestion("保持节奏。\n```story-suggestion\n来客叩门。\n```"),
    { explanation: "保持节奏。", suggestion: "来客叩门。" },
  );
  assert.equal(
    parseSuggestion("这是普通分析。\n```text\n示例\n```").suggestion,
    null,
  );
});

for (const storyTypeId of ["long-novel", "short-novel"]) {
  test(`${storyTypeId}: create linked chapters and save prose with the real project validator`, async () => {
    const project = await createStoryProjectApi({ kind: "memory" }).create(
      `/memory/${storyTypeId}`,
      { storyTypeId, storyId: `story-${storyTypeId}`, title: "雾港" },
    );
    const summary = await project.describe();
    const structure = await project.describe({
      documentKinds: Object.keys(summary.documents),
    });
    const commit = async (writes) =>
      commitDocumentWrites(project, () => writes);
    await commit(
      newChapterWrites(structure, await project.listDocuments(), "chapter-1", " 雨夜来客 "),
    );
    let chapters = buildChapters(await project.listDocuments(), structure);
    assert.equal(chapters.length, 1);
    assert.ok(chapters[0].plan && chapters[0].record && chapters[0].content);
    assert.equal(chapters[0].title, "雨夜来客");
    assert.equal(chapters[0].plan.value.title, "雨夜来客");
    assert.equal(chapters[0].record.value.title, "雨夜来客");
    const stableKey = chapters[0].key;
    const text = "雨夜。\n\n来客叩门。🌧";
    await commit(manuscriptWrites(structure, chapters[0], text));
    chapters = buildChapters(await project.listDocuments(), structure);
    assert.equal(chapters[0].key, stableKey);
    assert.equal(manuscriptText(chapters[0].content), text);
    assert.equal(chapters[0].record.value.wordCount, wordCount(text));
    await commit(renameChapterWrites(chapters[0], " 灯下的影子 "));
    chapters = buildChapters(await project.listDocuments(), structure);
    assert.equal(chapters[0].key, stableKey);
    assert.equal(chapters[0].title, "灯下的影子");
    assert.equal(chapters[0].plan.value.title, "灯下的影子");
    assert.equal(chapters[0].record.value.title, "灯下的影子");
    assert.equal(manuscriptText(chapters[0].content), text);
    assert.throws(() => renameChapterWrites(chapters[0], "  "), /请输入章节标题/);
    await commit(
      newChapterWrites(structure, await project.listDocuments(), "chapter-2", "门外的人"),
    );
    chapters = buildChapters(await project.listDocuments(), structure);
    assert.equal(chapters[1].title, "门外的人");
    assert.deepEqual(
      chapters.map((c) => c.number),
      [1, 2],
    );
    assert.equal(chapters[0].volumeId, chapters[1].volumeId);
    const volume = (await project.listDocuments()).find(
      (d) => d.ref.kind === structure.roles.volume,
    );
    assert.equal(volume.value.endChapter, 2);
    assert.deepEqual(volume.value.chapterIds, ["chapter-1", "chapter-2"]);
  });
}

async function draftFixture() {
  const project = await createStoryProjectApi({ kind: "memory" }).create(
    "/memory/drafts",
    { storyTypeId: "long-novel", storyId: "draft-story", title: "草稿" },
  );
  await commitDocumentWrites(project, (docs, structure) =>
    newChapterWrites(structure, docs, "chapter-1", "草稿章节"),
  );
  const documents = await project.listDocuments();
  const chapter = buildChapters(documents)[0];
  return { project, chapter };
}

test("undo during an in-flight save survives the persisted document refresh", async () => {
  const { project, chapter } = await draftFixture();
  let release;
  let committed;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const commitFinished = new Promise((resolve) => {
    committed = resolve;
  });
  let first = true;
  const drafts = createManuscriptDrafts(
    async (build) => {
      const result = await commitDocumentWrites(project, build);
      // React receives refreshed documents before the save promise settles.
      drafts.sync(buildChapters(result.documents));
      if (first) {
        first = false;
        committed();
        await gate;
      }
      return result.documents;
    },
    () => "/memory/drafts",
    () => {},
  );
  drafts.sync([chapter]);
  drafts.update(chapter, "助手建议");
  const saving = drafts.flush();
  await commitFinished;
  drafts.update(chapter, "");
  drafts.sync(buildChapters(await project.listDocuments()));
  assert.equal(
    drafts.textFor(chapter),
    "",
    "an undo must not be replaced by the saving snapshot",
  );
  assert.equal(drafts.dirty, true);
  release();
  await saving;
  assert.equal(drafts.dirty, true);
  await drafts.flush();
  assert.equal(drafts.dirty, false);
  assert.equal(
    manuscriptText(buildChapters(await project.listDocuments())[0].content),
    "",
  );
});

test("conflicting external prose pauses saving and retains the local draft", async () => {
  const { project, chapter } = await draftFixture();
  const drafts = createManuscriptDrafts(
    async (build) => {
      try {
        return (await commitDocumentWrites(project, build)).documents;
      } catch {
        return null;
      }
    },
    () => "/memory/drafts",
    () => {},
  );
  drafts.sync([chapter]);
  drafts.update(chapter, "本地草稿");
  await commitDocumentWrites(project, (_docs, structure) =>
    manuscriptWrites(structure, chapter, "外部更新"),
  );
  assert.equal(await drafts.flush(), false);
  drafts.sync(buildChapters(await project.listDocuments()));
  assert.equal(drafts.textFor(chapter), "本地草稿");
  assert.equal(drafts.error, true);
  assert.equal(
    drafts.pending,
    false,
    "a conflict must not keep retrying automatically",
  );
  assert.equal(
    manuscriptText(buildChapters(await project.listDocuments())[0].content),
    "外部更新",
  );
});
