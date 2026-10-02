import { StrictMode, useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { uiSlotDefinitions, defineUIContribution } from "@mewvis/extension-host/ui";
import {
  ExtensionSlotProvider,
  useExtensionSlotStatus,
  useExtensionSlotContext,
  type UIHostContribution,
} from "@mewvis/extension-host/ui/slots";
import { SidebarSlot } from "@mewvis/extension-host/ui/slots/sidebar";
import { TextSlot } from "@mewvis/extension-host/ui/slots/text";

const sidebar = uiSlotDefinitions.sessionSidebar;
function Status() {
  const status = useExtensionSlotStatus(sidebar);
  return <output aria-label="slot status">surfaces={status.surfaces}</output>;
}
function View({ mount }: { mount(): () => void }) {
  const { chatId } = useExtensionSlotContext(sidebar);
  const [count, setCount] = useState(0);
  useEffect(mount, [mount]);
  return (
    <button aria-label={`view ${chatId}`} onClick={() => setCount((value) => value + 1)}>
      {chatId}: {count}
    </button>
  );
}
function Fixture() {
  const [firstMounted, setFirstMounted] = useState(true);
  const [firstOpen, setFirstOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [session, setSession] = useState("a");
  const [views, setViews] = useState(0);
  const mount = useCallback(() => {
    setViews((count) => count + 1);
    return () => setViews((count) => count - 1);
  }, []);
  const contributions: UIHostContribution[] = enabled
    ? [
        {
          key: "plugin:example/overview",
          contribution: defineUIContribution(sidebar, {
            id: "overview",
            title: "Shared plugin",
            icon: "chart",
            view: { id: "overview" },
          }),
          renderView: () => <View mount={mount} />,
        },
        {
          key: "plugin:example/status",
          contribution: defineUIContribution(uiSlotDefinitions.sessionStatus, {
            id: "status",
            text: "Protocol text content",
            tone: "info",
          }),
        },
      ]
    : [];
  return (
    <ExtensionSlotProvider contributions={contributions}>
      <button onClick={() => setFirstMounted((value) => !value)}>Toggle first surface</button>
      <button onClick={() => setFirstOpen((value) => !value)}>Toggle first view</button>
      <button onClick={() => setEnabled((value) => !value)}>Toggle contribution</button>
      <button onClick={() => setSession((value) => (value === "a" ? "c" : "a"))}>Switch first session</button>
      <Status />
      <output aria-label="view count">views={views}</output>
      <section aria-label="card layout" style={{ border: "1px solid blue", padding: 16 }}>
        {firstMounted ? (
          <SidebarSlot
            definition={sidebar}
            context={{ workspacePath: "/fixture", chatId: session }}
            fallback={<p>Card empty</p>}
            render={({ title, icon, renderView }) => (
              <article data-icon={icon}>
                <h2>{title}</h2>
                {firstOpen ? renderView() : null}
              </article>
            )}
          />
        ) : null}
        <TextSlot
          definition={uiSlotDefinitions.sessionStatus}
          context={{ workspacePath: "/fixture", chatId: session }}
          render={({ text, tone }) => <mark data-tone={tone}>{text}</mark>}
        />
      </section>
      <section aria-label="details layout" style={{ border: "1px solid green", marginTop: 16 }}>
        <SidebarSlot
          definition={sidebar}
          context={{ workspacePath: "/fixture", chatId: "b" }}
          renderAll={({ items }) => (
            <div>
              {items.length ? (
                items.map(({ key, title, renderView }) => (
                  <details key={key} open>
                    <summary>{title}</summary>
                    {renderView()}
                  </details>
                ))
              ) : (
                <p>Details empty</p>
              )}
            </div>
          )}
        />
      </section>
    </ExtensionSlotProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
