import {
  $applyNodeReplacement,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from "lexical";

export type SerializedFileReferenceNode = Spread<
  {
    path: string;
    name: string;
  },
  SerializedTextNode
>;

// 基于 Lexical 官方 MentionNode：路径是引用身份，文本只负责编辑器内展示。
export class FileReferenceNode extends TextNode {
  __path: string;
  __name: string;

  $config() {
    return this.config("file-reference", { extends: TextNode });
  }

  static clone(node: FileReferenceNode) {
    return new FileReferenceNode(node.__path, node.__name, node.__text, node.__key);
  }

  static importJSON(serializedNode: SerializedFileReferenceNode) {
    return $createFileReferenceNode(serializedNode.path, serializedNode.name).updateFromJSON(serializedNode);
  }

  constructor(path: string, name: string, text?: string, key?: NodeKey) {
    super(text ?? `@${name}`, key);
    this.__path = path;
    this.__name = name;
  }

  getPath() {
    return this.getLatest().__path;
  }

  getName() {
    return this.getLatest().__name;
  }

  exportJSON(): SerializedFileReferenceNode {
    return {
      ...super.exportJSON(),
      path: this.__path,
      name: this.__name,
    };
  }

  createDOM(config: EditorConfig) {
    const element = super.createDOM(config);
    element.className =
      "inline rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary ring-1 ring-primary/15 box-decoration-clone";
    element.dataset.fileReference = this.__path;
    element.title = this.__path;
    element.spellcheck = false;
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.dataset.fileReference = this.__path;
    element.textContent = this.__text;
    return { element };
  }

  isTextEntity(): true {
    return true;
  }

  canInsertTextBefore() {
    return false;
  }

  canInsertTextAfter() {
    return false;
  }
}

export const $createFileReferenceNode = (path: string, name: string) => {
  const node = new FileReferenceNode(path, name);
  node.setMode("segmented").toggleDirectionless();
  return $applyNodeReplacement(node);
};

export const $isFileReferenceNode = (node: LexicalNode | null | undefined): node is FileReferenceNode =>
  node instanceof FileReferenceNode;
