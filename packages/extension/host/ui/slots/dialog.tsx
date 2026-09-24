import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "design-system/components/ui/alert-dialog";
import type { UIContribution } from "../index.js";
import { useDialogRuntime } from "../runtime/dialog-context";
import { ExtensionView } from "../views/frame-view";
export type DialogSlotItem = Readonly<
  Extract<UIContribution, { type: "dialog" }>
> & {
  close(): void;
  renderView(): ReactNode;
};

export type DialogSlotProps = {
  render?: (item: DialogSlotItem) => ReactNode;
  renderConfirm?: (item: ConfirmSlotItem) => ReactNode;
};
export type ConfirmSlotItem = Readonly<{
  title: string;
  description?: string;
  confirmText: string;
  cancelText: string;
  tone: "default" | "danger";
  confirm(): void;
  close(): void;
}>;

function DefaultConfirm({ item }: { item: ConfirmSlotItem }) {
  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) item.close(); }}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{item.title}</AlertDialogTitle>
          <AlertDialogDescription>{item.description ?? "请确认是否继续。"}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={item.close}>{item.cancelText}</AlertDialogCancel>
          <AlertDialogAction
            variant={item.tone === "danger" ? "destructive" : "default"}
            onClick={item.confirm}
          >
            {item.confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DefaultDialog({ item }: { item: DialogSlotItem }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) item.close();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className={`!flex flex-col gap-0 overflow-hidden p-0 ${
          item.size === "lg"
            ? "h-[min(780px,86vh)] sm:max-w-4xl lg:max-w-5xl"
            : item.size === "md"
              ? "h-[min(520px,78vh)] sm:max-w-2xl"
              : "h-[min(420px,75vh)] sm:max-w-md"
        }`}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 bg-surface-raised/85 px-5 py-5 pr-16">
          <DialogTitle>{item.title}</DialogTitle>
        </DialogHeader>
        {item.renderView()}
      </DialogContent>
    </Dialog>
  );
}

/** Mount once at the application root. Override render to replace the default dialog shell. */
export function DialogSlot({ render, renderConfirm }: DialogSlotProps) {
  const runtime = useDialogRuntime();
  useEffect(() => runtime.attach(), [runtime]);
  const request = useSyncExternalStore(
    runtime.subscribe,
    runtime.snapshot,
    () => null,
  );
  if (!request) return null;
  if (request.kind === "confirm") {
    const item: ConfirmSlotItem = {
      title: request.title,
      description: request.description,
      confirmText: request.confirmText,
      cancelText: request.cancelText,
      tone: request.tone,
      confirm: () => runtime.close(request.id, true),
      close: () => runtime.close(request.id),
    };
    return renderConfirm ? renderConfirm(item) : <DefaultConfirm item={item} />;
  }
  const contribution = request.contribution;
  const close = () => runtime.close(request.id);
  const item: DialogSlotItem = {
    ...contribution,
    close,
    renderView: () => (
      <ExtensionView
        key={request.id}
        extensionId={contribution.extensionId}
        contributionId={contribution.id}
        viewId={contribution.view.id}
        title={contribution.title}
        revision={contribution.revision}
        input={request.input}
        dialogId={request.id}
        {...request.owner.context}
      />
    ),
  };
  return render ? render(item) : <DefaultDialog item={item} />;
}
