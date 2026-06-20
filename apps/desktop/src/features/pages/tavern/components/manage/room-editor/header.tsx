import {
  BookOpen,
  Clock,
  LockKeyhole,
  MessageSquareText,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";
import {
  emptyValueText,
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
  const headerStats: Array<{
    icon: LucideIcon;
    value: number;
    label: string;
  }> = [
    {
      icon: UsersRound,
      value: roomCharacters.length,
      label: "角色阵容",
    },
    {
      icon: MessageSquareText,
      value: roomMessageCount,
      label: "消息对话",
    },
    {
      icon: Clock,
      value: data.timelineEvents.length,
      label: "事件时间线",
    },
    {
      icon: BookOpen,
      value: data.lorebookEntries.length,
      label: "条世界书",
    },
  ];

  return (
    <header className="shrink-0 border-b bg-background px-5 py-4 shadow-sm lg:px-7">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold leading-7">
              {data.title.trim() || emptyValueText}
            </h1>
            {data.systemPresetId && (
              <Badge
                variant="secondary"
                className="border border-primary/15 bg-primary/10 text-primary dark:border-primary/20 dark:bg-primary/15"
              >
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

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:min-w-[520px]">
          {headerStats.map(({ icon: Icon, value, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border bg-muted/10 px-3 py-2.5 shadow-xs"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold leading-5">
                  {value}
                </div>
                <div className="truncate text-[11px] leading-4 text-muted-foreground">
                  {label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
};
