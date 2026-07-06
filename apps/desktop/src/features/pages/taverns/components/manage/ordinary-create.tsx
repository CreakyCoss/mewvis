import { Plus } from "lucide-react";
import type { Ref } from "react";
import { useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";

export type OrdinaryCreateHandle = () => void;

type OrdinaryCreateProps = {
  bind: Ref<OrdinaryCreateHandle>;
  onCreateRoom: () => string | void;
  onOpenRoomEditor: (roomId: string) => void;
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
    const roomId = onCreateRoom();
    onOperationStatusChange("已创建普通酒馆。");

    if (!roomId) {
      return;
    }

    window.setTimeout(() => {
      onOpenRoomEditor(roomId);
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
