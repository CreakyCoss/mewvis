import { spawn } from "node:child_process";
import { arch as hostArch, platform } from "node:os";

const TARGETS = {
  "darwin-arm64": {
    nodeTarget: "darwin-arm64",
    rustTarget: "aarch64-apple-darwin",
  },
  "darwin-x64": {
    nodeTarget: "darwin-x64",
    rustTarget: "x86_64-apple-darwin",
  },
};

const TARGET_ALIASES = {
  arm64: "darwin-arm64",
  aarch64: "darwin-arm64",
  x64: "darwin-x64",
  x86_64: "darwin-x64",
};

const args = process.argv.slice(2);
const targetOptionIndex = args.indexOf("--target");
const requestedTarget =
  targetOptionIndex !== -1
    ? args[targetOptionIndex + 1]
    : (args[0] ?? (hostArch() === "arm64" ? "darwin-arm64" : "darwin-x64"));
const targetName = TARGET_ALIASES[requestedTarget] ?? requestedTarget;
const target = TARGETS[targetName];

if (platform() !== "darwin") {
  console.error("macOS packaging must run on a macOS host.");
  process.exit(1);
}

if (!target) {
  console.error(`Unsupported macOS target: ${requestedTarget}. Use one of: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_RUNTIME_TARGET: target.nodeTarget,
};

await run("pnpm", ["sync-product-config"]);
await run("pnpm", ["build:agent-runtime"]);
await run("tauri", ["build", "--target", target.rustTarget]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
      }
    });
  });
}
