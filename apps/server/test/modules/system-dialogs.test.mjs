import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SystemDialogs } from "../../dist/modules/system-dialogs/service.js";
import { createNativePicker } from "../../dist/infrastructure/dialogs/native-picker.js";
import { ServiceError } from "../../dist/shared/validation.js";
import { command } from "../../dist/infrastructure/process/command.js";
import { startServer } from "../../dist/server.js";
const signal = () => new AbortController().signal;
const ok = (stdout) => ({ stdout, stderr: "", code: 0 });

test("native adapters use fixed scripts and data-only options; cancellation and missing GUI are explicit", async () => {
  const options = {
    title: '中文 " ; $() `',
    directory: true,
    defaultPath: '/tmp/目录 "',
  };
  for (const platform of ["darwin", "win32"]) {
    const calls = [];
    const pick = createNativePicker(platform, {}, async (...args) => {
      calls.push(args);
      return ok('["/tmp/中文\\n目录"]');
    });
    assert.deepEqual(await pick(options, signal()), ["/tmp/中文\n目录"]);
    assert.equal(JSON.stringify(calls[0][1]).includes(options.title), false);
    assert.deepEqual(JSON.parse(calls[0][2].env.MEWVIS_DIALOG_OPTIONS), options);
    assert.equal(calls[0][2].timeout, 300000);
    assert.equal(
      await createNativePicker(platform, {}, async () => ok("null"))(
        options,
        signal(),
      ),
      null,
    );
  }
  await assert.rejects(
    createNativePicker("win32", {}, async () => {
      throw new Error("must not run");
    })({ directory: true, multiple: true }, signal()),
    { code: "DIALOG_OPTION_UNSUPPORTED" },
  );
  await assert.rejects(
    createNativePicker("linux", {}, async () => {
      throw new Error("must not run");
    })({}, signal()),
    { code: "DIALOG_UNAVAILABLE" },
  );
  const linuxCalls = [];
  const linux = createNativePicker(
    "linux",
    { DISPLAY: ":0" },
    async (...args) => {
      linuxCalls.push(args);
      return ok("/tmp/a\x1f/tmp/b\n");
    },
  );
  assert.deepEqual(
    await linux(
      { multiple: true, filters: [{ name: "ZIP", extensions: ["zip"] }] },
      signal(),
    ),
    ["/tmp/a", "/tmp/b"],
  );
  assert.ok(linuxCalls[0][1].includes("--file-filter=ZIP | *.zip"));
  assert.equal(
    await createNativePicker("linux", { DISPLAY: ":0" }, async () => ({
      stdout: "",
      stderr: "",
      code: 1,
    }))({}, signal()),
    null,
  );
  const fallbackCalls = [];
  const fallback = createNativePicker(
    "linux",
    { DISPLAY: ":0" },
    async (file, args) => {
      fallbackCalls.push([file, args]);
      if (file === "zenity")
        throw new ServiceError(400, "COMMAND_UNAVAILABLE", "missing");
      return ok("/tmp/目录\n");
    },
  );
  assert.deepEqual(await fallback({ directory: true }, signal()), [
    "/tmp/目录",
  ]);
  assert.deepEqual(
    fallbackCalls.map(([file]) => file),
    ["zenity", "kdialog"],
  );
});

test("dialog service preserves selected paths, rejects invalid input and serializes native windows", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-dialog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "中文 file.zip");
  await writeFile(file, "test");
  const calls = [];
  const dialogs = new SystemDialogs(async (options) => {
    calls.push(options);
    return options.directory ? [root] : [file];
  });
  assert.equal(await dialogs.open({ directory: true }), root);
  assert.deepEqual(
    await dialogs.open({
      multiple: true,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    }),
    [file],
  );
  await dialogs.open({ defaultPath: file });
  assert.equal(calls.at(-1).defaultPath, root);
  await assert.rejects(dialogs.open({ directory: "true" }), {
    code: "INVALID_ARGUMENT",
  });
  await assert.rejects(dialogs.open({ defaultPath: "relative" }), {
    code: "INVALID_ARGUMENT",
  });
  await assert.rejects(
    dialogs.open({ filters: [{ name: "x|bad", extensions: ["zip"] }] }),
    { code: "INVALID_ARGUMENT" },
  );
  assert.equal(await new SystemDialogs(async () => null).open({}), null);
  await assert.rejects(new SystemDialogs(async () => [root]).open({}), {
    code: "DIALOG_INVALID_SELECTION",
  });
  let started = false;
  const pending = new SystemDialogs(
    (_options, abort) =>
      new Promise((resolve) => {
        started = true;
        abort.addEventListener("abort", () => resolve(null));
      }),
  );
  const first = pending.open({});
  const failure = assert.rejects(first, { code: "COMMAND_ABORTED" });
  assert.equal(started, true);
  await assert.rejects(pending.open({}), { code: "DIALOG_BUSY" });
  await pending.close();
  await failure;
  await assert.rejects(pending.open({}), { code: "SERVER_STOPPING" });
  let attempts = 0;
  const uncertain = new SystemDialogs(async () => {
    attempts++;
    throw new ServiceError(503, "COMMAND_EXIT_UNCONFIRMED", "not exited");
  });
  await assert.rejects(uncertain.open({}), {
    code: "COMMAND_EXIT_UNCONFIRMED",
  });
  await assert.rejects(uncertain.open({}), {
    code: "COMMAND_EXIT_UNCONFIRMED",
  });
  assert.equal(
    attempts,
    1,
    "never replace a chooser whose exit is unconfirmed",
  );
});

test("command abort waits for a real child process to exit", async () => {
  const abort = new AbortController();
  const pending = command(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { signal: abort.signal },
  );
  abort.abort();
  await assert.rejects(pending, { code: "COMMAND_ABORTED" });
});

test("authenticated HTTP picker returns real paths, cancels on disconnect and closes with the server", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-dialog-http-"));
  const token = "mewvis-dialog-test-private-token";
  let hold = false,
    active = 0,
    canceled = 0;
  const server = await startServer({
    token,
    port: 0,
    runtime: {
      dataDir: root,
      cliPath: fileURLToPath(
        new URL("../support/fixtures/runtime.mjs", import.meta.url),
      ),
    },
    nativePicker: async (_options, abort) => {
      if (!hold) return [root];
      active++;
      return new Promise((resolve) =>
        abort.addEventListener(
          "abort",
          () => {
            active--;
            canceled++;
            resolve(null);
          },
          { once: true },
        ),
      );
    },
  });
  t.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const invoke = (abort, auth = token) =>
    fetch(`${server.url}/api/commands/open_system_dialog`, {
      method: "POST",
      signal: abort?.signal,
      headers: { authorization: `Bearer ${auth}` },
      body: JSON.stringify({ input: { directory: true } }),
    });
  assert.equal((await invoke(undefined, "wrong")).status, 401);
  assert.equal(await (await invoke()).json(), root);
  hold = true;
  const controller = new AbortController();
  const response = invoke(controller).catch(() => null);
  for (let n = 0; !active && n < 100; n++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(active, 1);
  controller.abort();
  await response;
  for (let n = 0; !canceled && n < 100; n++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(canceled, 1);
  const closingRequest = invoke().catch(() => null);
  for (let n = 0; !active && n < 100; n++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(active, 1);
  await server.close();
  await closingRequest;
  assert.equal(active, 0);
  assert.equal(canceled, 2);
});
