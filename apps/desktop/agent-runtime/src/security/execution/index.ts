import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { z } from "zod";
import entries from "../../../build-entries.json" with { type: "json" };
import {
  canonicalPath,
  createResourcePathResolver,
  resourcePaths,
  resourceDomains,
  validateConfiguredPaths,
} from "../platforms/resources.js";
import { EXECUTION_CONFIG as configuredPolicy } from "./policy.js";
import { getProcessPlatform, getChannelPlatform, resolveExecutionBackend } from "../platforms/index.js";
import { RpcClient } from "./runtime/client.js";
import { serveRequests } from "./runtime/server.js";
import type {
  ExecutionProgram,
  WorkerContext,
  ExecutionConfig,
  ExecutionPolicy,
  ExecutionLaunch,
  SandboxStatus,
} from "./types.js";

export type * from "./types.js";

const jsonObject = z.record(z.string(), z.json());
const configSchema = z
  .object({
    enabled: z.boolean(),
    backend: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
        options: jsonObject,
        platforms: z.record(z.string(), jsonObject),
      })
      .strict(),
    baseline: z.object({ denyRead: resourcePaths, denyWrite: resourcePaths, deniedDomains: resourceDomains }).strict(),
    profiles: z
      .array(
        z
          .object({
            mode: z.string().min(1),
            filesystem: z
              .object({ allowWrite: resourcePaths, denyRead: resourcePaths, denyWrite: resourcePaths })
              .strict(),
            network: z.object({ allow: z.union([z.literal("all"), resourceDomains]), deny: resourceDomains }).strict(),
          })
          .strict(),
      )
      .min(1),
    environment: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_()]*$/)),
  })
  .strict();

/** Common data contract only. Platform parameters and backend constraints are validated by their implementations. */
export function validateExecutionConfig(input: unknown): ExecutionConfig {
  const config = configSchema.parse(input);
  if (new Set(config.profiles.map((profile) => profile.mode)).size !== config.profiles.length)
    throw new Error("沙箱档位不可重复。");
  validateConfiguredPaths([
    ...config.baseline.denyRead,
    ...config.baseline.denyWrite,
    ...config.profiles.flatMap((profile) => [
      ...profile.filesystem.allowWrite,
      ...profile.filesystem.denyRead,
      ...profile.filesystem.denyWrite,
    ]),
  ]);
  return config;
}
export const EXECUTION_CONFIG = validateExecutionConfig(configuredPolicy);

/** Resolve one serializable run snapshot without loading or starting an isolation backend. */
export function resolveExecutionPolicy(
  mode: string,
  workspacePath: string,
  config: ExecutionConfig = EXECUTION_CONFIG,
  runtimePath = dirname(fileURLToPath(import.meta.url)),
): ExecutionPolicy {
  const parsed = validateExecutionConfig(config);
  const execution = { workspacePath: canonicalPath(workspacePath), environment: parsed.environment };
  if (!parsed.enabled) return { ...execution, sandbox: null };
  const profile = parsed.profiles.find((profile) => profile.mode === mode);
  if (!profile) throw new Error(`未配置沙箱档位：${mode}`);
  const path = createResourcePathResolver(execution.workspacePath, runtimePath);
  const { backend, systemWritePaths } = resolveExecutionBackend(parsed.backend, path);
  return {
    ...execution,
    sandbox: {
      workspacePath: execution.workspacePath,
      filesystem: {
        allowWrite: [...systemWritePaths, ...profile.filesystem.allowWrite.map(path)],
        denyRead: [...parsed.baseline.denyRead, ...profile.filesystem.denyRead].map(path),
        denyWrite: [...parsed.baseline.denyWrite, ...profile.filesystem.denyWrite].map(path),
      },
      network: { allow: profile.network.allow, deny: [...parsed.baseline.deniedDomains, ...profile.network.deny] },
      backend,
    },
  };
}

type SandboxControlOptions = { config?: ExecutionConfig; workspacePath?: string; runtimePath?: string };

