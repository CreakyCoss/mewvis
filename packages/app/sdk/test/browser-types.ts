import type { ApplicationBrowserHost } from "@isle/app-sdk/browser";
import type { ApplicationDataTransport } from "@isle/app-sdk/data";
import {
  getApplicationViewClient,
  mountApplicationView,
} from "@isle/app-sdk/views";

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
