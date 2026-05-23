import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { platform } from "node:os";

const TARGETS = {
  x64: {
    nodeTarget: "win-x64",
    rustTarget: "x86_64-pc-windows-msvc",
  },
  arm64: {
    nodeTarget: "win-arm64",
    rustTarget: "aarch64-pc-windows-msvc",
  },
};

const arch = process.argv[2] ?? "x64";
const target = TARGETS[arch];

if (!target) {
  console.error(`Unsupported Windows target: ${arch}. Use one of: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}

const env = { ...process.env };
const isWindowsHost = platform() === "win32";

prependExistingPath(env, [
  "/opt/homebrew/opt/llvm/bin",
  "/usr/local/opt/llvm/bin",
]);

if (!isWindowsHost) {
  ensureCommand("cargo-xwin", [
    "Windows cross-compilation from macOS/Linux requires cargo-xwin.",
    "Install it with: cargo install --locked cargo-xwin",
  ]);
  ensureCommand("llvm-rc", [
    "Windows cross-compilation requires llvm-rc.",
    "On macOS, install LLVM with: brew install llvm",
  ]);
  ensureCommand("makensis", [
    "Windows installer bundling requires NSIS.",
    "On macOS, install it with: brew install nsis",
  ]);
}

await run("pnpm", ["build:agent-bridge"]);
await run("node", ["agent-bridge/scripts/copy-node-runtime.mjs", "--target", target.nodeTarget]);

const tauriArgs = ["build", "--target", target.rustTarget];
if (!isWindowsHost) {
  tauriArgs.splice(1, 0, "--runner", "cargo-xwin");
}

await run("tauri", tauriArgs);

function prependExistingPath(targetEnv, paths) {
  const existingPath = targetEnv.PATH ?? "";
  const parts = existingPath.split(delimiter).filter(Boolean);
  const additions = paths.filter((path) => existsSync(path) && !parts.includes(path));

  if (additions.length > 0) {
    targetEnv.PATH = [...additions, existingPath].filter(Boolean).join(delimiter);
  }
}

function ensureCommand(command, message) {
  const binaryName = isWindowsHost ? `${command}.exe` : command;
  const found = (env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .some((path) => existsSync(join(path, binaryName)));

  if (!found) {
    console.error(message.join("\n"));
    process.exit(1);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: isWindowsHost,
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
