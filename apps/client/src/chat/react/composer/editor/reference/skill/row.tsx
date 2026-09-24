import { SparklesIcon, TerminalIcon } from "lucide-react";
import type { ReferenceEntry } from "./options";

export const ReferenceEntryContent = ({ entry }: { entry: ReferenceEntry }) => (
  <>
    {entry.kind === "command" ? (
      <TerminalIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
    ) : (
      <SparklesIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
    )}
    <span className="min-w-0 flex-1" title={entry.description}>
      <span className="block truncate text-sm font-medium">{entry.kind === "skill" ? entry.label : entry.name}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {entry.description || (entry.kind === "command" ? entry.commandId : entry.skillKey)}
      </span>
    </span>
  </>
);
