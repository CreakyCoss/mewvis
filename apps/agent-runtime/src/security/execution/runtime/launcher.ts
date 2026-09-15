import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { getProcessPlatform, getChannelPlatform } from "../../platforms/index.js";
import type { ExecutionTransport } from "../types.js";
import type { ExecutionLaunch } from "../index.js";

// One execution program per launcher; stdout carries RPC, program output is diagnostic.
const platform = getProcessPlatform();
const reader = createInterface({ input: process.stdin });
let worker: ChildProcess | undefined;
let transport: ExecutionTransport | undefined;
let sandbox: Awaited<ReturnType<typeof import("./sandbox.js").createSandbox>> | undefined;
let starting = false;
let startup: Promise<void> | undefined;
let stopped = false;
const pending: string[] = [];
const send = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
const stop = async () => {
  if (stopped) return;
  stopped = true;
  // Finish platform initialization before clearing policy resources.
  await startup?.catch(() => undefined);
  transport?.close();
  if (worker) await platform.stopWorker(worker);
  await sandbox?.reset();
  process.exit(0);
};
const fail = (error: unknown) => {
  send({ fatal: error instanceof Error ? error.message : String(error) });
  void stop().catch((failure) => {
    console.error(failure);
    process.exit(1);
  });
};
process.on("SIGTERM", () => void stop().catch(fail));
process.on("SIGINT", () => void stop().catch(fail));
reader.on("close", () => void stop().catch(fail));

async function start({ policy, program }: ExecutionLaunch) {
  if (policy.sandbox) {
    sandbox = await (await import("./sandbox.js")).createSandbox(policy.sandbox);
    await sandbox.initialize();
  }
  if (stopped) return;
  transport = await getChannelPlatform().createTransport({
    receive: (chunk) => {
      process.stdout.write(chunk);
    },
    fail,
  });
  if (stopped) return;
  const descriptor = sandbox
    ? await sandbox.wrapProgram(program, transport.args)
    : { argv: [program.executable, ...program.args, ...transport.args], env: process.env };
  if (stopped) return;
  worker = spawn(descriptor.argv[0], descriptor.argv.slice(1), {
    cwd: policy.workspacePath,
    env: descriptor.env,
    shell: false,
    windowsHide: true,
    stdio: transport.stdio,
  });
  worker.stdout!.pipe(process.stderr);
  worker.stderr!.pipe(process.stderr);
  worker.once("error", fail);
  worker.once("close", (code) => {
    if (!stopped) fail(new Error(`执行进程退出（${code}）。`));
  });
  transport.attach(worker);
  for (const line of pending.splice(0)) transport.send(line);
}

reader.on("line", (line) => {
  if (!starting) {
    starting = true;
    try {
      startup = start(JSON.parse(line));
      void startup.catch(fail);
    } catch (error) {
      fail(error);
    }
  } else if (transport) transport.send(line);
  else pending.push(line);
});
