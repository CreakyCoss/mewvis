import { useRef, type ComponentType, type PropsWithChildren } from "react";
import { SendIcon, SquareIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton } from "design-system/components/ui/input-group";
import { Kbd, KbdGroup } from "design-system/components/ui/kbd";
import { ChatEditor, type ChatEditorHandle } from "./editor";
import { ModelMenu } from "./menus/model";
import { PermissionMenu } from "./menus/permission";
import { CapabilityMenu } from "./menus/capability";
import { useBeforeComposer, useChatComposer } from "../provider";
import type { SendResult } from "../../core";

export type ComposerBinding = ReturnType<typeof useChatComposer>;
export type ComposerSlots = {
  editor?: ComponentType<ComposerBinding & { placeholder: string }>;
  toolbar?: ComponentType<ComposerBinding>;
  actions?: ComponentType<ComposerBinding>;
};
export function ComposerToolbar(binding: ComposerBinding) {
  return (
    <>
      <ModelMenu
        controls={binding.controls}
        disabled={binding.disabled && !binding.busy}
        selectionDisabled={binding.disabled}
      />
      <CapabilityMenu controls={binding.controls} disabled={binding.disabled} />
      <PermissionMenu controls={binding.controls} disabled={binding.disabled} />
    </>
  );
}
export function ComposerActions(binding: ComposerBinding) {
  return (
    <>
      <span className="hidden items-center gap-1.5 px-1 text-xs text-muted-foreground sm:flex">
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <span>/</span>
          <Kbd>⌘</Kbd>
          <Kbd>Enter</Kbd>
        </KbdGroup>
        <span>发送</span>
      </span>
      {binding.busy ? (
        <InputGroupButton
          type="button"
          size="icon-sm"
          variant="default"
          aria-label="停止生成"
          className="size-10 cursor-pointer rounded-full shadow-xs"
          onClick={(event) => {
            // Stopping preparation can synchronously render the submit button in
            // this DOM position. Suppress this click's native submit default.
            event.preventDefault();
            void binding.stop();
          }}
        >
          <SquareIcon aria-hidden="true" className="size-3 fill-current" />
        </InputGroupButton>
      ) : (
        <InputGroupButton
          type="button"
          onClick={() => void binding.submit()}
          size="icon-sm"
          variant="default"
          disabled={!binding.canSubmit}
          aria-label="发送消息"
          className="size-10 cursor-pointer rounded-full shadow-xs"
        >
          <SendIcon aria-hidden="true" />
        </InputGroupButton>
      )}
    </>
  );
}
export type ComposerViewProps = PropsWithChildren<{
  binding: ComposerBinding;
  className?: string;
  placeholder?: string;
  slots?: ComposerSlots;
  onSubmitted?: (result: SendResult) => void;
}>;
export function ComposerView({
  binding,
  className = "",
  placeholder = "继续输入消息",
  slots = {},
  children,
  onSubmitted,
}: ComposerViewProps) {
  const editor = useRef<ChatEditorHandle>(null);
  const Editor = slots.editor;
  const Toolbar = slots.toolbar ?? ComposerToolbar;
  const Actions = slots.actions ?? ComposerActions;
  const submit = async () => {
    if (!Editor && editor.current) binding.setDraft(editor.current.getValue());
    const result = await binding.submit();
    onSubmitted?.(result);
    return result;
  };
  return (
    <form
      className={`mx-auto w-full max-w-[69rem] ${className}`}
      onKeyDown={(event) => {
        if (!event.defaultPrevented && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void submit();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <InputGroup className="h-auto flex-col items-stretch overflow-hidden rounded-xl border border-border/80 bg-card shadow-[var(--shadow-composer)] transition-[border-color,box-shadow] duration-200 ease-out has-[[data-slot=input-group-control]:focus-visible]:border-ring/55 has-[[data-slot=input-group-control]:focus-visible]:shadow-[var(--shadow-floating)] has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15 dark:bg-card">
        {Editor ? (
          <Editor {...binding} placeholder={placeholder} />
        ) : (
          <ChatEditor
            key={binding.clearVersion}
            ref={editor}
            files={binding.files}
            skills={binding.skills}
            defaultValue={binding.draft.text}
            initialBlocks={binding.draft.blocks}
            placeholder={placeholder}
            disabled={binding.disabled}
            onChange={binding.setDraft}
          />
        )}
        <InputGroupAddon
          align="block-end"
          className="min-h-12 flex-wrap justify-between gap-2 px-3 pt-0 pb-3 font-normal"
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <Toolbar {...binding} />
            {children}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Actions {...binding} submit={submit} />
          </div>
        </InputGroupAddon>
      </InputGroup>
      {binding.error ? (
        <div role="alert" className="mt-2 text-sm text-destructive">
          {binding.error}
        </div>
      ) : null}
    </form>
  );
}
export function ChatComposer(props: Omit<ComposerViewProps, "binding">) {
  const binding = useChatComposer();
  const beforeComposer = useBeforeComposer();
  return binding.initialized ? (
    <>
      {beforeComposer}
      <ComposerView {...props} binding={binding} />
    </>
  ) : null;
}

export function EmptyComposer({ placeholder = "输入问题" }: { placeholder?: string }) {
  const noop = () => {};
  const binding: ComposerBinding = {
    draft: { text: "", blocks: [] },
    revision: 0,
    clearVersion: 0,
    submitting: false,
    error: "",
    preferenceError: "",
    preferences: { showThinkingProcess: true, showToolCallProcess: true },
    files: [],
    skills: [],
    busy: false,
    initialized: false,
    disabled: true,
    canSubmit: false,
    setDraft: noop,
    submit: async () => ({ status: "rejected" }),
    stop: async () => ({ ok: true }),
    controls: {
      resources: {},
      options: {
        selectedModelId: "",
        selectedAgentId: "",
        selectedSkillKeys: [],
        permissionMode: null,
        selectedKnowledgeCollectionIds: [],
        showThinkingProcess: true,
        showToolCallProcess: true,
      },
      updateOptions: noop,
    },
  };
  return <ComposerView binding={binding} placeholder={placeholder} />;
}
