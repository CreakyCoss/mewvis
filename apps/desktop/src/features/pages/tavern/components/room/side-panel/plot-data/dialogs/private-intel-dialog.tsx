import { filterTavernFactEventsForAudience } from "../../../../../core";
import { useTavernPageContext } from "../../../../context";
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
  const { activeRoom, roomCharacters } = useTavernPageContext();
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
            <div key={event.id} className="rounded-md border bg-background/60 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {event.type}
                </span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {event.visibility ?? "public"}
                </span>
                {event.revealWhen && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {event.revealWhen}
                  </span>
                )}
                {isHiddenFactEvent(event) && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {formatFactAudience(event, characterNameById)}
                  </span>
                )}
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
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
