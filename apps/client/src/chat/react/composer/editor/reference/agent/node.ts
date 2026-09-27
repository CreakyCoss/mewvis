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

export type SerializedAgentReferenceNode = Spread<
  {
    agentId: string;
    name: string;
  },
  SerializedTextNode
>;

// 智能体 ID 保留引用身份；名称用于展示。
export class AgentReferenceNode extends TextNode {
  __agentId: string;
  __name: string;

  $config() {
    return this.config("agent-reference", { extends: TextNode });
  }

  static clone(node: AgentReferenceNode) {
    return new AgentReferenceNode(node.__agentId, node.__name, node.__text, node.__key);
  }

  static importJSON(serializedNode: SerializedAgentReferenceNode) {
    return $createAgentReferenceNode(serializedNode.agentId, serializedNode.name).updateFromJSON(serializedNode);
  }

  constructor(agentId: string, name: string, text?: string, key?: NodeKey) {
    super(text ?? name, key);
    this.__agentId = agentId;
    this.__name = name;
  }

  getAgentId() {
    return this.getLatest().__agentId;
  }

  getName() {
    return this.getLatest().__name;
  }

  exportJSON(): SerializedAgentReferenceNode {
    return {
      ...super.exportJSON(),
      agentId: this.__agentId,
      name: this.__name,
    };
  }

  createDOM(config: EditorConfig) {
    const element = super.createDOM(config);
    element.className =
      "inline rounded-md bg-accent px-1.5 py-0.5 font-medium text-primary ring-1 ring-primary/10 box-decoration-clone";
    element.dataset.agentReference = this.__agentId;
    element.title = this.__name;
    element.spellcheck = false;
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.dataset.agentReference = this.__agentId;
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

export const $createAgentReferenceNode = (agentId: string, name: string) => {
  const node = new AgentReferenceNode(agentId, name);
  node.setMode("segmented").toggleDirectionless();
  return $applyNodeReplacement(node);
};

export const $isAgentReferenceNode = (node: LexicalNode | null | undefined): node is AgentReferenceNode =>
  node instanceof AgentReferenceNode;
