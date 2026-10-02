import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Chats } from "../../dist/modules/chats/service.js";
import { WorkspaceFiles } from "../../dist/modules/files/service.js";

async function setup(t) {
  const workspacePath = await mkdtemp(join(tmpdir(), "mewvis-chat-save-"));
  t.after(() => rm(workspacePath, { recursive: true, force: true }));
  const chats = new Chats(".mewvis", new WorkspaceFiles({ publish() {} }));
  const input = {
    workspacePath,
    chatId: "new-chat",
    workspaceId: "workspace",
    origin: { kind: "builtin", sceneId: "chat" },
    messages: [{ role: "user", text: "Test workflow" }],
  };
  const directory = join(workspacePath, ".mewvis/chats/new-chat");
  return { chats, input, directory };
}

test("first save tolerates an existing plugin/runtime directory and preserves its data", async (t) => {
  const { chats, input, directory } = await setup(t);
  const activity = join(directory, "session/extensions/activity");
  await mkdir(activity, { recursive: true });
  await writeFile(join(activity, "test.flow.json"), "{}");
  assert.equal(await chats.load(input), null);
  const saved = await chats.save(input);
  assert.deepEqual((await chats.load(input)).messages, input.messages);
  assert.equal((await chats.list(input))[0].id, saved.id);
  assert.equal(await readFile(join(activity, "test.flow.json"), "utf8"), "{}");
});

test("missing metadata never overwrites existing messages or options", async (t) => {
  for (const file of ["messages.json", "options.json"]) {
    const { chats, input, directory } = await setup(t);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, file), '{"keep":true}');
    await assert.rejects(chats.save(input), { code: "CHAT_CORRUPT" });
    assert.equal(await readFile(join(directory, file), "utf8"), '{"keep":true}');
  }
});
