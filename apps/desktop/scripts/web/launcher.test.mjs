import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { once } from "node:events";

for (const mode of ["dev", "preview"])
  test(
    `${mode} launcher serves UI/API and SIGTERM releases runtime children and storage`,
    { timeout: 20000 },
    async (t) => {
      const dataDir = await mkdtemp(join(tmpdir(), "isle-web-launcher-"));
      const reservation = createServer();
      reservation.listen(0, "127.0.0.1");
      await once(reservation, "listening");
      const webPort = reservation.address().port;
      await new Promise((resolve) => reservation.close(resolve));
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL("./serve.mjs", import.meta.url)), ...(mode === "preview" ? ["--preview"] : [])],
        {
          cwd: fileURLToPath(new URL("../../", import.meta.url)),
          env: {
            ...process.env,
            ISLE_WEB_PORT: String(webPort),
            ISLE_SERVER_PORT: "0",
            ISLE_SERVER_DATA_DIR: dataDir,
            ISLE_SERVER_RUNTIME_CLI: fileURLToPath(
              new URL("../../../server/test/support/fixtures/runtime.mjs", import.meta.url),
            ),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (s) => (output += s));
      child.stderr.on("data", (s) => (output += s));
      const exit = once(child, "exit");
      t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await exit;
        await rm(dataDir, { recursive: true, force: true });
      });
      let url;
      for (let n = 0; n < 600; n++) {
        url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
        if (url) break;
        if (child.exitCode !== null) assert.fail(output);
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.ok(url, output);
      assert.match(await (await fetch(url)).text(), /<div id="root">/);
      const command = async (name, args) => {
        const response = await fetch(`${url}/api/commands/${name}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args ?? {}),
        });
        assert.equal(response.status, 200, await response.clone().text());
        return response.json();
      };
      assert.equal((await command("get_config_database_status")).setupError, null);
      await command("run_agent_runtime_agent", {
        input: {
          taskId: "launcher-task",
          workspacePath: dataDir,
          sessionRootDir: "sessions/test",
          userMessage: "hold",
        },
      });
      let pid;
      for (let n = 0; n < 100; n++) {
        const status = await (await fetch(`${url}/api/status`)).json();
        pid = status.workers[0]?.pid;
        if (pid) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.ok(pid);
      const abort = new AbortController();
      const stream = await fetch(`${url}/api/events`, { signal: abort.signal });
      assert.equal(stream.status, 200);
      child.kill("SIGTERM");
      const [code, signal] = await exit;
      abort.abort();
      assert.equal(code, 0, `signal=${signal}\n${output}`);
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    },
  );
