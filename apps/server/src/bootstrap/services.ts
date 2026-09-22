import { SystemDialogs } from "../modules/system-dialogs/service.js";
import type { NativePicker } from "../infrastructure/dialogs/native-picker.js";
import { join } from "node:path";
import { root, safePath } from "../infrastructure/filesystem/paths.js";
import { sessionId } from "../shared/session-id.js";
import type { RuntimeConfig } from "../config/runtime.js";
import { leaseDataDirectory } from "../storage/lease.js";
import { ConfigDatabase } from "../storage/config/database.js";
import { AgentRuntimeSupervisor } from "../modules/agent/runtime/supervisor.js";
import { AgentRuntimeHost } from "../modules/agent/host.js";
import { Sandbox } from "../modules/agent/sandbox.js";
import { Applications } from "../modules/applications/service.js";
import { WorkspaceFiles } from "../modules/files/service.js";
import { Chats } from "../modules/chats/service.js";
import { Skills } from "../modules/skills/service.js";
import { VersionControl } from "../modules/version-control/service.js";
import { Databases } from "../modules/database-admin/service.js";
import { Knowledge } from "../modules/knowledge/service.js";
import { KnowledgeRepository } from "../modules/knowledge/repository.js";
import { WorkspaceService } from "../modules/workspaces/service.js";
import { WorkspaceRepository } from "../modules/workspaces/repository.js";
import { LlmSettingsService } from "../modules/settings/llm-service.js";
import { LlmRepository } from "../modules/settings/llm-repository.js";
import { AgentSettingsService } from "../modules/settings/agents-service.js";
import { AgentSettingsRepository } from "../modules/settings/agents-repository.js";
import { Extensions } from "../modules/extensions/service.js";

/** Own resources even while initialization is incomplete, so failures follow the same cleanup path. */
export class ServerServices {
  readonly supervisor: AgentRuntimeSupervisor;
  private readonly dialogs: SystemDialogs;
  private readonly files: WorkspaceFiles;
  private readonly applications: Applications;
  private database?: ConfigDatabase;
  private knowledge?: Knowledge;
  private releaseLease?: () => void;

  constructor(
    private readonly config: RuntimeConfig,
    nativePicker?: NativePicker,
  ) {
    this.dialogs = new SystemDialogs(nativePicker);
    this.supervisor = new AgentRuntimeSupervisor(config);
    this.files = new WorkspaceFiles(this.supervisor.events);
    this.applications = new Applications(config, this.supervisor);
  }

  async initialize() {
    const config = this.config;
    this.releaseLease = leaseDataDirectory(config.dataDir);
    await this.applications.initialize();
    this.database = new ConfigDatabase(config.dataDir, true);
    const database = this.database;
    this.knowledge = new Knowledge(
      new KnowledgeRepository(database),
      config.dataDir,
    );
    const agent = new AgentRuntimeHost(this.supervisor, (id) =>
      this.applications.session(id),
    );
    return {
      agent,
      settings: {
        llm: new LlmSettingsService(new LlmRepository(database)),
        agents: new AgentSettingsService(new AgentSettingsRepository(database)),
      },
      workspaces: new WorkspaceService(
        new WorkspaceRepository(database),
        join(config.dataDir, config.defaultWorkspaceDirName),
      ),
      dialogs: this.dialogs,
      extensions: new Extensions(config.dataDir, config.bundledExtensionsPath, {
        readSession: async (target) => {
          const workspacePath = await root(target.workspacePath);
          const sessionRootDir = await safePath(
            workspacePath,
            `${config.appDataDirName}/chats/${sessionId(target.chatId)}/session`,
          );
          return agent.invoke("read_agent_runtime_session", {
            input: { workspacePath, sessionRootDir },
          });
        },
        changed: () => this.supervisor.events.publish("extensions_changed", {}),
      }),
      files: this.files,
      chats: new Chats(config.appDataDirName, this.files),
      versionControl: new VersionControl(config.appDataDirName),
      skills: new Skills(database, config.dataDir, config.bundledSkillsPath),
      sandbox: new Sandbox(config),
      databases: new Databases(database),
      knowledge: this.knowledge,
      applications: this.applications,
    };
  }

  async shutdown() {
    this.files.close();
    this.knowledge?.index.cancel();
    const results = await Promise.allSettled([
      this.dialogs.close(),
      this.applications.close(),
      this.supervisor.close(),
    ]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }

  dispose() {
    this.knowledge?.index.close();
    this.database?.close();
    this.releaseLease?.();
  }
}
export type Services = Awaited<ReturnType<ServerServices["initialize"]>>;
