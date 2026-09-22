import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { defineUIContribution, uiSlotDefinitions, uiSlotTypes, type UISlotDefinition } from "@isle/extension-sdk/ui";
import {
  UISlot,
  UISlotProvider,
  useUISlotStatus,
  useUISlotContext,
  type UIHostContribution,
} from "../../src/extensions/slots";
import { createUIAdapters, defineUIAdapter } from "../../src/extensions/slots/adapter";
import textAdapter, { TextSlotAdapter } from "../../src/extensions/slots/adapters/text.adapter";

const context = { workspacePath: "/test", chatId: "a" };
const { sessionSidebar: sidebar, sessionStatus: status } = uiSlotDefinitions;
const contributions: UIHostContribution[] = [
  {
    key: "text",
    contribution: defineUIContribution(status, { id: "text", text: "<script>unsafe()</script>" }),
    renderView: () => null,
  },
  {
    key: "panel",
    contribution: defineUIContribution(sidebar, {
      id: "panel",
      title: "Panel",
      icon: "chart",
      view: { id: "overview" },
    }),
    renderView() {
      throw Error("unmounted view executed");
    },
  },
];
function Diagnostic({ definition }: { definition: UISlotDefinition }) {
  return <output>{JSON.stringify(useUISlotStatus(definition))}</output>;
}

test("missing/no-op adapters never execute contributions", () => {
  for (const registrations of [[], [defineUIAdapter(uiSlotTypes.sidebar, { mode: "noop", reason: "Unavailable" })]]) {
    const adapters = createUIAdapters(registrations);
    const html = renderToStaticMarkup(
      <UISlotProvider adapters={adapters} contributions={contributions}>
        <UISlot definition={sidebar} context={context} />
        <Diagnostic definition={sidebar} />
      </UISlotProvider>,
    );
    assert.match(html, adapters.sidebar ? /noop/ : /unsupported/);
    assert.doesNotMatch(html, /&quot;supported&quot;/);
  }
});

test("an adapter without a mounted slot does not run", () => {
  let renders = 0;
  const html = renderToStaticMarkup(
    <UISlotProvider
      adapters={createUIAdapters([
        defineUIAdapter(uiSlotTypes.text, {
          mode: "supported",
          component() {
            renders++;
            return null;
          },
        }),
      ])}
      contributions={contributions}
    >
      <Diagnostic definition={status} />
    </UISlotProvider>,
  );
  assert.equal(renders, 0);
  assert.match(html, /supported/);
  assert.match(html, /surfaces&quot;:0/);
});

test("adapters receive matching contributions and escaped text, including page-local entries", () => {
  const html = renderToStaticMarkup(
    <UISlotProvider adapters={createUIAdapters([textAdapter])} contributions={contributions}>
      <UISlot
        definition={status}
        context={context}
        contributions={[
          {
            key: "local",
            contribution: defineUIContribution(status, { id: "local", text: "Local" }),
            renderView: () => null,
          },
        ]}
      />
    </UISlotProvider>,
  );
  assert.match(html, /Local/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|Panel/);
});

test("registry rejects duplicate types and undocumented no-op degradation", () => {
  assert.throws(() => createUIAdapters([textAdapter, textAdapter]), /Duplicate/);
  assert.throws(() => createUIAdapters([defineUIAdapter(uiSlotTypes.text, { mode: "noop", reason: " " })]), /reason/);
});

test("views obtain their target from the mounted surface", () => {
  function View() {
    return <output>{JSON.stringify(useUISlotContext(sidebar))}</output>;
  }
  const adapter = defineUIAdapter(uiSlotTypes.sidebar, { mode: "supported", component: () => <View /> });
  const html = renderToStaticMarkup(
    <UISlotProvider adapters={createUIAdapters([adapter])} contributions={[]}>
      <UISlot definition={sidebar} context={context} />
    </UISlotProvider>,
  );
  assert.match(html, /&quot;chatId&quot;:&quot;a&quot;/);
  assert.throws(() => renderToStaticMarkup(<View />), /context unavailable/);
});

// Compile-time checks: no raw key, missing metadata, mismatched payload or adapter renderer.
if (false) {
  // @ts-expect-error the shared definition is required
  defineUIContribution("session.sidebar", { id: "x", title: "X" });
  // @ts-expect-error sidebar requires icon and view
  defineUIContribution(sidebar, { id: "x", title: "X" });
  // @ts-expect-error a text slot cannot receive sidebar data
  defineUIContribution(status, { id: "x", title: "X", icon: "chart", view: { id: "x" } });
  defineUIAdapter(uiSlotTypes.sidebar, {
    mode: "supported",
    // @ts-expect-error a type definition constrains the adapter renderer
    component: TextSlotAdapter,
  });
}
