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

export type SerializedSkillReferenceNode = Spread<
  {
    skillKey: string;
    name: string;
  },
  SerializedTextNode
>;

// 技能 key 是引用身份，名称只负责编辑器展示和 prompt 序列化。
export class SkillReferenceNode extends TextNode {
  __skillKey: string;
  __name: string;

  $config() {
    return this.config("skill-reference", { extends: TextNode });
  }

  static clone(node: SkillReferenceNode) {
    return new SkillReferenceNode(node.__skillKey, node.__name, node.__text, node.__key);
  }

  static importJSON(serializedNode: SerializedSkillReferenceNode) {
    return $createSkillReferenceNode(serializedNode.skillKey, serializedNode.name).updateFromJSON(serializedNode);
  }

  constructor(skillKey: string, name: string, text?: string, key?: NodeKey) {
    super(text ?? `/${name}`, key);
    this.__skillKey = skillKey;
    this.__name = name;
  }

  getSkillKey() {
    return this.getLatest().__skillKey;
  }

  getName() {
    return this.getLatest().__name;
  }

  exportJSON(): SerializedSkillReferenceNode {
    return {
      ...super.exportJSON(),
      skillKey: this.__skillKey,
      name: this.__name,
    };
  }

  createDOM(config: EditorConfig) {
    const element = super.createDOM(config);
    element.className =
      "inline rounded-md bg-accent px-1.5 py-0.5 font-medium text-primary ring-1 ring-primary/10 box-decoration-clone";
    element.dataset.skillReference = this.__skillKey;
    element.title = this.__name;
    element.spellcheck = false;
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.dataset.skillReference = this.__skillKey;
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

export const $createSkillReferenceNode = (skillKey: string, name: string) => {
  const node = new SkillReferenceNode(skillKey, name);
  node.setMode("segmented").toggleDirectionless();
  return $applyNodeReplacement(node);
};

export const $isSkillReferenceNode = (node: LexicalNode | null | undefined): node is SkillReferenceNode =>
  node instanceof SkillReferenceNode;
