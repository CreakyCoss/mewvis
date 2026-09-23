import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { defineUIContribution, uiSlotDefinitions } from "@isle/extension-sdk/ui";
import { ExtensionSlotProvider } from "../../src/extensions/slots";
import { SidebarSlot } from "../../src/extensions/slots/sidebar";
import { ChatPanels, ChatPanel } from "../../src/workbench/pages/chats/panels/layout";

function UnselectedView(): never {
  throw new Error("unselected content was mounted");
}

test("one declaration supplies each button without mounting closed content", () => {
  const html = renderToStaticMarkup(
    <ChatPanels defaultValue="arbitrary">
      <ChatPanel value="arbitrary" title="Native" icon={<span>Native icon</span>}>
        <UnselectedView />
      </ChatPanel>
      <ChatPanel value="lazy" title="Lazy" icon={<span>Lazy icon</span>}>
        {UnselectedView}
      </ChatPanel>
    </ChatPanels>,
  );
  assert.doesNotMatch(html, /<aside/);
  assert.equal((html.match(/aria-label="显示Native"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-label="显示Lazy"/g) ?? []).length, 1);
  assert.match(html, /Native icon/);
  assert.match(html, /Lazy icon/);
  assert.doesNotMatch(html, /aria-pressed="true"/);
});

test("selection accepts arbitrary values and remains independent across panel groups", () => {
  const html = renderToStaticMarkup(
    <>
      <ChatPanels defaultValue="custom" defaultOpen>
        <ChatPanel value="custom" title="First" icon="A">
          First content
        </ChatPanel>
        <ChatPanel value="other" title="Inactive" icon="B">
          <UnselectedView />
        </ChatPanel>
      </ChatPanels>
      <ChatPanels defaultValue="other" defaultOpen>
        <ChatPanel value="custom" title="Also inactive" icon="C">
          <UnselectedView />
        </ChatPanel>
        <ChatPanel value="other" title="Second" icon="D">
          Second content
        </ChatPanel>
      </ChatPanels>
    </>,
  );
  assert.match(html, /aria-label="显示First" aria-pressed="true"/);
  assert.match(html, /aria-label="显示Second" aria-pressed="true"/);
  assert.match(html, /aria-label="显示Inactive" aria-pressed="false"/);
  assert.match(html, /aria-label="显示Also inactive" aria-pressed="false"/);
});

test("one slot supplies plugin buttons alongside native panels without evaluating plugin views", () => {
  const definition = uiSlotDefinitions.sessionSidebar;
  const contributions = [
    {
      key: "plugin:test/panel",
      contribution: defineUIContribution(definition, {
        id: "panel",
        title: "Plugin",
        icon: "chart",
        view: { id: "view" },
      }),
      renderView: UnselectedView,
    },
  ];
  const html = renderToStaticMarkup(
    <ExtensionSlotProvider contributions={contributions} error="catalog error">
      <ChatPanels defaultValue="native">
        <ChatPanel value="native" title="Native" icon="Native icon">
          <UnselectedView />
        </ChatPanel>
        <SidebarSlot
          definition={definition}
          context={{ workspacePath: "/test", chatId: "a" }}
          renderError={(error) => <span role="alert">{error}</span>}
          render={({ key, title, icon, renderView }) => (
            <ChatPanel value={key} title={title} icon={<span>{icon}</span>}>
              {renderView}
            </ChatPanel>
          )}
        />
      </ChatPanels>
    </ExtensionSlotProvider>,
  );
  assert.equal((html.match(/aria-label="显示Plugin"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-label="显示Native"/g) ?? []).length, 1);
  assert.match(html, /<span>chart<\/span>/);
  assert.match(html, /role="alert">catalog error/);
  assert.doesNotMatch(html, /<aside/);
});
