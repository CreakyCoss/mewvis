import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { UISlot, UISlotProvider, useUISlotStatus, type UIAdapter } from "../../../src/extensions/slots";
import { uiSlotDefinitions, defineUIContribution } from "@isle/extension-sdk/ui";
import { uiAdapters } from "../../../src/extensions/slots/adapters";

function Status() {
  const status = useUISlotStatus(uiSlotDefinitions.sessionStatus);
  return (
    <output aria-label="slot status">
      {status.support};surfaces={status.surfaces};reason={status.reason ?? "none"}
    </output>
  );
}
function Fixture() {
  const [mode, setMode] = useState<"supported" | "noop" | "unsupported">("supported");
  const [mounted, setMounted] = useState(false);
  const adapter: UIAdapter<"text"> | undefined =
    mode === "unsupported"
      ? undefined
      : mode === "noop"
        ? { type: "text", mode, reason: "fixture no-op" }
        : uiAdapters.text;
  return (
    <UISlotProvider
      adapters={{ text: adapter }}
      contributions={[
        {
          key: "text",
          contribution: defineUIContribution(uiSlotDefinitions.sessionStatus, {
            id: "text",
            text: "Protocol text content",
          }),
          renderView: () => null,
        },
      ]}
    >
      <button onClick={() => setMounted((value) => !value)}>Toggle surface</button>
      <button onClick={() => setMode("supported")}>Supported adapter</button>
      <button onClick={() => setMode("noop")}>No-op adapter</button>
      <button onClick={() => setMode("unsupported")}>Missing adapter</button>
      <Status />
      {mounted ? (
        <UISlot
          definition={uiSlotDefinitions.sessionStatus}
          context={{ workspacePath: "/fixture", chatId: "fixture" }}
        />
      ) : null}
    </UISlotProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
