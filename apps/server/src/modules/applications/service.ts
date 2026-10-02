import * as fs from "node:fs/promises";
import { join, dirname } from "node:path";
import { Packages, descriptor, readPackage } from "./packages.js";
import { ApplicationData } from "./data.js";
import { ApplicationHost } from "./host.js";

import { Serial } from "../../shared/serial.js";
import { jsonWrite } from "../../infrastructure/filesystem/json.js";
import { invalid, nonempty, type JsonObject } from "../../shared/validation.js";
import { exists } from "../../infrastructure/filesystem/paths.js";
import { fetchJson } from "../../infrastructure/network/http.js";
import { command } from "../../infrastructure/process/command.js";

import type { AgentRuntimeSupervisor } from "../agent/runtime/supervisor.js";
import type { RuntimeConfig } from "../../config/runtime.js";
export const applicationsBare = [
  "list_applications",
  "get_application_tool_policy",
  "set_application_tool_policy",
  "list_application_ui",
  "connect_application_data",
  "request_application_data",
  "disconnect_application_data",
];
export class Applications {
  readonly packages: Packages;
  readonly data: ApplicationData;
  readonly host: ApplicationHost;
  private serial = new Serial();
  constructor(
    private config: RuntimeConfig,
    private supervisor: AgentRuntimeSupervisor,
  ) {
    this.packages = new Packages(
      join(config.dataDir, "apps"),
      config.bundledApplicationsPath,
    );
    this.data = new ApplicationData(this.packages, supervisor.events);
    this.host = new ApplicationHost(
      config,
      this.packages,
      this.data,
      supervisor.events,
    );
  }
  async initialize() {
    const migration = join(
      dirname(this.config.cliPath),
      "app-host",
      "migrate-layout.mjs",
    );
    if (!(await exists(migration))) {
      // A minimal runtime fixture is sufficient for Agent-only hosting, but never ignore historical app data.
      if (
        (await exists(join(this.packages.path, "data"))) ||
        (await exists(join(this.packages.path, "packages"))) ||
        (await exists(join(this.packages.path, ".layout-migration.json")))
      )
        throw new Error("缺少应用目录升级入口，请重新构建 Agent runtime");
      return;
    }
    const ids = (await this.packages.list()).map((p) => p.id);
    await command(
      this.config.nodeBinary,
      [migration, this.packages.path, ...ids],
      { env: this.config.env, timeout: 120000 },
    );
  }
  async close() {
    this.data.close();
    await this.host.close();
  }
  async session(id: unknown) {
    const p = await this.packages.authorize(id, "chat");
    return {
      access: p.agentAccess ?? {},
      resources: {
        items: [
          {
            kind: p.runtimeKind,
            id: p.id,
            entry: p.entry,
            packageRoot: p.path,
            ...(p.patchPath ? { patchPath: p.patchPath } : {}),
            config: null,
          },
        ],
        settingsPath: null,
      },
    };
  }
  private async revoke(id: string) {
    this.data.revoke(id);
    this.supervisor.abortApplication(id);
    this.supervisor.events.publish("application-chat:revoke", {
      applicationId: id,
    });
    await this.host.stop();
  }
  async search(i: JsonObject) {
    if (i.provider !== "dsh-community") invalid("不支持的应用市场");
    const url = new URL(
      this.config.env.MEWVIS_DSH_MARKETPLACE_URL ??
        "https://dshmarketplace.dev/api/v1/plugins",
    );
    url.search = new URLSearchParams({
      q: String(i.query ?? "").trim(),
      page: String(Math.max(1, Number(i.page ?? 1))),
      limit: String(Math.min(30, Math.max(1, Number(i.limit ?? 20)))),
    }).toString();
    const result = await fetchJson(url.href);
    if (!Array.isArray(result.results)) invalid("应用市场响应格式无效");
    return result;
  }
  private async marketplace(i: JsonObject) {
    if (i.provider !== "dsh-community") invalid("不支持的应用市场");
    const pkg = nonempty(i.npmPackage, "npmPackage"),
      fullName = nonempty(i.fullName, "fullName");
    if (
      !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(pkg) ||
      !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(fullName)
    )
      invalid("应用市场包名称无效");
    await fs.mkdir(this.packages.path, { recursive: true });
    const temp = await fs.mkdtemp(join(this.packages.path, ".marketplace-"));
    try {
      await jsonWrite(join(temp, "package.json"), {
        name: "mewvis-server-application-install",
        private: true,
        type: "module",
      });
      await fs.writeFile(
        join(temp, ".npmrc"),
        "registry=https://registry.npmjs.org/\nignore-scripts=true\nnode-linker=hoisted\npackage-import-method=copy\n",
      );
      const bundledCli = join(
        dirname(this.config.cliPath),
        "application-installer/pnpm/bin/pnpm.cjs",
      );
      const cli = (await exists(bundledCli))
        ? bundledCli
        : this.config.env.npm_execpath;
      const args = [
        "add",
        pkg,
        "--save-exact",
        "--ignore-scripts",
        "--registry=https://registry.npmjs.org/",
        "--config.node-linker=hoisted",
        "--config.package-import-method=copy",
        "--reporter=append-only",
        "--store-dir",
        join(this.packages.path, "pnpm-store"),
      ];
      await command(
        cli ? this.config.nodeBinary : "pnpm",
        cli ? [cli, ...args] : args,
        {
          cwd: temp,
          env: {
            ...this.config.env,
            NPM_CONFIG_USERCONFIG: join(temp, ".npmrc"),
            NO_COLOR: "1",
          },
          timeout: 180000,
        },
      );
      const source = join(temp, "node_modules", pkg);
      const staging = join(temp, "application");
      await fs.cp(source, staging, { recursive: true, dereference: false });
      await fs.rename(
        join(temp, "node_modules"),
        join(staging, "node_modules"),
      );
      await jsonWrite(join(staging, ".mewvis-origin.json"), {
        kind: "marketplace",
        marketplace: "dsh-community",
        fullName,
        package: pkg,
        repoUrl: i.repoUrl ?? "",
      });
      return await this.packages.install(staging, false, true);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
  commands() {
    return {
      list_applications: async () =>
        (await this.packages.list()).map(descriptor),
      inspect_application: async (i: JsonObject) =>
        descriptor(await readPackage(nonempty(i.sourcePath, "sourcePath"))),
      install_application: (i: JsonObject) =>
        this.serial.run(async () => {
          if (i.enable != null && typeof i.enable !== "boolean")
            invalid("enable 必须是布尔值");
          const p = await this.packages.install(
            nonempty(i.sourcePath, "sourcePath"),
            i.enable as boolean | undefined,
          );
          await this.host.stop();
          return descriptor(p);
        }),
      search_application_marketplace: (i: JsonObject) => this.search(i),
      install_application_from_marketplace: (i: JsonObject) =>
        this.serial.run(async () => {
          const p = await this.marketplace(i);
          await this.host.stop();
          return descriptor(p);
        }),
      set_application_enabled: (i: JsonObject) =>
        this.serial.run(async () => {
          const p = await this.packages.enable(i.id, i.enabled as boolean);
          if (!p.enabled) await this.revoke(p.id);
          else await this.host.stop();
          return descriptor(p);
        }),
      remove_application: (i: JsonObject) =>
        this.serial.run(async () => {
          const p = await this.packages.get(i.id);
          if (p.source !== "installed") invalid("内置应用不能移除");
          await this.revoke(p.id);
          return this.packages.remove(i.id);
        }),
      list_application_ui: () => this.host.invoke("catalog"),
      execute_application_ui_tool: (i: JsonObject) =>
        this.host.invoke("execute", i),
      get_application_ui_document: (i: JsonObject) =>
        this.host.invoke("uiDocument", i),
      get_application_tool_policy: (i: JsonObject) =>
        this.host.invoke("toolPolicy.get", i),
      set_application_tool_policy: (i: JsonObject) =>
        this.host.invoke("toolPolicy.set", i),
      connect_application_data: (i: JsonObject) =>
        this.data.connect(i.applicationId),
      request_application_data: (i: JsonObject) =>
        this.data.request(i.connection, i.request),
      disconnect_application_data: (i: JsonObject) => {
        this.data.disconnect(i.connection);
        return null;
      },
      post_application_chat: (i: JsonObject) => this.host.post(i),
      answer_application_workspace_interaction: (i: JsonObject) =>
        this.data.answer(i),
    };
  }
}
