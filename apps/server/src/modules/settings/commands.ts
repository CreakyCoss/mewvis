import type {
  CommandRegistry,
  CommandHandler,
} from "../../transport/commands/registry.js";
import type { LlmSettingsService } from "./llm-service.js";
import type { AgentSettingsService } from "./agents-service.js";
import { settingsOperation } from "../../storage/config/database.js";
import { object, onlyKeys } from "../../shared/validation.js";

export function registerSettingsCommands(
  registry: CommandRegistry,
  llm: LlmSettingsService,
  agents: AgentSettingsService,
) {
  const read =
    (work: () => unknown): CommandHandler =>
    (args) => {
      onlyKeys(args, []);
      return work();
    };
  const save =
    (work: (input: ReturnType<typeof object>) => unknown): CommandHandler =>
    (args) => {
      onlyKeys(args, ["input"]);
      return work(object(args.input));
    };
  const remove =
    (work: (id: unknown) => unknown): CommandHandler =>
    (args) => {
      onlyKeys(args, ["id"]);
      return work(args.id);
    };
  const handlers: Record<string, CommandHandler> = {
    get_llm_settings: read(() => llm.read()),
    save_llm_settings: save((input) => llm.save(input)),
    get_ai_agent_settings: read(() => agents.read()),
    save_ai_agent: save((input) => agents.saveAgent(input)),
    delete_ai_agent: remove((id) => agents.deleteAgent(id)),
    save_collaboration_workflow: save((input) => agents.saveWorkflow(input)),
    delete_collaboration_workflow: remove((id) => agents.deleteWorkflow(id)),
  };
  for (const [name, handler] of Object.entries(handlers)) {
    registry.register(name, (args) => settingsOperation(() => handler(args)));
  }
}
