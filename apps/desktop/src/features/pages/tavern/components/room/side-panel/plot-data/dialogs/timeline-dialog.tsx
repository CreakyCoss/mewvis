import { useTavernPageContext } from "../../../../context";
import {
  EmptyDetailState,
  PlotDataSheet,
  type PlotDataDialogProps,
} from "./shared";

export const TimelineDialog = ({ bind }: PlotDataDialogProps) => {
  const { activeRoom } = useTavernPageContext();

  return (
    <PlotDataSheet
      bind={bind}
      title="剧情时间线"
      description="查看已沉淀的剧情事件。"
    >
      {activeRoom?.timelineEvents.length ? (
        <div className="space-y-3">
          {activeRoom.timelineEvents.map((event, index) => (
            <div key={event.id} className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-current/10 text-xs font-medium text-current/70">
                  {index + 1}
                </span>
                <span className="min-w-0 truncate text-sm font-medium">{event.title}</span>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-current/70">
                {event.summary}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyDetailState>暂无剧情事件。</EmptyDetailState>
      )}
    </PlotDataSheet>
  );
};
