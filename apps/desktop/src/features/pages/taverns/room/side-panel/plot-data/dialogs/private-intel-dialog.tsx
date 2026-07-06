import { filterTavernFactEventsForAudience } from "@/features/pages/taverns/tavern/core";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import {
  formatFactAudience,
  isHiddenFactEvent,
} from "../helpers";
import {
  EmptyDetailState,
  PlotDataSheet,
  type PlotDataDialogProps,
} from "./shared";

export const PrivateIntelDialog = ({ bind }: PlotDataDialogProps) => {
  const { activeRoom, roomCharacters } = useTavernRoomContext();
  const characterNameById = new Map(roomCharacters.map((character) => [character.id, character.name]));
  const privateIntelEvents = activeRoom ? filterTavernFactEventsForAudience({
    factEvents: activeRoom.factEvents,
    room: activeRoom,
    audience: { type: "user" },
  }).filter((event) => event.visibleToUser || event.visibility !== "public") : [];

  return (
    <PlotDataSheet
      bind={bind}
      title="我的情报"
      description="汇总当前用户可知但不公开进入聊天正文的事实。"
    >
      {privateIntelEvents.length > 0 ? (
        <div className="space-y-3">
          {privateIntelEvents.slice().reverse().map((event) => (
            <div key={event.id} className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                  {event.type}
                </span>
                <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                  {event.visibility ?? "public"}
                </span>
                {event.revealWhen && (
                  <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                    {event.revealWhen}
                  </span>
                )}
                {isHiddenFactEvent(event) && (
                  <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                    {formatFactAudience(event, characterNameById)}
                  </span>
                )}
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-current/70">
                {event.evidence}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyDetailState>暂无仅你可知事实。</EmptyDetailState>
      )}
    </PlotDataSheet>
  );
};
