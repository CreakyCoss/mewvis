import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { build } from "esbuild";

const desktopRoot = process.cwd();
const contractPath = join(desktopRoot, "src/agent-client/contracts/tauri.ts");
const bundle = await build({
  entryPoints: [contractPath],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const contract = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

const sorted = (values) => [...new Set(values)].sort();
const commandNames = sorted(contract.agentRuntimeTauriCommandNames);
const eventNames = sorted(contract.agentRuntimeTauriEventNames);
const wireEventSchema = JSON.parse(
  readFileSync(join(desktopRoot, "../agent-runtime/protocol/v1/schema/event.schema.json"), "utf8"),
);
const wireEventTypes = sorted(
  Object.values(wireEventSchema.definitions)
    .map((definition) => definition?.properties?.type?.const)
    .filter((value) => typeof value === "string"),
);

const wireFacadeSource = readFileSync(join(desktopRoot, "src/agent-client/wire.ts"), "utf8");
assert.ok(wireFacadeSource.includes("../agent-runtime/protocol/v1/sdk/typescript"), "wire.ts 必须是 Protocol SDK 入口");

for (const name of ["index.ts", "tauri.ts"]) {
  const source = readFileSync(join(desktopRoot, "src/agent-client/contracts", name), "utf8");
  assert.ok(
    !source.includes("../agent-runtime/protocol/v1/sdk/typescript"),
    `${name} 必须通过 wire.ts 使用 Protocol SDK`,
  );
  assert.ok(!source.includes("@agent-runtime/engines/protocol"), `${name} 不能依赖 runtime 内部协议类型`);
  assert.doesNotMatch(source, /\b(?:Pick|Omit)</, `${name} 不能用 Pick/Omit 伪装成 wire SDK 契约`);
  assert.doesNotMatch(source, /export type\s+(\w+)\s*=\s*\1\s*;/, `${name} 不能保留无意义的同名 SDK type alias`);
}

const serverRoot = join(desktopRoot, "../server");
const { commandNames: nodeCommandNames } = await import(
  new URL("../../../server/dist/modules/agent/host.js", import.meta.url)
);
const sandboxCommands = [
  "get_agent_runtime_sandbox_status",
  "initialize_agent_runtime_sandbox",
  "set_agent_runtime_sandbox_enabled",
];
assert.deepEqual(commandNames, sorted([...nodeCommandNames, ...sandboxCommands]), "前端命令契约必须与 Node 注册表一致");
const nodeEventNames = sorted(
  ["modules/agent/host.ts", "modules/agent/runtime/supervisor.ts"].flatMap((path) =>
    [...readFileSync(join(serverRoot, "src", path), "utf8").matchAll(/\.publish\("(agent_runtime_[^"]+)"/g)].map(
      (match) => match[1],
    ),
  ),
);
assert.deepEqual(eventNames, nodeEventNames, "前端事件契约必须与 Node 事件名一致");

const sourceRoot = join(desktopRoot, "src");
const allowedRawContractFiles = new Set(["agent-client/contracts/tauri.ts", "api/agent-runtime.ts"]);
const sourceFiles = [];
const collectSourceFiles = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      collectSourceFiles(path);
    } else if (/\.(?:ts|tsx)$/.test(name)) {
      sourceFiles.push(path);
    }
  }
};
collectSourceFiles(sourceRoot);

const frontendSdkImports = sourceFiles.filter((path) =>
  readFileSync(path, "utf8").includes("../agent-runtime/protocol/v1/sdk/typescript"),
);
assert.deepEqual(
  frontendSdkImports.map((path) => relative(sourceRoot, path)),
  ["agent-client/wire.ts"],
  "frontend agent code 只能由 wire.ts 导入 Protocol SDK",
);

const runtimeSourceRoot = join(desktopRoot, "../agent-runtime/src");
const runtimeSourceFiles = [];
const collectRuntimeSourceFiles = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      collectRuntimeSourceFiles(path);
    } else if (/\.ts$/.test(name)) {
      runtimeSourceFiles.push(path);
    }
  }
};
collectRuntimeSourceFiles(runtimeSourceRoot);
const runtimeSdkImports = runtimeSourceFiles.filter((path) =>
  readFileSync(path, "utf8").includes("protocol/v1/sdk/typescript"),
);
assert.deepEqual(
  runtimeSdkImports.map((path) => relative(runtimeSourceRoot, path)),
  ["engines/protocol/wire.ts"],
  "agent-runtime code 只能由 protocol/wire.ts 导入 Protocol SDK",
);
const internalProtocolEntrySource = readFileSync(join(runtimeSourceRoot, "engines/protocol/index.ts"), "utf8");
assert.ok(!internalProtocolEntrySource.includes('from "./wire.js"'), "内部 protocol 入口不能再次转发 wire SDK 类型");
assert.doesNotMatch(internalProtocolEntrySource, /export\s+\*/, "内部 protocol 入口必须显式声明公共导出");

const forbiddenRawUsages = [];
const rawWireDiscriminatorUsages = [];
for (const path of sourceFiles) {
  const sourcePath = relative(sourceRoot, path);
  if (allowedRawContractFiles.has(sourcePath)) continue;
  const source = readFileSync(path, "utf8");
  for (const name of [...commandNames, ...eventNames]) {
    if (source.includes(`"${name}"`) || source.includes(`'${name}'`)) {
      forbiddenRawUsages.push(`${sourcePath}: ${name}`);
    }
  }
  for (const name of wireEventTypes) {
    const quotedName = `["']${name}["']`;
    const rawDiscriminator = new RegExp(`(?:\\.type\\s*(?:===|!==)\\s*|\\bcase\\s+)${quotedName}`);
    if (rawDiscriminator.test(source)) {
      rawWireDiscriminatorUsages.push(`${sourcePath}: ${name}`);
    }
  }
}
assert.deepEqual(
  forbiddenRawUsages,
  [],
  `业务代码不能绕过 typed agent-runtime API：\n${forbiddenRawUsages.join("\n")}`,
);
assert.deepEqual(
  rawWireDiscriminatorUsages,
  [],
  `业务代码不能手写 wire event discriminator：\n${rawWireDiscriminatorUsages.join("\n")}`,
);

console.log("agent runtime frontend contract e2e passed");
