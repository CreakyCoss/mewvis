import { Plus } from "lucide-react";
import type { Ref } from "react";
import { useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import type { TavernRoom } from "../tavern/types";

export type OrdinaryCreateHandle = () => void;

type OrdinaryCreateProps = {
  bind: Ref<OrdinaryCreateHandle>;
  onCreateRoom: () => TavernRoom | void;
  onOpenRoomEditor: (room: TavernRoom) => void;
  onOperationStatusChange: (status: string) => void;
  showTrigger?: boolean;
};

export const OrdinaryCreate = ({
  bind,
  onCreateRoom,
  onOpenRoomEditor,
  onOperationStatusChange,
  showTrigger = true,
}: OrdinaryCreateProps) => {
  const open = () => {
    const room = onCreateRoom();
    onOperationStatusChange("已创建普通酒馆。");

    if (!room) {
      return;
    }

    window.setTimeout(() => {
      onOpenRoomEditor(room);
    }, 0);
  };

  useImperativeHandle(bind, () => open);

  if (!showTrigger) {
    return null;
  }

  return (
    <Button type="button" variant="outline" onClick={open}>
      <Plus className="size-4" />
      普通创建
    </Button>
  );
};
