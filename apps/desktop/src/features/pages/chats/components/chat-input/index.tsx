import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendIcon, SquareIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ChatEditor, type ChatEditorHandle } from "./editor";
import { emptyChatEditorValue, type ChatEditorValue } from "./editor/serialize";
import { ModelMenu } from "./menus/model";
import { SkillMenu } from "./menus/skill";
import { ToolMenu } from "./menus/tool";
import { ChatInputStoreProvider, useChatInputStore } from "./store";
import type { ChatInputProps } from "./type";

const ChatInputContent = ({
  resources,
  files = [],
  displayOptions,
  defaultValue = "",
  defaultOptionValues,
  placeholder = "输入问题",
  disabled = false,
  isRunning = false,
  onStop,
  onDisplayOptionsChange,
  onSubmit,
}: ChatInputProps) => {
  const resourceStore = useChatInputStore();
  const editorRef = useRef<ChatEditorHandle>(null);
  const [editorValue, setEditorValue] = useState<ChatEditorValue>(() => ({
    text: defaultValue.trim(),
    blocks: defaultValue.trim() ? [{ type: "text" as const, content: defaultValue.trim() }] : [],
  }));

  const controlsDisabled = disabled || isRunning;
  const canSubmit =
    !controlsDisabled && Boolean(editorValue.text.trim()) && Boolean(resourceStore.optionValues.selectedModelId);

  useEffect(() => {
    resourceStore.initializeResources(resources, defaultOptionValues);
  }, [resourceStore.initializeResources, resources, defaultOptionValues]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const submittedValue = editor.getValue();
    if (!canSubmit || !resourceStore.submitResources || !submittedValue?.text.trim()) {
      return;
    }

    onSubmit({
      text: submittedValue.text,
      blocks: submittedValue.blocks,
      optionValues: resourceStore.optionValues,
      ...resourceStore.submitResources,
    });
    editor.clear();
    setEditorValue(emptyChatEditorValue);
  };

  return (
    <form className="mx-auto w-full max-w-[69rem]" onSubmit={submit}>
      <InputGroup className="h-auto flex-col items-stretch overflow-hidden rounded-xl border border-border/80 bg-card shadow-[var(--shadow-composer)] transition-[border-color,box-shadow] duration-200 ease-out has-[[data-slot=input-group-control]:focus-visible]:border-ring/55 has-[[data-slot=input-group-control]:focus-visible]:shadow-[var(--shadow-floating)] has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15 dark:bg-card">
        <ChatEditor
          ref={editorRef}
          files={files}
          defaultValue={defaultValue}
          placeholder={placeholder}
          disabled={controlsDisabled}
          onChange={setEditorValue}
        />

        <InputGroupAddon
          align="block-end"
          className="min-h-12 flex-wrap justify-between gap-2 px-3 pt-0 pb-3 font-normal"
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <ModelMenu
              disabled={disabled}
              selectionDisabled={controlsDisabled}
              displayOptions={displayOptions}
              onDisplayOptionsChange={onDisplayOptionsChange}
            />
            <SkillMenu disabled={controlsDisabled} />
            <ToolMenu disabled={controlsDisabled} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 px-1 text-xs text-muted-foreground sm:flex">
              <KbdGroup>
                <Kbd>Ctrl</Kbd>
                <span>/</span>
                <Kbd>⌘</Kbd>
                <Kbd>Enter</Kbd>
              </KbdGroup>
              <span>发送</span>
            </span>
            {isRunning ? (
              <InputGroupButton
                type="button"
                size="icon-sm"
                variant="default"
                disabled={!onStop}
                aria-label="停止生成"
                className="size-10 cursor-pointer rounded-full shadow-xs"
                onClick={() => void onStop?.()}
              >
                <SquareIcon aria-hidden="true" className="size-3 fill-current" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="default"
                disabled={!canSubmit}
                aria-label="发送消息"
                className="size-10 cursor-pointer rounded-full shadow-xs"
              >
                <SendIcon aria-hidden="true" />
              </InputGroupButton>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
};

export const ChatInput = (props: ChatInputProps) => (
  <ChatInputStoreProvider>
    <ChatInputContent {...props} />
  </ChatInputStoreProvider>
);
