import { $getRoot, $isElementNode, $isLineBreakNode, $isTextNode, type EditorState, type LexicalNode } from "lexical";
import type { ChatInputSubmitBlock } from "@/chat/react/types";
import { $isFileReferenceNode } from "./reference/file/node";
import { $isSkillReferenceNode } from "./reference/skill/node";

export type ChatEditorValue = {
  text: string;
  blocks: ChatInputSubmitBlock[];
};

export const emptyChatEditorValue: ChatEditorValue = {
  text: "",
  blocks: [],
};

const formatFileReference = (path: string) => (/[\s，。；,;]/.test(path) ? `@"${path}"` : `@${path}`);

const appendText = (blocks: ChatInputSubmitBlock[], content: string) => {
  const previousBlock = blocks.at(-1);
  if (previousBlock?.type === "text") {
    previousBlock.content += content;
  } else {
    blocks.push({ type: "text", content });
  }
};

const serializeNode = (node: LexicalNode, blocks: ChatInputSubmitBlock[]) => {
  if ($isFileReferenceNode(node)) {
    blocks.push({ type: "file-reference", path: node.getPath() });
    return;
  }

  if ($isSkillReferenceNode(node)) {
    blocks.push({ type: "skill-reference", skillKey: node.getSkillKey(), name: node.getName() });
    return;
  }

  if ($isLineBreakNode(node)) {
    appendText(blocks, "\n");
    return;
  }

  if ($isTextNode(node)) {
    appendText(blocks, node.getTextContent());
    return;
  }

  if ($isElementNode(node)) {
    node.getChildren().forEach((child) => serializeNode(child, blocks));
  }
};

const normalizeBlockEdges = (blocks: ChatInputSubmitBlock[]) => {
  const normalized = blocks.map((block) => ({ ...block }));
  const firstBlock = normalized[0];
  const lastBlock = normalized.at(-1);

  if (firstBlock?.type === "text") {
    firstBlock.content = firstBlock.content.trimStart();
  }
  if (lastBlock?.type === "text") {
    lastBlock.content = lastBlock.content.trimEnd();
  }

  return normalized.filter((block) => block.type !== "text" || block.content.length > 0);
};

export const serializeChatEditorState = (editorState: EditorState): ChatEditorValue =>
  editorState.read(() => {
    const blocks: ChatInputSubmitBlock[] = [];
    const rootChildren = $getRoot().getChildren();

    rootChildren.forEach((child, index) => {
      serializeNode(child, blocks);
      if (index < rootChildren.length - 1) {
        appendText(blocks, "\n");
      }
    });

    const normalizedBlocks = normalizeBlockEdges(blocks);
    return {
      blocks: normalizedBlocks,
      text: normalizedBlocks
        .map((block) => {
          if (block.type === "file-reference") {
            return formatFileReference(block.path);
          }
          if (block.type === "skill-reference") {
            return `/${block.name}`;
          }
          return block.content;
        })
        .join(""),
    };
  });
