import type {
  CommandRegistry,
  CommandHandler,
} from "../../transport/commands/registry.js";
import type { WorkspaceService } from "./service.js";
import { databaseError } from "../../storage/errors.js";
import { object, onlyKeys } from "../../shared/validation.js";

export function registerWorkspaceCommands(
  registry: CommandRegistry,
  service: WorkspaceService,
) {
  const input =
    (work: (input: ReturnType<typeof object>) => unknown): CommandHandler =>
    (args) => {
      onlyKeys(args, ["input"]);
      return work(object(args.input));
    };
  const commands: Record<string, CommandHandler> = {
    list_workspaces: (args) => {
      onlyKeys(args, []);
      return service.list();
    },
    create_workspace: input((value) => service.create(value)),
    update_workspace: input((value) => service.update(value)),
    delete_workspace: input((value) => service.delete(value)),
  };
  for (const [name, command] of Object.entries(commands)) {
    registry.register(name, async (args) => {
      try {
        return await command(args);
      } catch (error) {
        throw databaseError(error, "WORKSPACE");
      }
    });
  }
}
