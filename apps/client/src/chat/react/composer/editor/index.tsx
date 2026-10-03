import { APP_DISPLAY_NAME } from "@mewvis/product-config";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, type Ref } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  $nodesOfType,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  CLEAR_EDITOR_COMMAND,
} from "lexical";
import type { ChatInputFile } from "@/chat/react/types";
import { FileReferenceMenu } from "./reference/file";
import { $createFileReferenceNode, FileReferenceNode } from "./reference/file/node";
import { $createCommandReferenceNode, CommandReferenceNode } from "./reference/command/node";
import { SkillReferenceTrigger, type SlashReferenceTrigger } from "./reference/skill";
import type { ReferenceEntry } from "./reference/skill/options";
import { $createSkillReferenceNode, SkillReferenceNode } from "./reference/skill/node";
import { $createAgentReferenceNode, AgentReferenceNode } from "./reference/agent/node";
import { serializeChatEditorState, type ChatEditorValue } from "./serialize";

export type ChatEditorHandle = {
  clear: () => void;
  getValue: () => ChatEditorValue;
  insertReference: (entry: ReferenceEntry, trigger?: SlashReferenceTrigger) => void;
  canInsertCommandAtSelection: () => boolean;
};

type ChatEditorProps = {
  files: ChatInputFile[];
  defaultValue: string;
  initialBlocks?: import("@/chat/core").MessagePart[];
  placeholder: string;
  disabled: boolean;
  onChange: (value: ChatEditorValue) => void;
  onSlashTriggerChange?: (trigger: SlashReferenceTrigger | null) => void;
};

const restoreContent = (value: ChatEditorValue) => {
  const paragraph = $createParagraphNode();
  if (value.blocks.length) {
    for (const block of value.blocks)
      paragraph.append(
        block.type === "file-reference"
          ? $createFileReferenceNode(block.path, block.path.split(/[\\/]/).pop() ?? block.path)
          : block.type === "command-reference"
            ? $createCommandReferenceNode(block.commandId, block.name)
            : block.type === "agent-reference"
              ? $createAgentReferenceNode(block.agentId, block.name)
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
      canInsertCommandAtSelection: () =>
        editor.getEditorState().read(() => {
          const root = $getRoot();
          const first = root.getFirstChild();
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !$isElementNode(first)) return !root.getTextContent().trim();
          const anchor = selection.anchor.getNode();
          if (anchor.getTopLevelElement() !== first) return false;
          if (anchor === first) return selection.anchor.offset === 0;
          for (const child of first.getChildren()) {
            if (child === anchor) return !child.getTextContent().slice(0, selection.anchor.offset).trim();
            if (child.getTextContent().trim()) return false;
          }
          return false;
        }),
      insertReference: (entry, trigger) => {
        editor.focus(() => {
          editor.update(() => {
            const selection = $getSelection();
            const range = $isRangeSelection(selection) ? selection : $getRoot().selectEnd();
            if (trigger) {
              const node = $getNodeByKey(trigger.nodeKey);
              if (!$isTextNode(node) || node.getTextContent().slice(trigger.start, trigger.end) !== `/${trigger.query}`)
                return;
              const end = trigger.end + Number(node.getTextContent()[trigger.end] === " ");
              range.setTextNodeRange(node, trigger.start, node, end);
            }
            const referenceNode =
              entry.kind === "command"
                ? $createCommandReferenceNode(entry.commandId, entry.name)
                : entry.kind === "agent"
                  ? $createAgentReferenceNode(entry.agentId, entry.name)
                  : $createSkillReferenceNode(entry.skillKey, entry.name);
            const trailingSpace = $createTextNode(" ");
            range.insertNodes([referenceNode, trailingSpace]);
            if (entry.kind === "agent")
              $nodesOfType(AgentReferenceNode)
                .filter((node) => node !== referenceNode)
                .forEach((node) => node.remove());
            trailingSpace.selectEnd();
          });
        });
      },
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
  { files, defaultValue, initialBlocks, placeholder, disabled, onChange, onSlashTriggerChange }: ChatEditorProps,
  bind: Ref<ChatEditorHandle>,
) => {
  const initialConfig = useMemo(
    () => ({
      namespace: `${APP_DISPLAY_NAME}ChatInput`,
      nodes: [FileReferenceNode, SkillReferenceNode, CommandReferenceNode, AgentReferenceNode],
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
        {onSlashTriggerChange && <SkillReferenceTrigger onChange={onSlashTriggerChange} />}
        <EditorBridge bind={bind} disabled={disabled} value={{ text: defaultValue, blocks: initialBlocks ?? [] }} />
      </div>
    </LexicalComposer>
  );
};

export const ChatEditor = forwardRef(ChatEditorComponent);
