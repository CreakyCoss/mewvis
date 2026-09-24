import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode } from "lexical";

export type SlashReferenceTrigger = {
  nodeKey: string;
  start: number;
  end: number;
  query: string;
  atStart: boolean;
};

// 允许“请使用/技能”连续输入，但不响应 @文件路径和普通英文路径中的斜杠。
const findSlashTrigger = (): SlashReferenceTrigger | null => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== "text") return null;
  const node = selection.anchor.getNode();
  if (!$isTextNode(node) || node.getMode() !== "normal") return null;

  const end = selection.anchor.offset;
  const text = node.getTextContent().slice(0, end);
  const match = /\/([^\s/@，。；,;]*)$/.exec(text);
  if (!match) return null;
  const previousToken = text.slice(0, match.index).match(/[^\s，。；,;]*$/)?.[0] ?? "";
  const previousCharacter = match.index > 0 ? text[match.index - 1] : "";
  if (previousToken.includes("@") || (previousCharacter && /[a-zA-Z0-9._%+-]/.test(previousCharacter))) {
    return null;
  }

  const firstParagraph = $getRoot().getFirstChild();
  const atStart =
    node.getTopLevelElement() === firstParagraph &&
    !text.slice(0, match.index).trim() &&
    !node.getPreviousSiblings().some((sibling) => sibling.getTextContent().trim());

  return { nodeKey: node.getKey(), start: match.index, end, query: match[1], atStart };
};

export const SkillReferenceTrigger = ({ onChange }: { onChange: (trigger: SlashReferenceTrigger | null) => void }) => {
  const [editor] = useLexicalComposerContext();
  const previous = useRef("");

  useEffect(() => {
    const unregister = editor.registerUpdateListener(({ editorState }) => {
      const trigger = editorState.read(findSlashTrigger);
      const signature = trigger
        ? `${trigger.nodeKey}:${trigger.start}:${trigger.end}:${trigger.query}:${trigger.atStart}`
        : "";
      if (signature === previous.current) return;
      previous.current = signature;
      onChange(trigger);
    });
    return () => {
      unregister();
      onChange(null);
    };
  }, [editor, onChange]);

  return null;
};
