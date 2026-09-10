import { canonicalPath } from "../../../../../../safety/paths.js";
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { z } from "zod";
import {
  createBashTool,
  createLocalBashOperations,
  getAgentDir,
  type BashOperations,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

// Adapted from Pi's examples/extensions/sandbox. Only bash is isolated here.
const configSchema = z
  .object({
    enabled: z.boolean().optional(),
    network: z
      .object({
        allowedDomains: z.array(z.string()).optional(),
        deniedDomains: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    filesystem: z
      .object({
        denyRead: z.array(z.string()).optional(),
        allowWrite: z.array(z.string()).optional(),
        denyWrite: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type PiSandboxConfig = SandboxRuntimeConfig & { enabled: boolean };

export const loadPiSandboxConfig = (cwd: string, agentDir = getAgentDir(), hostPolicy = false): PiSandboxConfig => {
  const readConfig = (path: string) => {
    try {
      return configSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new Error(`Invalid sandbox configuration: ${path}`, { cause: error });
    }
  };
  const global = hostPolicy ? {} : readConfig(join(agentDir, "extensions", "sandbox.json"));
  const project = hostPolicy ? {} : readConfig(join(cwd, ".pi", "sandbox.json"));
  const absolutePath = (path: string) =>
    canonicalPath(
      path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : resolve(cwd, path),
    );
  const filesystem = {
    denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
    allowWrite: [cwd, tmpdir()],
    denyWrite: [join(cwd, ".env"), join(cwd, ".pi"), join(cwd, ".git"), join(cwd, ".isle")],
    ...global.filesystem,
    ...project.filesystem,
  };
  return {
    enabled: project.enabled ?? global.enabled ?? true,
    network: {
      allowedDomains: hostPolicy
        ? []
        : [
            "github.com",
            "*.github.com",
            "raw.githubusercontent.com",
            "registry.npmjs.org",
            "pypi.org",
            "files.pythonhosted.org",
          ],
      deniedDomains: [],
      ...global.network,
      ...project.network,
    },
    filesystem: {
      denyRead: filesystem.denyRead.map(absolutePath),
      allowWrite: filesystem.allowWrite.map(absolutePath),
      denyWrite: filesystem.denyWrite.map(absolutePath),
    },
  };
};

// SRT has process-global configuration/proxies. Keep an execution and its cleanup
// in one critical section so concurrent sessions cannot change each other's policy.
let sandboxQueue: Promise<void> = Promise.resolve();
const acquireSandbox = async (signal?: AbortSignal) => {
  signal?.throwIfAborted();
  const previous = sandboxQueue;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  sandboxQueue = previous.then(() => gate);
  let onAbort: (() => void) | undefined;
  try {
    await Promise.race([
      previous,
      new Promise<never>((_, reject) => {
        if (!signal) return;
        onAbort = () => reject(signal.reason ?? new Error("aborted"));
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      }),
    ]);
    signal?.throwIfAborted();
    return release;
  } catch (error) {
    void previous.then(release);
    throw error;
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
};

export const createPiSandboxOperations = (config: PiSandboxConfig): BashOperations => {
  const local = createLocalBashOperations();
  return {
    async exec(command, cwd, options) {
      options.signal?.throwIfAborted();
      if (!config.enabled) return local.exec(command, cwd, options);
      if (process.platform !== "darwin" && process.platform !== "linux") {
        throw new Error(`Bash sandbox is unavailable on ${process.platform}. This version supports macOS and Linux.`);
      }
      const release = await acquireSandbox(options.signal);
      try {
        const { SandboxManager } = await import("@anthropic-ai/sandbox-runtime");
        try {
          if (!SandboxManager.checkDependencies()) {
            throw new Error("Sandbox dependencies missing: install ripgrep; Linux also requires bubblewrap and socat.");
          }
          await SandboxManager.initialize(config, undefined, false);
          const wrapped = await SandboxManager.wrapWithSandbox(command, undefined, undefined, options.signal);
          options.signal?.throwIfAborted();
          return await local.exec(wrapped, cwd, options);
        } finally {
          await SandboxManager.reset();
        }
      } finally {
        release();
      }
    },
  };
};

export const registerPiSandbox = (pi: Pick<ExtensionAPI, "registerTool">, cwd: string, config: PiSandboxConfig) => {
  const operations = createPiSandboxOperations(config);
  const bash = createBashTool(cwd, { operations });
  pi.registerTool({
    ...bash,
    label: config.enabled ? "bash (sandboxed)" : "bash",
    parameters: Type.Object({
      ...bash.parameters.properties,
      sandbox: Type.Optional(
        Type.Boolean({
          description:
            "Defaults to true. Set false only when this exact command needs access beyond the sandbox; host approval is required.",
        }),
      ),
    }),
    execute: (id, params, signal, onUpdate) => {
      const tool = params.sandbox === false ? createBashTool(cwd) : bash;
      return tool.execute(id, params, signal, onUpdate);
    },
  });
};

export const registerPiSandboxEvents = (pi: ExtensionAPI, config: PiSandboxConfig) => {
  pi.on("user_bash", () => {
    if (config.enabled) throw new Error("受限会话请通过 bash 工具执行命令，以进行权限检查。");
    return { operations: createPiSandboxOperations(config) };
  });
};
