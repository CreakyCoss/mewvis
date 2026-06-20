import { LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";
import {
  emptyValueText,
  formatCount,
  getRoomCharacterById,
  getRoomCharacters,
} from "./utils";

type HeaderProps = {
  data: TavernRoom;
  characterById: Map<string, TavernCharacter>;
  messagesByRoomId: Record<string, TavernMessage[]>;
  textFieldAgentError: string;
};

export const Header = ({
  data,
  characterById,
  messagesByRoomId,
  textFieldAgentError,
}: HeaderProps) => {
  const roomCharacterById = getRoomCharacterById(data, characterById);
  const roomCharacters = getRoomCharacters(data, roomCharacterById);
  const roomMessageCount = messagesByRoomId[data.id]?.length ?? 0;

  return (
    <header className="shrink-0 border-b bg-muted/10 px-5 py-4 lg:px-7">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold leading-7">
              {data.title.trim() || emptyValueText}
            </h1>
            {data.systemPresetId && (
              <Badge variant="secondary">
                系统预设
              </Badge>
            )}
            {data.locked && (
              <Badge variant="outline" className="gap-1">
                <LockKeyhole className="size-3" />
                已锁定
              </Badge>
            )}
          </div>
          <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            编辑酒馆内容、共享剧情资产和可用故事场景。
          </p>
          {textFieldAgentError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
              {textFieldAgentError}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:min-w-[360px]">
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="font-medium">
              {formatCount(roomCharacters.length, "角色")}
            </div>
            <div className="text-muted-foreground">入席</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="font-medium">
              {formatCount(roomMessageCount, "消息")}
            </div>
            <div className="text-muted-foreground">对话</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="font-medium">
              {formatCount(data.timelineEvents.length, "事件")}
            </div>
            <div className="text-muted-foreground">时间线</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="font-medium">
              {formatCount(data.lorebookEntries.length, "条")}
            </div>
            <div className="text-muted-foreground">世界书</div>
          </div>
        </div>
      </div>
    </header>
  );
};
