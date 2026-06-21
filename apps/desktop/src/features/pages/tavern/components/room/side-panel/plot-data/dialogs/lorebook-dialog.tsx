import { useTavernPageContext } from "../../../../context";
import {
  EmptyDetailState,
  PlotDataSheet,
  type PlotDataDialogProps,
} from "./shared";

export const LorebookDialog = ({ bind }: PlotDataDialogProps) => {
  const { activeRoom } = useTavernPageContext();

  return (
    <PlotDataSheet
      bind={bind}
      title="世界书"
      description="查看当前房间可引用的世界设定。"
    >
      {activeRoom?.lorebookEntries.length ? (
        <div className="space-y-3">
          {activeRoom.lorebookEntries.map((entry) => (
            <div key={entry.id} className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-medium">{entry.title}</div>
                <div className="flex shrink-0 items-center gap-1">
                  {entry.alwaysOn && (
                    <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                      常驻
                    </span>
                  )}
                  <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                    {entry.enabled ? "启用" : "停用"}
                  </span>
                </div>
              </div>
              {entry.keywords.length > 0 && (
                <div className="mt-1 text-xs text-current/70">
                  {entry.keywords.join("，")}
                </div>
              )}
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-current/70">
                {entry.content}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyDetailState>暂无世界书。</EmptyDetailState>
      )}
    </PlotDataSheet>
  );
};
