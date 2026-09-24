import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  uiSlotDefinitions,
  type UIContribution,
  type UISlotContext,
  type UISlotDefinition,
} from "../index.js";
import { useDialogRuntime } from "../runtime/dialog-context";
import {
  ExtensionSlot,
  type SlotCollection,
  type SlotItem,
  type SlotRenderOverrides,
} from "./index";
import { UIIcon } from "./icons";

type ActionDefinition = Extract<UISlotDefinition, { type: "action" }>;
type ActionContribution = Extract<UIContribution, { type: "action" }>;
export type ActionSlotItem<D extends ActionDefinition = ActionDefinition> =
  SlotItem<Extract<ActionContribution, { slot: D["key"] }>> & {
    open(): Promise<void>;
  };
type ActionSlotOptions<D extends ActionDefinition> = {
  context: UISlotContext<D>;
  extensionId?: string;
} & SlotRenderOverrides<ActionSlotItem<D>>;
export type ActionSlotProps<D extends ActionDefinition> =
  ActionSlotOptions<D> & { definition: D };

/** A placement renders declared actions; their only current trigger opens a scoped plugin dialog. */
export function ActionSlot<D extends ActionDefinition>(
  props: ActionSlotProps<D>,
) {
  const dialogs = useDialogRuntime();
  const [error, setError] = useState("");
  const ownerKey = useMemo(
    () => Symbol("session-action"),
    [props.context.workspacePath, props.context.chatId],
  );
  useEffect(() => () => dialogs.release(ownerKey), [dialogs, ownerKey]);
  return (
    <ExtensionSlot
      definition={props.definition}
      context={props.context}
      extensionId={props.extensionId}
      renderAll={(collection) => {
        // ExtensionSlot has already filtered the action definition; correlate its generic item here.
        const actions =
          collection.items as readonly SlotItem<ActionContribution>[];
        const items = actions.map((item) => ({
          ...item,
          open: async () => {
            if (!item.extensionId || !item.revision)
              throw new Error("操作入口缺少插件身份");
            await dialogs.open(
              {
                key: ownerKey,
                extensionId: item.extensionId,
                revision: item.revision,
                context: props.context,
              },
              { id: item.trigger.id },
            );
          },
        })) as ActionSlotItem<D>[];
        if (props.renderAll)
          return props.renderAll({
            items,
            error: collection.error,
          } as SlotCollection<ActionSlotItem<D>>);
        return (
          <>
            {collection.error ? props.renderError?.(collection.error) : null}
            {items.length
              ? items.map((item) => (
                  <Fragment key={item.key}>
                    {props.render ? (
                      props.render(item)
                    ) : (
                      <DefaultAction item={item} onError={setError} />
                    )}
                  </Fragment>
                ))
              : props.fallback}
            {error ? (
              <span role="alert" className="text-xs text-destructive">
                {error}
              </span>
            ) : null}
          </>
        );
      }}
    />
  );
}

function DefaultAction<D extends ActionDefinition>({
  item,
  onError,
}: {
  item: ActionSlotItem<D>;
  onError(message: string): void;
}) {
  return (
    <button
      type="button"
      title={item.title}
      aria-label={item.title}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        onError("");
        void item
          .open()
          .catch((error) =>
            onError(error instanceof Error ? error.message : String(error)),
          );
      }}
    >
      <UIIcon name={item.icon} className="size-4" />
      <span>{item.title}</span>
    </button>
  );
}

export function ComposerActionSlot(
  props: ActionSlotOptions<typeof uiSlotDefinitions.composerActions>,
): ReactNode {
  if (props.renderAll)
    return (
      <ActionSlot
        definition={uiSlotDefinitions.composerActions}
        context={props.context}
        extensionId={props.extensionId}
        renderAll={props.renderAll}
      />
    );
  return (
    <ActionSlot
      definition={uiSlotDefinitions.composerActions}
      context={props.context}
      extensionId={props.extensionId}
      render={props.render}
      fallback={props.fallback}
      renderError={props.renderError}
    />
  );
}
export function HeaderActionSlot(
  props: ActionSlotOptions<typeof uiSlotDefinitions.headerActions>,
): ReactNode {
  if (props.renderAll)
    return (
      <ActionSlot
        definition={uiSlotDefinitions.headerActions}
        context={props.context}
        extensionId={props.extensionId}
        renderAll={props.renderAll}
      />
    );
  return (
    <ActionSlot
      definition={uiSlotDefinitions.headerActions}
      context={props.context}
      extensionId={props.extensionId}
      render={props.render}
      fallback={props.fallback}
      renderError={props.renderError}
    />
  );
}
