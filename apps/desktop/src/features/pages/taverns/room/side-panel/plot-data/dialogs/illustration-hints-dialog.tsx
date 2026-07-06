import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import {
  ConfirmActionDialog,
  EmptyDetailState,
  PlotDataSheet,
  type ConfirmAction,
  type PlotDataDialogProps,
} from "./shared";

export const IllustrationHintsDialog = ({ bind, isBusy }: PlotDataDialogProps) => {
  const { activeRoom, patchRoom } = useTavernRoomContext();
  const [pendingConfirmAction, setPendingConfirmAction] = useState<ConfirmAction | null>(null);

  const clearIllustrationHints = () => {
    if (!activeRoom || activeRoom.illustrationHints.length === 0) {
      return;
    }

    setPendingConfirmAction({
      title: "清空插图提示",
      description: "清空当前场景的插图提示？这些导演生成的画面提示会从当前场景中移除。",
      confirmLabel: "清空提示",
      onConfirm: () => {
        patchRoom(activeRoom.id, {
          illustrationHints: [],
        });
      },
    });
  };

  return (
    <>
      <PlotDataSheet bind={bind} title="插图提示" description="查看导演为当前场景生成的公开画面提示。">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">{activeRoom?.illustrationHints.length ?? 0} 条提示</div>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              disabled={isBusy || !activeRoom?.illustrationHints.length}
              onClick={clearIllustrationHints}
            >
              <Trash2 className="size-3.5" />
              清空
            </Button>
          </div>
          {activeRoom?.illustrationHints.length ? (
            <div className="space-y-3">
              {activeRoom.illustrationHints
                .slice()
                .reverse()
                .map((hint, index) => (
                  <div key={hint.id} className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-current/70">
                      <span>#{activeRoom.illustrationHints.length - index}</span>
                      <span>{new Date(hint.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-current/70">{hint.prompt}</div>
                  </div>
                ))}
            </div>
          ) : (
            <EmptyDetailState>暂无插图提示。</EmptyDetailState>
          )}
        </div>
      </PlotDataSheet>
      <ConfirmActionDialog action={pendingConfirmAction} onClose={() => setPendingConfirmAction(null)} />
    </>
  );
};
