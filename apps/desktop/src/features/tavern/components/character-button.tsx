import { MessageCircle } from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { cn } from "@/lib/utils";
import type { TavernCharacter } from "../types";

type CharacterButtonProps = {
  character: TavernCharacter;
  isActive: boolean;
  onClick: () => void;
};

export const CharacterButton = ({
  character,
  isActive,
  onClick,
}: CharacterButtonProps) => (
  <button
    type="button"
    className={cn(
      "flex w-full min-w-0 gap-3 rounded-md border bg-background/55 p-3 text-left transition-colors hover:bg-background",
      isActive && "border-primary/40 bg-primary/10",
    )}
    onClick={onClick}
  >
    <img
      src={resolveAgentAvatar(character.avatar).src}
      alt=""
      className="size-10 shrink-0 rounded-md"
    />
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold">{character.name}</span>
        {isActive && <MessageCircle className="size-3.5 shrink-0 text-primary" />}
      </span>
      <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
        {character.description}
      </span>
    </span>
  </button>
);
