#!/usr/bin/env node
import { createPlugin, packPlugin, validatePlugin } from "./plugin-tooling.mjs";

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
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`参数 --${key} 缺少值。`);
    options.set(key, next);
    index += 1;
  }
  return { positionals, options };
};

const usage = `Isle plugin tooling\n\nUsage:\n  pnpm plugin:create -- <directory> [--name @scope/name]\n  pnpm plugin:validate -- [directory]\n  pnpm plugin:pack -- [directory] --target isle|dsh [--out-dir directory]\n`;

const main = async () => {
  const [command, ...values] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    console.log(usage);
    return;
  }
  const { positionals, options } = parseArguments(values);
  if (command === "create") {
    const destination = positionals[0];
    if (!destination) throw new Error("plugin:create 需要目标目录。");
    const result = await createPlugin({ destination, name: options.get("name") });
    console.log(`插件模板已创建：${result.name} -> ${result.root}`);
    return;
  }
  if (command === "validate") {
    const result = await validatePlugin(positionals[0] ?? process.cwd());
    console.log(`插件校验通过：${result.manifest.name}`);
    return;
  }
  if (command === "pack") {
    await packPlugin({
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
