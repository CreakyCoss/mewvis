import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { defineUIContribution, uiSlotDefinitions, type UISlotDefinition } from "@isle/extension-sdk/ui";
import {
  ExtensionSlot,
  ExtensionSlotProvider,
  useExtensionSlotStatus,
  useExtensionSlotContext,
  type UIHostContribution,
} from "../../src/extensions/slots";
import { SidebarSlot, type SidebarSlotItem } from "../../src/extensions/slots/sidebar";
import { TextSlot } from "../../src/extensions/slots/text";

const context = { workspacePath: "/test", chatId: "a" };
const { sessionSidebar: sidebar, sessionStatus: status } = uiSlotDefinitions;
const text = {
  key: "plugin:text",
  contribution: defineUIContribution(status, { id: "text", text: "<script>unsafe()</script>", tone: "info" }),
};
const panel: UIHostContribution = {
  key: "plugin:panel",
  contribution: defineUIContribution(sidebar, { id: "panel", title: "Panel", icon: "chart", view: { id: "overview" } }),
  renderView() {
    throw Error("unmounted view executed");
  },
};
const contributions = [text, panel];
function Diagnostic({ definition }: { definition: UISlotDefinition }) {
  return <output>{JSON.stringify(useExtensionSlotStatus(definition))}</output>;
}

test("publishing contributions alone never loads views or renders a layout", () => {
  const html = renderToStaticMarkup(
    <ExtensionSlotProvider contributions={contributions}>
      <Diagnostic definition={sidebar} />
    </ExtensionSlotProvider>,
  );
  assert.match(html, /surfaces&quot;:0/);
  assert.doesNotMatch(html, /Panel|<aside|<nav/);
});

test("SidebarSlot supplies complete metadata while the caller decides whether to open a view", () => {
  let item: SidebarSlotItem | undefined;
  const html = renderToStaticMarkup(
    <ExtensionSlotProvider contributions={contributions}>
      <SidebarSlot
        definition={sidebar}
        context={context}
        render={(value) => {
          item = value;
          return <button title={value.icon}>{value.title}</button>;
        }}
      />
    </ExtensionSlotProvider>,
  );
  assert.equal(item?.key, "plugin:panel");
  assert.equal(item?.view.id, "overview");
  assert.equal(typeof item?.renderView, "function");
  assert.equal(html, '<button title="chart">Panel</button>');
});

test("the same contribution renders in different layouts with separately scoped views", () => {
  const targets: string[] = [];
  const entry = {
    ...panel,
    renderView: (_view: unknown, target: typeof context) => {
      targets.push(target.chatId);
      return <small>{target.chatId}</small>;
    },
  };
  const html = renderToStaticMarkup(
    <ExtensionSlotProvider contributions={[entry]}>
      <SidebarSlot
        definition={sidebar}
        context={context}
        render={({ title, renderView }) => (
          <article>
            <h2>{title}</h2>
            {renderView()}
          </article>
        )}
      />
      <SidebarSlot
        definition={sidebar}
        context={{ ...context, chatId: "b" }}
        render={({ title, renderView }) => (
          <details>
            <summary>{title}</summary>
            {renderView()}
          </details>
        )}
      />
    </ExtensionSlotProvider>,
  );
  assert.deepEqual(targets, ["a", "b"]);
  assert.match(html, /<article><h2>Panel<\/h2><small>a<\/small><\/article>/);
  assert.match(html, /<details><summary>Panel<\/summary><small>b<\/small><\/details>/);
});

test("TextSlot reads host contributions and exposes structured fields without adding markup", () => {
  const html = renderToStaticMarkup(
    <ExtensionSlotProvider contributions={contributions}>
      <TextSlot
        definition={status}
        context={context}
        render={({ text, tone }) => <mark data-tone={tone}>{text}</mark>}
      />
    </ExtensionSlotProvider>,
  );
  assert.equal(html, '<mark data-tone="info">&lt;script&gt;unsafe()&lt;/script&gt;</mark>');
  assert.doesNotMatch(html, /<script>|Panel|role="status"/);
});

