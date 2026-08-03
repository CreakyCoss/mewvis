import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { SendIcon, SquareIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ChatEditor, type ChatEditorHandle } from "./editor";
import { emptyChatEditorValue, type ChatEditorValue } from "./editor/serialize";
import { ModelMenu } from "./menus/model";
import { KnowledgeMenu } from "./menus/knowledge";
import { SkillMenu } from "./menus/skill";
import { ToolMenu } from "./menus/tool";
import { ChatInputStoreProvider, useChatInputStore } from "./store";
import type { ChatInputProps, ChatInputSkillOption } from "./type";

const ChatInputContent = ({
  resources,
  files = [],
  initialOptions,
  defaultValue = "",
  placeholder = "输入问题",
  disabled = false,
  isRunning = false,
  onStop,
  onOptionsChange,
  onSubmit,
}: ChatInputProps) => {
  const resourceStore = useChatInputStore();
  const editorRef = useRef<ChatEditorHandle>(null);
  const initialOptionsRef = useRef(initialOptions);
  const onOptionsChangeRef = useRef(onOptionsChange);
  const [editorValue, setEditorValue] = useState<ChatEditorValue>(() => ({
    text: defaultValue.trim(),
    blocks: defaultValue.trim() ? [{ type: "text" as const, content: defaultValue.trim() }] : [],
  }));

  const controlsDisabled = disabled || isRunning;
  const canSubmit =
    !controlsDisabled && Boolean(editorValue.text.trim()) && Boolean(resourceStore.options.selectedModelId);
  const referenceSkills = useMemo(() => {
    const selectedSkillKeys = new Set(resourceStore.options.selectedSkillKeys);
    const skillsByKey = new Map<string, ChatInputSkillOption>();

    resourceStore.resources.skillGroups?.forEach((group) => {
      group.skills.forEach((skill) => {
        if (selectedSkillKeys.has(skill.key)) {
          skillsByKey.set(skill.key, skill);
        }
      });
    });

    return [...skillsByKey.values()];
  }, [resourceStore.options.selectedSkillKeys, resourceStore.resources.skillGroups]);

  useEffect(() => {
    initialOptionsRef.current = initialOptions;
  }, [initialOptions]);

  useEffect(() => {
    onOptionsChangeRef.current = onOptionsChange;
  }, [onOptionsChange]);

  useEffect(() => {
    resourceStore.initializeResources(resources, initialOptionsRef.current);
  }, [resourceStore.initializeResources, resources]);

  useEffect(() => {
    if (resourceStore.isInitialized) {
      onOptionsChangeRef.current?.(resourceStore.options);
    }
  }, [resourceStore.isInitialized, resourceStore.options]);

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
      request: {
        text: submittedValue.text,
        blocks: submittedValue.blocks,
        ...resourceStore.submitResources,
      },
      options: resourceStore.options,
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
          skills={referenceSkills}
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
            <ModelMenu disabled={disabled} selectionDisabled={controlsDisabled} />
            <SkillMenu disabled={controlsDisabled} />
            <KnowledgeMenu disabled={controlsDisabled} />
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
