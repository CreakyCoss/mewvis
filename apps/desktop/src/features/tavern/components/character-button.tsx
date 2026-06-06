import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { MessageCircle } from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { cn } from "@/lib/utils";
import type { TavernCharacter } from "../types";

type CharacterButtonProps = Omit<ComponentPropsWithoutRef<"button">, "disabled" | "onClick"> & {
  character: TavernCharacter;
  isActive: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export const CharacterButton = forwardRef<HTMLButtonElement, CharacterButtonProps>(({
  character,
  isActive,
  disabled,
  onClick,
  className,
  ...props
}, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "flex w-full min-w-0 gap-2 rounded-md border bg-background/55 p-2 text-left transition-colors hover:bg-background",
      isActive && "border-primary/40 bg-primary/10",
      className,
    )}
    disabled={disabled}
    onClick={onClick}
    {...props}
  >
    <img
      src={resolveAgentAvatar(character.avatar).src}
      alt=""
      className="size-8 shrink-0 rounded-md"
    />
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold">{character.name}</span>
        {isActive && <MessageCircle className="size-3.5 shrink-0 text-primary" />}
      </span>
      <span className="mt-0.5 line-clamp-1 text-xs leading-4 text-muted-foreground">
        {character.description}
      </span>
    </span>
  </button>
));

CharacterButton.displayName = "CharacterButton";
