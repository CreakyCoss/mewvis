import type { ChildProcess, StdioOptions } from "node:child_process";
import type { Readable, Writable } from "node:stream";

/** Backend settings and resolved snapshots contain data only; they cross worker RPC. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type FilesystemScope = { allowWrite: string[]; denyRead: string[]; denyWrite: string[] };
export type NetworkScope = { allow: string[] | "all"; deny: string[] };
export type ExecutionBackendConfig = {
  name: string;
  version: string;
  options: JsonObject;
  platforms: Record<string, JsonObject>;
};
export type ExecutionConfig = {
  enabled: boolean;
  backend: ExecutionBackendConfig;
  baseline: { denyRead: string[]; denyWrite: string[]; deniedDomains: string[] };
  profiles: { mode: string; filesystem: FilesystemScope; network: NetworkScope }[];
  environment: string[];
};
export type ResolvedExecutionBackend = { name: string; version: string; options: JsonObject };
export type SandboxPolicy = {
  workspacePath: string;
  filesystem: FilesystemScope;
  network: NetworkScope;
  backend: ResolvedExecutionBackend;
};
export type ExecutionPolicy = { workspacePath: string; environment: string[]; sandbox: SandboxPolicy | null };
export type ExecutionLaunch = Readonly<{ policy: ExecutionPolicy; program: ExecutionProgram }>;
export type SandboxInstance = SandboxLifecycle & {
  wrapProgram(
    program: ExecutionProgram,
    channelArgs: readonly string[],
  ): Promise<{ argv: string[]; env: NodeJS.ProcessEnv }>;
};
export type SandboxBackend = {
  createSandbox(policy: SandboxPolicy): Promise<SandboxInstance>;
  getReadiness(backend: ResolvedExecutionBackend): Promise<SandboxReadiness>;
  install(backend: ResolvedExecutionBackend): Promise<SandboxReadiness>;
};

/** Selected by the trusted runtime adapter, not by model tool arguments. */
export type ExecutionProgram = Readonly<{ executable: string; args: readonly string[] }>;

export type WorkerRequest = { id: number; method: string; input: unknown };
export type WorkerContext = { signal: AbortSignal; progress(value: unknown): void };
export type WorkerConnection = { input: Readable; output: Writable };
export type TransportCallbacks = { receive(chunk: string | Buffer): void; fail(error: Error): void };
export type ExecutionTransport = {
  args: string[];
  stdio: StdioOptions;
  attach(child: ChildProcess): void;
  send(line: string): void;
  close(): void;
};
export type SandboxLifecycle = { initialize(): Promise<void>; reset(): Promise<void> };
export type SandboxReadiness = {
  state: "ready" | "setup-required" | "unavailable" | "disabled";
  canInstall: boolean;
  message: string;
};
export type SandboxStatus = SandboxReadiness & { platform: string; backend: string; version: string };