test("renderAll owns collection layout, including errors and empty states", () => {
  const html = renderToStaticMarkup(
    <ExtensionSlotProvider contributions={contributions} error="catalog unavailable">
      <SidebarSlot
        definition={sidebar}
        context={context}
        renderAll={({ items, error }) => (
          <section>
            <strong>{items.length}</strong>
            <p>{error}</p>
            {items.map((item) => (
              <button key={item.key}>{item.title}</button>
            ))}
          </section>
        )}
      />
    </ExtensionSlotProvider>,
  );
  assert.equal(html, "<section><strong>1</strong><p>catalog unavailable</p><button>Panel</button></section>");
  const empty = renderToStaticMarkup(
    <ExtensionSlotProvider contributions={[]}>
      <SidebarSlot
        definition={sidebar}
        context={context}
        renderAll={({ items }) => <p>{items.length ? "present" : "empty"}</p>}
      />
    </ExtensionSlotProvider>,
  );
  assert.equal(empty, "<p>empty</p>");
});

test("generic ExtensionSlot retains inferred fields, fallback and caller-owned error rendering", () => {
  const html = renderToStaticMarkup(
    <ExtensionSlotProvider contributions={contributions}>
      <ExtensionSlot definition={status} context={context} render={({ text }) => <i>{text}</i>} />
    </ExtensionSlotProvider>,
  );
  assert.equal(html, "<i>&lt;script&gt;unsafe()&lt;/script&gt;</i>");
  const empty = renderToStaticMarkup(
    <ExtensionSlotProvider contributions={[]} error="Unavailable">
      <ExtensionSlot
        definition={sidebar}
        context={context}
        render={() => {
          throw Error("unexpected render");
        }}
        fallback={<p>Empty</p>}
        renderError={(error) => <em>{error}</em>}
      />
    </ExtensionSlotProvider>,
  );
  assert.equal(empty, "<em>Unavailable</em><p>Empty</p>");
});

test("view components can read the mounted surface context", () => {
  function View() {
    return <output>{JSON.stringify(useExtensionSlotContext(sidebar))}</output>;
  }
  const html = renderToStaticMarkup(
    <ExtensionSlotProvider contributions={[{ ...panel, renderView: () => <View /> }]}>
      <SidebarSlot definition={sidebar} context={context} render={({ renderView }) => renderView()} />
    </ExtensionSlotProvider>,
  );
  assert.match(html, /&quot;chatId&quot;:&quot;a&quot;/);
  assert.throws(() => renderToStaticMarkup(<View />), /context unavailable/);
});

// Compile-time contracts: definitions constrain payloads and the concrete slot's render signature.
if (false) {
  // @ts-expect-error the shared definition is required
  defineUIContribution("session.sidebar", { id: "x", title: "X" });
  // @ts-expect-error sidebar requires icon and view
  defineUIContribution(sidebar, { id: "x", title: "X" });
  // @ts-expect-error the text definition cannot be passed to SidebarSlot
  <SidebarSlot definition={status} context={context} render={() => null} />;
  // @ts-expect-error the sidebar definition cannot be passed to TextSlot
  <TextSlot definition={sidebar} context={context} render={() => null} />;
  // @ts-expect-error contributions come from the host, even when correctly typed
  <ExtensionSlot definition={status} context={context} contributions={[text]} render={() => null} />;
  // @ts-expect-error concrete sidebar slots cannot receive page contributions
  <SidebarSlot definition={sidebar} context={context} contributions={[panel]} render={() => null} />;
  // @ts-expect-error concrete text slots cannot receive page contributions
  <TextSlot definition={status} context={context} contributions={[text]} render={() => null} />;
  // @ts-expect-error a renderer is mandatory
  <SidebarSlot definition={sidebar} context={context} />;
  // @ts-expect-error render and renderAll are mutually exclusive
  <SidebarSlot definition={sidebar} context={context} render={() => null} renderAll={() => null} />;
  <TextSlot
    definition={status}
    context={context}
    render={(item) => {
      // @ts-expect-error data-only contributions do not have renderView
      item.renderView();
      // @ts-expect-error text has no sidebar title
      return item.title;
    }}
  />;
  <ExtensionSlot
    definition={sidebar}
    context={context}
    render={(item) => {
      const title: string = item.title;
      const icon: "chart" | "files" | "git-branch" | "activity" | "puzzle" | "info" = item.icon;
      // @ts-expect-error the generic slot retains the sidebar payload, without text fields
      item.text;
      return (
        <div title={icon}>
          {title}
          {item.renderView()}
        </div>
      );
    }}
  />;
}
