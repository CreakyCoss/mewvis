import { dirname, join } from "node:path";
import {
  type RuntimeConfig,
  runtimeEnvironment,
} from "../../config/runtime.js";
import { command } from "../../infrastructure/process/command.js";
import { Serial } from "../../shared/serial.js";
import { invalid, onlyKeys, type JsonObject } from "../../shared/validation.js";
export class Sandbox {
  private serial = new Serial();
  constructor(private config: RuntimeConfig) {}
  private run(action: string, input: JsonObject) {
    onlyKeys(input, []);
    return this.serial.run(async () => {
      const cwd = dirname(this.config.cliPath);
      const result = await command(
        this.config.nodeBinary,
        [join(cwd, "sandbox-control.js"), action],
        { cwd, env: runtimeEnvironment(this.config), timeout: 180000 },
      );
      return JSON.parse(result.stdout);
    });
  }
  commands() {
    return {
      get_agent_runtime_sandbox_status: (i: JsonObject) =>
        this.run("status", i),
      initialize_agent_runtime_sandbox: (i: JsonObject) =>
        this.run("install", i),
      set_agent_runtime_sandbox_enabled: (i: JsonObject) => {
        onlyKeys(i, ["enabled"]);
        if (typeof i.enabled !== "boolean") invalid("enabled 必须是布尔值");
        return this.run(i.enabled ? "enable" : "disable", {});
      },
    };
  }
}
