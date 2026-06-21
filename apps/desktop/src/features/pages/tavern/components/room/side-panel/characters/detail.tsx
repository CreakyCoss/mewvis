import { Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCardContent } from "@/components/ui/hover-card";
import type { TavernCharacter, TavernRoom } from "../../../../types";
import {
  formatTavernCharacterRelationshipSummary,
} from "../../../../core/relationships";
import { compactText } from "../shared";

const TooltipField = ({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) => (
  <div className="space-y-1">
    <div className="text-[11px] font-medium text-current opacity-65">{label}</div>
    <div className="whitespace-pre-wrap text-xs leading-5 text-current">
      {compactText(value)}
    </div>
  </div>
);

export const CharacterDetail = ({
  character,
  room,
  memory,
  isBusy,
  isCompacting,
  onCompact,
}: {
  character: TavernCharacter;
  room: TavernRoom;
  memory: string;
  isBusy?: boolean;
  isCompacting?: boolean;
  onCompact?: () => void;
}) => {
  const relationshipSummary = formatTavernCharacterRelationshipSummary({
    character,
    room,
    maxItems: 4,
  });

  return (
  <HoverCardContent
    side="left"
    align="start"
    sideOffset={8}
    className="w-80 max-w-80 space-y-3 p-3 text-left"
  >
    <div>
      <div className="text-sm font-semibold text-popover-foreground">{character.name}</div>
    </div>
    <TooltipField label="角色设定" value={character.description} />
    <TooltipField label="说话方式" value={character.speakingStyle} />
    {character.goals?.trim() && (
      <TooltipField label="目标" value={character.goals} />
    )}
    {relationshipSummary.trim() && (
      <TooltipField label="关系" value={relationshipSummary} />
    )}
    <TooltipField label="角色记忆" value={memory} />
    {onCompact && (
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="w-full"
        disabled={isBusy || isCompacting}
        onClick={onCompact}
      >
        {isCompacting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCcw className="size-3.5" />
        )}
        压缩角色知识
      </Button>
    )}
  </HoverCardContent>
  );
};
