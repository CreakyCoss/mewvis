import { useImperativeHandle, useState, type ReactNode, type Ref } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type PlotDataDialogHandle = {
  open: () => void;
};

export type PlotDataDialogProps = {
  bind: Ref<PlotDataDialogHandle>;
  isBusy: boolean;
};

export type ConfirmAction = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export const emptyValueText = "未设置";

export const replyModeDescriptions = {
  active: "仅当前选中的角色发言",
  round: "所有入席角色依次发言",
  director: "由导演选择合适角色发言",
} as const;

export const EmptyDetailState = ({ children }: { children: ReactNode }) => (
  <div className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] px-4 py-8 text-center text-sm text-current/70">
    {children}
  </div>
);

const useDialogOpenHandle = (bind: Ref<PlotDataDialogHandle>) => {
  const [isOpen, setIsOpen] = useState(false);
  useImperativeHandle(bind, () => ({
    open: () => setIsOpen(true),
  }), []);
  return { isOpen, setIsOpen };
};

export const PlotDataSheet = ({
  bind,
  title,
  description,
  children,
}: {
  bind: Ref<PlotDataDialogHandle>;
  title: string;
  description: string;
  children: ReactNode;
}) => {
  const { isOpen, setIsOpen } = useDialogOpenHandle(bind);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        side="right"
        className="!w-[92vw] !max-w-[92vw] gap-0 p-0 sm:!w-[480px] sm:!max-w-[480px]"
      >
        <SheetHeader className="border-b px-5 py-4 pr-14">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-5">
            {children}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export const ConfirmActionDialog = ({
  action,
  onClose,
}: {
  action: ConfirmAction | null;
  onClose: () => void;
}) => {
  const confirm = () => {
    if (!action) {
      return;
    }
    action.onConfirm();
    onClose();
  };

  return (
    <Dialog
      open={Boolean(action)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      {action && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                <TriangleAlertIcon className="size-4" />
              </span>
              <DialogTitle>{action.title}</DialogTitle>
            </div>
            <DialogDescription>{action.description}</DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirm}
            >
              {action.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
};
