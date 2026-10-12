import { createElement } from "react";
import { FilePreview, FilePreviewDialog } from "@mewvis/app-sdk/files/react";
import {
  getApplicationFileClient,
  type ApplicationFileTransport,
} from "@mewvis/app-sdk/files";
import type { ApplicationBrowserHost } from "@mewvis/app-sdk/browser";
import type { ApplicationDataTransport } from "@mewvis/app-sdk/data";
import {
  getApplicationViewClient,
  mountApplicationView,
} from "@mewvis/app-sdk/views";

const transport: ApplicationDataTransport = {
  version: 1,
  request: async () => ({ ok: true, value: null }),
};
const browserData: ApplicationBrowserHost["data"] = transport;
void browserData;

function owner(container: HTMLDivElement) {
  const view = mountApplicationView(container, {
    id: "ledger",
    title: "Ledger",
    script: "",
    methods: {
      echo(params, { viewId, signal }) {
        const cancellation: AbortSignal = signal;
        cancellation.throwIfAborted();
        return { viewId, params };
      },
      // @ts-expect-error Method handlers must return JSON, including null for void operations.
      bad: () => undefined,
    },
  });
  void view.ready;
  view.postMessage({ selected: true });
  view.dispose();
  const child = getApplicationViewClient();
  void child.request("echo", { value: 1 });
  // @ts-expect-error An embedded view does not inherit application tools.
  child.executeTool("host-tool");
  // @ts-expect-error JSON arguments cannot contain functions.
  void child.request("echo", { value: () => true });
}
void owner;

const fileTransport: ApplicationFileTransport = {
  version: 1,
  request: async () => ({ ok: true, value: null }),
};
const hostFiles: ApplicationBrowserHost["files"] = fileTransport;
void hostFiles;
const files = getApplicationFileClient();
void files.writeText("/project/config.json", "{}", { overwrite: true });
void files.preview.openDialog({ filePath: "/project/image.png" });
// @ts-expect-error Binary writes accept bytes, not strings.
void files.writeBinary("/project/image.png", "data");
void files.preview.openDialog({
  filePath: "/project/image.png",
  // @ts-expect-error File access does not accept a caller-controlled application identity.
  applicationId: "other",
});

void createElement(FilePreview, {
  filePath: "/project/image.png",
  style: { height: 360 },
});
void createElement(FilePreviewDialog, {
  filePath: "/project/image.png",
  open: true,
});
void createElement(FilePreview, {
  filePath: "/project/image.png",
  // @ts-expect-error Application preview identity comes from the owning host, not component props.
  applicationId: "other",
});

function plainPreview(container: HTMLDivElement) {
  void files.preview.open(container, { filePath: "/project/image.png" });
}
void plainPreview;
