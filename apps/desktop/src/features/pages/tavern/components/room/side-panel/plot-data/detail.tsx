import { useImperativeHandle, useState, type ReactNode, type Ref } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DetailPanelKey } from "../types";

export type PlotDataDetailHandle = {
  open: (detailPanel: DetailPanelKey) => void;
  close: () => void;
};

type PlotDataDetailProps = {
  bind: Ref<PlotDataDetailHandle>;
  renderContent: (detailPanel: DetailPanelKey) => ReactNode;
};

const detailPanelTitle: Record<DetailPanelKey, string> = {
  "asset-drafts": "剧情资产草稿",
  timeline: "剧情时间线",
  lorebook: "世界书",
  "illustration-hints": "插图提示",
  "progress-rules": "状态规则",
  "tasks-outcomes": "任务与结局",
  "script-review": "剧本视角",
  "private-intel": "我的情报",
  tips: "现场提示",
};

const detailPanelDescription: Record<DetailPanelKey, string> = {
  "asset-drafts": "确认或忽略系统整理出的剧情资产。",
  timeline: "查看已沉淀的剧情事件。",
  lorebook: "查看当前房间可引用的世界设定。",
  "illustration-hints": "查看导演为当前场景生成的公开画面提示。",
  "progress-rules": "查看状态定义、触发规则与最近变更。",
  "tasks-outcomes": "查看个人、团队、全局任务与场景胜负条件。",
  "script-review": "切换公开、复盘和导演视角，管理可揭示事实。",
  "private-intel": "汇总当前用户可知但不公开进入聊天正文的事实。",
  tips: "查看酒馆现场的使用提醒。",
};

export const Detail = ({
  bind,
  renderContent,
}: PlotDataDetailProps) => {
  const [detailPanel, setDetailPanel] = useState<DetailPanelKey | null>(null);

  useImperativeHandle(bind, () => ({
    open: (nextDetailPanel) => setDetailPanel(nextDetailPanel),
    close: () => setDetailPanel(null),
  }), []);

  return (
    <Sheet
      open={detailPanel !== null}
      onOpenChange={(open) => {
        if (!open) {
          setDetailPanel(null);
        }
      }}
    >
      <SheetContent
        side="right"
        className="!w-[92vw] !max-w-[92vw] gap-0 p-0 sm:!w-[480px] sm:!max-w-[480px]"
      >
        {detailPanel && (
          <>
            <SheetHeader className="border-b px-5 py-4 pr-14">
              <SheetTitle>{detailPanelTitle[detailPanel]}</SheetTitle>
              <SheetDescription>{detailPanelDescription[detailPanel]}</SheetDescription>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-5">
                {renderContent(detailPanel)}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
