import { resolve, dirname, join } from "node:path";
import { runtimeConfig } from "./config/runtime.js";
import { leaseDataDirectory } from "./storage/lease.js";
import { ConfigDatabase } from "./storage/config/database.js";
import { Databases } from "./modules/database-admin/service.js";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "Usage: pnpm init:config-db [--rebuild | --rebuild-on-error] [config-db-path]",
  );
} else {
  const flags = args.filter((arg) => arg.startsWith("-"));
  const paths = args.filter((arg) => !arg.startsWith("-"));
  if (
    flags.length > 1 ||
    flags.some((flag) => !["--rebuild", "--rebuild-on-error"].includes(flag)) ||
    paths.length > 1
  )
    throw new Error("只能指定一个操作参数和一个数据库路径");
  const config = runtimeConfig();
  const path = paths[0] ? resolve(paths[0]) : join(config.dataDir, "config.db");
  const release = leaseDataDirectory(dirname(path));
  let database: ConfigDatabase | undefined;
  try {
    database = new ConfigDatabase(dirname(path), true, path);
    const maintenance = new Databases(database);
    const shouldRebuild =
      flags.includes("--rebuild") ||
      (flags.includes("--rebuild-on-error") && database.setupError);
    const status = shouldRebuild
      ? maintenance.commands().rebuild_config_database()
      : maintenance.status();
    if (status.setupError) throw new Error(status.setupError);
    console.log(JSON.stringify(status, null, 2));
  } finally {
    database?.close();
    release();
  }
}
