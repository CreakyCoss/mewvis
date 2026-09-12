#!/usr/bin/env node
import { createApplication, packApplication, validateApplication } from "./tooling.mjs";

import { startDev } from "./dev.mjs";
import { checkApplication } from "./check.mjs";

const parseArguments = (values) => {
  const positionals = [];
  const options = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--") continue;
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const [key, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      options.set(key, inlineValue);
      continue;
    }
    if (key === "local") {
      options.set(key, true);
      continue;
    }
    const next = values[index + 1];
    if (!next || next.startsWith("--"))
      throw new Error(`参数 --${key} 缺少值。`);
    options.set(key, next);
    index += 1;
  }
  return { positionals, options };
};

const usage = `Isle application tooling\n\nUsage:\n  pnpm app:create -- <directory> [--name @scope/name] [--template react|tools] [--local]\n  pnpm app:validate -- [directory]\n  pnpm app:pack -- [directory] --target isle|dsh [--out-dir directory]\n  isle-app dev [directory] [--port 5173]\n  isle-app check [directory]\n  isle-app build [directory] [--target isle|dsh]\n`;

const main = async () => {
  const [command, ...values] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    console.log(usage);
    return;
  }
  const { positionals, options } = parseArguments(values);
  if (command === "create") {
    const destination = positionals[0];
    if (!destination) throw new Error("app:create 需要目标目录。");
    const result = await createApplication({
      destination,
      name: options.get("name"),
      template: options.get("template") ?? "react",
      local: options.has("local"),
    });
    console.log(`应用模板已创建：${result.name} -> ${result.root}`);
    return;
  }
  if (command === "validate") {
    const result = await validateApplication(positionals[0] ?? process.cwd());
    console.log(`应用校验通过：${result.manifest.name}`);
    return;
  }
  if (command === "dev") {
    await startDev(
      positionals[0] ?? process.cwd(),
      Number(options.get("port") ?? 5173),
    );
    return;
  }
  if (command === "check") {
    await checkApplication(positionals[0] ?? process.cwd());
    console.log("应用类型与运行边界检查通过");
    return;
  }
  if (command === "pack" || command === "build") {
    if (command === "build") await checkApplication(positionals[0] ?? process.cwd());
    await packApplication({
      source: positionals[0] ?? process.cwd(),
      target: options.get("target") ?? "isle",
      outDir: options.get("out-dir"),
    });
    return;
  }
  throw new Error(`未知命令：${command}\n\n${usage}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
