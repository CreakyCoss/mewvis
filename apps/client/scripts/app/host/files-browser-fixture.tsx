import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ApplicationFrame } from "../../../src/workbench/pages/applications/application-frame";
import { FilePreview, FilePreviewHost } from "../../../src/workbench/shell/files";
const fixture = (
  window as unknown as {
    fileFixture: {
      application: Parameters<typeof ApplicationFrame>[0]["application"];
      script: string;
      style?: string;
      playground?: boolean;
      inlinePaths: Record<string, string>;
    };
  }
).fileFixture;
const chatHost = {
  connect: () => ({
    dispose() {},
    request: async () => {
      throw new Error("chat unavailable");
    },
  }),
} as unknown as Parameters<typeof ApplicationFrame>[0]["chatHost"];
const loadDocument = async () => ({
  script: fixture.script,
  style:
    fixture.style ??
    "body{padding:24px;font:14px/1.6 system-ui}button{margin:5px;padding:8px 14px;border:1px solid #ccc;border-radius:6px}pre{white-space:pre-wrap}",
});
function Fixture() {
  const [filePath, setFilePath] = useState("");
  return (
    <>
      <div style={{ height: "100vh" }}>
        <ApplicationFrame application={fixture.application} chatHost={chatHost} loadDocument={loadDocument} />
      </div>
      {!fixture.playground && (
        <section aria-label="内嵌文件预览" style={{ padding: 24 }}>
          <h2>页面内预览</h2>
          {Object.entries(fixture.inlinePaths).map(([name, path]) => (
            <button key={name} onClick={() => setFilePath(path)}>
              {name}
            </button>
          ))}
          <button onClick={() => setFilePath("")}>关闭内嵌预览</button>
          <div style={{ height: 440, border: "1px solid #ddd", padding: 16 }}>
            {filePath && <FilePreview filePath={filePath} applicationId={fixture.application.id} />}
          </div>
        </section>
      )}
      <FilePreviewHost />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
