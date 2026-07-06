import { useMemo, useState } from "react";
import { BookOpenText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { requireRuntimeModelInput } from "@/features/pages/settings/llm/store";
import {
  SceneNovelizerPanel,
} from "../../components/SceneNovelizerPanel";
import {
  collectTavernSceneNovelSource,
} from "./collect-tavern-scene-source";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "@/features/pages/taverns/tavern/types";
import type {
  RuntimeModelOption,
} from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";

export const TavernSceneNovelizerSection = ({
  room,
  messages,
  characters,
  workspace,
  runtimeModel,
  disabled,
  onBusyChange,
}: {
  room: TavernRoom;
  messages: TavernMessage[];
  characters: TavernCharacter[];
  workspace: Workspace;
  runtimeModel: RuntimeModelOption | null;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const source = useMemo(() =>
    collectTavernSceneNovelSource({
      room,
      messages,
      characters,
    }),
  [characters, messages, room]);
  const runtimeModelInput = useMemo(() => {
    if (!runtimeModel) {
      return null;
    }

    try {
      return requireRuntimeModelInput(runtimeModel);
    } catch {
      return null;
    }
  }, [runtimeModel]);
  const buttonDisabled = disabled && !isBusy;
  const handleBusyChange = (busy: boolean) => {
    setIsBusy(busy);
    onBusyChange?.(busy);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full justify-start gap-2 border-current/10 bg-current/[0.045] text-current hover:bg-current/10 hover:text-current"
        disabled={buttonDisabled}
        onClick={() => setIsOpen(true)}
      >
        {isBusy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
        ) : (
          <BookOpenText className="size-4 shrink-0 text-primary" />
        )}
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
          场景小说稿
        </span>
        <span className="shrink-0 text-xs text-current/55">
          {isBusy ? "写作中" : "打开"}
        </span>
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && isBusy) {
            return;
          }
          setIsOpen(open);
        }}
      >
        <DialogContent className="flex h-[86vh] max-h-[86vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>场景小说稿</DialogTitle>
            <DialogDescription>
              勾选写作规则，生成并查看当前节点的小说化成稿。
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1 pr-3">
            <SceneNovelizerPanel
              source={source}
              workspacePath={workspace.path}
              runtimeModel={runtimeModelInput}
              disabled={disabled}
              onBusyChange={handleBusyChange}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
