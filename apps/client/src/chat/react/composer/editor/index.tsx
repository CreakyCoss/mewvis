import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, type Ref } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { $createParagraphNode, $createTextNode, $getRoot, CLEAR_EDITOR_COMMAND } from "lexical";
import type { ChatInputFile, ChatInputSkillOption } from "@/chat/react/types";
import { FileReferenceMenu } from "./reference/file";
import { $createFileReferenceNode, FileReferenceNode } from "./reference/file/node";
import { SkillReferenceMenu } from "./reference/skill";
import { $createSkillReferenceNode, SkillReferenceNode } from "./reference/skill/node";
import { serializeChatEditorState, type ChatEditorValue } from "./serialize";

export type ChatEditorHandle = {
  clear: () => void;
  getValue: () => ChatEditorValue;
};

type ChatEditorProps = {
  files: ChatInputFile[];
  skills: ChatInputSkillOption[];
  commands?: { id: string; description: string }[];
  defaultValue: string;
  initialBlocks?: import("@/chat/core").MessagePart[];
  placeholder: string;
  disabled: boolean;
  onChange: (value: ChatEditorValue) => void;
};

const restoreContent = (value: ChatEditorValue) => {
  const paragraph = $createParagraphNode();
  if (value.blocks.length) {
    for (const block of value.blocks)
      paragraph.append(
        block.type === "file-reference"
          ? $createFileReferenceNode(block.path, block.path.split(/[\\/]/).pop() ?? block.path)
          : block.type === "skill-reference"
            ? $createSkillReferenceNode(block.skillKey, block.name)
            : $createTextNode(block.content),
      );
  } else if (value.text) paragraph.append($createTextNode(value.text));
  $getRoot().clear().append(paragraph);
};

const EditorBridge = ({
  bind,
  disabled,
  value,
}: {
  bind: Ref<ChatEditorHandle>;
  disabled: boolean;
  value: ChatEditorValue;
}) => {
  const [editor] = useLexicalComposerContext();

  useImperativeHandle(
    bind,
    () => ({
      clear: () => {
        editor.dispatchCommand(CLEAR_EDITOR_COMMAND, undefined);
      },
      getValue: () => serializeChatEditorState(editor.getEditorState()),
    }),
    [editor],
  );

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    const current = serializeChatEditorState(editor.getEditorState());
    if (current.text !== value.text || JSON.stringify(current.blocks) !== JSON.stringify(value.blocks)) {
      editor.update(() => restoreContent(value));
    }
  }, [editor, value]);

  return null;
};

const ChatEditorComponent = (
  { files, skills, commands, defaultValue, initialBlocks, placeholder, disabled, onChange }: ChatEditorProps,
  bind: Ref<ChatEditorHandle>,
) => {
  const initialConfig = useMemo(
    () => ({
      namespace: "MewvisChatInput",
      nodes: [FileReferenceNode, SkillReferenceNode],
      editable: !disabled,
      theme: {
        paragraph: "m-0",
      },
      editorState: () => {
        restoreContent({ text: defaultValue, blocks: initialBlocks ?? [] });
      },
      onError: (error: Error) => {
        throw error;
      },
    }),
    [defaultValue, initialBlocks, disabled],
  );
  const handleChange = useCallback(
    (editorState: Parameters<typeof serializeChatEditorState>[0]) => {
      onChange(serializeChatEditorState(editorState));
    },
    [onChange],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative min-h-28 w-full">
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              data-slot="input-group-control"
              aria-label="对话内容"
              aria-disabled={disabled}
              className="max-h-48 min-h-28 w-full overflow-y-auto px-4 py-4 text-base leading-6 whitespace-pre-wrap text-foreground outline-none [overflow-wrap:anywhere] aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            />
          }
          placeholder={
            <div className="pointer-events-none absolute inset-x-4 top-4 truncate text-base leading-6 text-muted-foreground/70">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ClearEditorPlugin />
        <OnChangePlugin ignoreSelectionChange ignoreHistoryMergeTagChange={false} onChange={handleChange} />
        <FileReferenceMenu files={files} />
        <SkillReferenceMenu skills={skills} commands={commands} />
        <EditorBridge bind={bind} disabled={disabled} value={{ text: defaultValue, blocks: initialBlocks ?? [] }} />
      </div>
    </LexicalComposer>
  );
};

export const ChatEditor = forwardRef(ChatEditorComponent);
