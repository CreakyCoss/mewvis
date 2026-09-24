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

export type SerializedCommandReferenceNode = Spread<
  {
    commandId: string;
    name: string;
  },
  SerializedTextNode
>;

// 显示名称与命令路由分离；序列化执行时使用 commandId。
export class CommandReferenceNode extends TextNode {
  __commandId: string;
  __name: string;

  $config() {
    return this.config("command-reference", { extends: TextNode });
  }

  static clone(node: CommandReferenceNode) {
    return new CommandReferenceNode(node.__commandId, node.__name, node.__text, node.__key);
  }

  static importJSON(serializedNode: SerializedCommandReferenceNode) {
    return $createCommandReferenceNode(serializedNode.commandId, serializedNode.name).updateFromJSON(serializedNode);
  }

  constructor(commandId: string, name: string, text?: string, key?: NodeKey) {
    super(text ?? `/${name}`, key);
    this.__commandId = commandId;
    this.__name = name;
  }

  getCommandId() {
    return this.getLatest().__commandId;
  }

  getName() {
    return this.getLatest().__name;
  }

  exportJSON(): SerializedCommandReferenceNode {
    return {
      ...super.exportJSON(),
      commandId: this.__commandId,
      name: this.__name,
    };
  }

  createDOM(config: EditorConfig) {
    const element = super.createDOM(config);
    element.className =
      "inline rounded-md bg-accent px-1.5 py-0.5 font-medium text-primary ring-1 ring-primary/10 box-decoration-clone";
    element.dataset.commandReference = this.__commandId;
    element.title = this.__name;
    element.spellcheck = false;
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.dataset.commandReference = this.__commandId;
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

export const $createCommandReferenceNode = (commandId: string, name: string) => {
  const node = new CommandReferenceNode(commandId, name);
  node.setMode("token").toggleDirectionless();
  return $applyNodeReplacement(node);
};

export const $isCommandReferenceNode = (node: LexicalNode | null | undefined): node is CommandReferenceNode =>
  node instanceof CommandReferenceNode;
