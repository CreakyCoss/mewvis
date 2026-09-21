#!/usr/bin/env node
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createExtensionPackageManager, readExtensionPackage } from "@isle/extension-host";
import { createExtensionPackage, buildExtensionPackage, packExtensionPackage } from "./index.mjs";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      id: { type: "string" },
      settings: { type: "string" },
      config: { type: "string" },
      out: { type: "string" },
    },
  });
  const [command, target] = positionals;
  let result;
  if (command === "create") {
    if (!target || !values.id) throw new Error("用法：isle-extension create <新目录> --id <插件ID>");
    result = await createExtensionPackage(target, values.id);
  } else if (command === "build") result = await buildExtensionPackage(target ?? ".", { outputDir: values.out });
  else if (command === "validate") result = readExtensionPackage(resolve(target ?? "."));
  else if (command === "pack") result = await packExtensionPackage(target ?? ".", { outputDir: values.out });
  else if (["add", "list", "enable", "disable", "configure", "remove"].includes(command)) {
    if (!values.settings) throw new Error("必须通过 --settings 指定宿主插件设置文件");
    const manager = createExtensionPackageManager(resolve(values.settings));
    if (command !== "list" && !target) throw new Error("缺少插件路径或 ID");
    const config = values.config ? JSON.parse(await readFile(resolve(values.config), "utf8")) : undefined;
    if (command === "add") result = await manager.add(resolve(target), config === undefined ? {} : { config });
    if (command === "list") result = manager.list();
    if (command === "enable" || command === "disable")
      result = await manager.configure(target, { enabled: command === "enable" });
    if (command === "configure") {
      if (config === undefined) throw new Error("configure 需要 --config <JSON文件>");
      result = await manager.configure(target, { config });
    }
    if (command === "remove") {
      await manager.remove(target);
      result = { removed: target };
    }
  } else throw new Error("命令：create / build / validate / pack / add / list / enable / disable / configure / remove");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
