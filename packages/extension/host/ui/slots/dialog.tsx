import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { UIContribution } from "../index.js";
import { useDialogRuntime } from "../runtime/dialog-context";
import { ExtensionView } from "../views/frame-view";
export type DialogSlotItem = Readonly<
  Extract<UIContribution, { type: "dialog" }>
> & {
  close(): void;
  renderView(): ReactNode;
};

/** Mount once at the application root. The caller owns the modal shell and its layout. */
export function DialogSlot({
  render,
}: {
  render(item: DialogSlotItem): ReactNode;
}) {
  const runtime = useDialogRuntime();
  useEffect(() => runtime.attach(), [runtime]);
  const request = useSyncExternalStore(
    runtime.subscribe,
    runtime.snapshot,
    () => null,
  );
  if (!request) return null;
  const contribution = request.contribution;
  const close = () => runtime.close(request.id);
  return render({
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
  });
}