/** Resolve the same backend parameters for status/install as for actual execution. */
async function controlSandbox(action: "status" | "install", options: SandboxControlOptions): Promise<SandboxStatus> {
  const config = validateExecutionConfig(options.config ?? EXECUTION_CONFIG);
  const base = { platform: process.platform, backend: config.backend.name, version: config.backend.version };
  if (!config.enabled)
    return { ...base, state: "disabled", canInstall: false, message: "沙箱已关闭，工具在普通子进程中执行。" };
  try {
    const path = createResourcePathResolver(
      options.workspacePath ?? process.cwd(),
      options.runtimePath ?? dirname(fileURLToPath(import.meta.url)),
    );
    const { backend } = resolveExecutionBackend(config.backend, path);
    const implementation = await (await import("./runtime/sandbox.js")).loadSandboxBackend(backend.name);
    const readiness = await implementation.getReadiness(backend);
    return {
      ...base,
      ...(action === "install" && readiness.canInstall ? await implementation.install(backend) : readiness),
    };
  } catch (error) {
    return {
      ...base,
      state: "unavailable",
      canInstall: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
export function getSandboxStatus(options: SandboxControlOptions = {}) {
  return controlSandbox("status", options);
}
export function installSandbox(options: SandboxControlOptions = {}) {
  return controlSandbox("install", options);
}

/** Owns one execution program: launch, calls, cancellation, timeout and process cleanup. */
export class ProgramExecutor {
  private readonly platform = getProcessPlatform();
  readonly policy: ExecutionPolicy;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly client: RpcClient;
  private closed = false;
  private exited = false;
  private diagnostics = "";
  private closing: Promise<void> | undefined;

  constructor(launch: ExecutionLaunch) {
    this.policy = launch.policy;
    this.child = spawn(process.execPath, [fileURLToPath(new URL(entries.executionHost.output, import.meta.url))], {
      cwd: launch.policy.workspacePath,
      env: this.platform.executionEnvironment(launch.policy.environment),
      detached: this.platform.detached,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.on("data", (chunk) => {
      this.diagnostics = (this.diagnostics + chunk).slice(-8000);
    });
    this.client = new RpcClient({ input: this.child.stdout, output: this.child.stdin }, (error) =>
      this.fail(new Error(`${error.message}${this.diagnostics ? `\n${this.diagnostics}` : ""}`)),
    );
    this.child.on("error", (error) => this.fail(error));
    this.child.on("close", (code) => {
      this.exited = true;
      this.fail(new Error(`执行进程退出（${code}）。${this.diagnostics}`));
    });
    // The launcher chooses isolated or ordinary execution before starting the program.
    this.child.stdin.write(`${JSON.stringify(launch)}\n`);
  }

  get disposed() {
    return this.closed;
  }

  async call<T>(
    method: string,
    input: unknown,
    signal?: AbortSignal,
    progress?: (value: any) => void,
    timeoutMs = 0,
  ): Promise<T> {
    signal?.throwIfAborted();
    if (this.closed || this.closing) throw new Error("执行进程已关闭。");
    const abort = () => this.fail(new Error("工具执行已取消。"));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      if (timeoutMs > 0) timeout = setTimeout(() => this.fail(new Error("工具执行超时。")), timeoutMs);
      return await this.client.call<T>(method, input, progress);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    this.client.close(error);
    this.platform.stopLauncher(this.child);
    const timer = setTimeout(() => {
      void this.platform.forceStopLauncher(this.child).catch((error) => console.error(error));
    }, this.platform.shutdownTimeoutMs);
    timer.unref();
  }

  dispose(): Promise<void> {
    return (this.closing ??= this.shutdown());
  }

  private async shutdown() {
    if (!this.closed && this.client.pendingCount === 0) {
      try {
        await this.call("dispose", {}, undefined, undefined, 2_000);
      } catch {
        /* process cleanup continues below */
      }
    }
    if (!this.closed) this.fail(new Error("执行进程已释放。"));
    if (this.exited || !this.child.pid) return;
    await new Promise<void>((resolve) => this.child.once("close", () => resolve()));
  }
}

/** Connect a sandboxed program and own request cancellation and handler cleanup. */
export function serveWorker(handler: {
  execute(method: string, input: unknown, context: WorkerContext): Promise<unknown>;
  dispose(): Promise<void>;
}) {
  const connection = getChannelPlatform().connectWorker();
  const controllers = new Set<AbortController>();
  let closing: Promise<void> | undefined;
  const cleanup = () =>
    (closing ??= (async () => {
      for (const controller of controllers) controller.abort();
      await handler.dispose();
    })());
  const fatal = (error: unknown) => {
    console.error(error);
    process.exit(1);
  };
  const exit = () => void cleanup().then(() => process.exit(0), fatal);
  process.on("SIGTERM", exit);
  serveRequests(connection, {
    async execute(method, input, progress) {
      if (method === "dispose") {
        await cleanup();
        return null;
      }
      if (closing) throw new Error("执行资源已释放。");
      const controller = new AbortController();
      controllers.add(controller);
      try {
        return await handler.execute(method, input, { signal: controller.signal, progress });
      } finally {
        controllers.delete(controller);
      }
    },
    close: exit,
    fail: fatal,
  });
}
