import assert from "node:assert/strict";
import test from "node:test";
import { createEditor, $getRoot, $createParagraphNode, $createTextNode } from "lexical";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CommandReferenceNode,
  $createCommandReferenceNode,
} from "../../src/chat/react/composer/editor/reference/command/node";
import { serializeChatEditorState } from "../../src/chat/react/composer/editor/serialize";
import { UserBlocks } from "../../src/chat/react/messages/block/user";

test("command references retain display names across draft restoration while dispatching stable IDs", () => {
  const editor = createEditor({
    namespace: "command-test",
    nodes: [CommandReferenceNode],
    onError(error) {
      throw error;
    },
  });
  editor.update(
    () => {
      $getRoot().append(
        $createParagraphNode().append(
          $createCommandReferenceNode("mewvis.collaboration/pause_test", "暂停测试"),
          $createTextNode(" 设计一个方案"),
        ),
      );
    },
    { discrete: true },
  );
  const value = serializeChatEditorState(editor.getEditorState());
  assert.equal(value.text, "/mewvis.collaboration/pause_test 设计一个方案");
  assert.deepEqual(value.blocks[0], {
    type: "command-reference",
    commandId: "mewvis.collaboration/pause_test",
    name: "暂停测试",
  });
  const snapshot = JSON.stringify(editor.getEditorState().toJSON());
  editor.setEditorState(editor.parseEditorState(snapshot));
  assert.deepEqual(serializeChatEditorState(editor.getEditorState()), value);
  assert.equal(
    editor.getEditorState().read(() => $getRoot().getTextContent()),
    "/暂停测试 设计一个方案",
  );
  const html = renderToStaticMarkup(
    <UserBlocks blocks={value.blocks.map((block, i) => ({ ...block, id: String(i) }))} />,
  );
  assert.match(html, /暂停测试/);
  assert.doesNotMatch(html, /pause_test|mewvis.collaboration/);
});
