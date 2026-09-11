import type { SandboxBackend, SandboxPolicy } from "../types.js";

/** Backend dispatch only; importing the execution API never initializes an SDK. */
export async function loadSandboxBackend(name: string): Promise<SandboxBackend> {
  switch (name) {
    case "srt":
      return import("./srt.js");
    default:
      throw new Error(`不支持的沙箱后端：${name}`);
  }
}

export async function createSandbox(policy: SandboxPolicy) {
  return (await loadSandboxBackend(policy.backend.name)).createSandbox(policy);
}
