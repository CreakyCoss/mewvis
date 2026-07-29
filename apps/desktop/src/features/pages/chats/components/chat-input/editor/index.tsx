import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, type KeyboardEvent, type Ref } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { $createParagraphNode, $createTextNode, $getRoot, CLEAR_EDITOR_COMMAND } from "lexical";
import type { ChatInputFile } from "../type";
import { FileReferenceMenu } from "./file-reference-menu";
import { FileReferenceNode } from "./file-reference-node";
import { serializeChatEditorState, type ChatEditorValue } from "./serialize";

export type ChatEditorHandle = {
  clear: () => void;
  getValue: () => ChatEditorValue;
};

type ChatEditorProps = {
  files: ChatInputFile[];
  defaultValue: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: ChatEditorValue) => void;
};

const EditorBridge = ({ bind, disabled }: { bind: Ref<ChatEditorHandle>; disabled: boolean }) => {
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

  return null;
};

const ChatEditorComponent = (
  { files, defaultValue, placeholder, disabled, onChange }: ChatEditorProps,
  bind: Ref<ChatEditorHandle>,
) => {
  const initialConfig = useMemo(
    () => ({
      namespace: "MewvisChatInput",
      nodes: [FileReferenceNode],
      editable: !disabled,
      theme: {
        paragraph: "m-0",
      },
      editorState: () => {
        const paragraph = $createParagraphNode();
        if (defaultValue) {
          paragraph.append($createTextNode(defaultValue));
        }
        $getRoot().append(paragraph);
      },
      onError: (error: Error) => {
        throw error;
      },
    }),
    [defaultValue, disabled],
  );
  const handleChange = useCallback(
    (editorState: Parameters<typeof serializeChatEditorState>[0]) => {
      onChange(serializeChatEditorState(editorState));
    },
    [onChange],
  );
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.closest("form")?.requestSubmit();
    }
  };

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
              onKeyDown={handleKeyDown}
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
        <EditorBridge bind={bind} disabled={disabled} />
      </div>
    </LexicalComposer>
  );
};

export const ChatEditor = forwardRef(ChatEditorComponent);
