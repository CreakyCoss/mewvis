import { object, onlyKeys } from "../shared/validation.js";
import type { Services } from "./services.js";
import { CommandRegistry } from "../transport/commands/registry.js";
import { registerModule } from "../transport/commands/register.js";
import { commandNames } from "../modules/agent/host.js";
import { registerSettingsCommands } from "../modules/settings/commands.js";
import { registerWorkspaceCommands } from "../modules/workspaces/commands.js";
import { knowledgeBare } from "../modules/knowledge/service.js";
import { applicationsBare } from "../modules/applications/service.js";

/** One explicit command catalog; registration never opens databases or starts workers. */
export function registerCommands(services: Services) {
  const commands = new CommandRegistry();
  for (const name of commandNames)
    commands.register(name, (args) => services.agent.invoke(name, args));
  registerSettingsCommands(
    commands,
    services.settings.llm,
    services.settings.agents,
  );
  registerWorkspaceCommands(commands, services.workspaces);
  registerModule(commands, services.files.commands());
  registerModule(commands, services.extensions.commands());
  registerModule(commands, services.chats.commands());
  registerModule(commands, services.versionControl.commands());
  registerModule(commands, services.skills.commands(), ["get_skills"]);
  registerModule(commands, services.sandbox.commands(), [
    "get_agent_runtime_sandbox_status",
    "initialize_agent_runtime_sandbox",
    "set_agent_runtime_sandbox_enabled",
  ]);
  registerModule(commands, services.databases.commands(), [
    "get_config_database_status",
    "initialize_config_database",
    "rebuild_config_database",
  ]);
  registerModule(commands, services.knowledge.commands(), knowledgeBare);
  registerModule(commands, services.applications.commands(), applicationsBare);
  commands.register("open_system_dialog", (args, context) => {
    onlyKeys(args, ["input"]);
    return services.dialogs.open(object(args.input), context?.signal);
  });
  return commands;
}
