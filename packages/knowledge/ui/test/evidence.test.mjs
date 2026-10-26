import test from "node:test";
import assert from "node:assert/strict";
import { evidenceRange, parseTextFile } from "../dist/helpers.js";

test("evidence offsets apply only to matching document, revision, Unicode range and source text", () => {
  const document = {
    id: "d",
    knowledgeBaseId: "b",
    revision: "r2",
    text: "猫🐈申请权限。",
  };
  const hit = {
    id: "h",
    knowledgeBaseId: "b",
    documentId: "d",
    documentRevision: "r2",
    text: "🐈申请",
    location: { characters: { start: 1, end: 4 } },
  };
  assert.deepEqual(evidenceRange(document, hit), { start: 1, end: 4 });
  for (const change of [
    { documentRevision: "r1" },
    { knowledgeBaseId: "other" },
    { documentId: "other" },
    { text: "different" },
    { location: { characters: { start: -1, end: 4 } } },
  ])
    assert.equal(evidenceRange(document, { ...hit, ...change }), undefined);
});

test("file identity depends on text, not filename; invalid encoding and unsupported formats fail", async () => {
  const signal = new AbortController().signal;
  const first = await parseTextFile(new File(["资料正文"], "one.md"), signal);
  const same = await parseTextFile(
    new File(["资料正文"], "renamed.txt"),
    signal,
  );
  const changed = await parseTextFile(
    new File(["新的资料正文"], "one.md"),
    signal,
  );
  assert.equal(first.externalId, same.externalId);
  assert.notEqual(first.externalId, changed.externalId);
  assert.equal(first.source.mediaType, "text/markdown");
  for (const file of [
    new File(["content"], "source.pdf"),
    new File([new Uint8Array([0xff])], "invalid.txt"),
    new File(["  "], "empty.txt"),
  ])
    await assert.rejects(parseTextFile(file, signal));
});
