import type { ExtensionUIContribution } from "@/api/extensions";
import type { UIHostContribution } from "./slots";
import { ExtensionView } from "./views/frame-view";

/** Bind the source once. Placement and presentation belong entirely to slot adapters. */
export function bindUIContributions(contributions: readonly ExtensionUIContribution[]): UIHostContribution[] {
  return contributions.map((item) => ({
    key: `plugin:${item.extensionId}/${item.id}`,
    contribution: item,
    renderView: (view, context) => (
      <ExtensionView
        extensionId={item.extensionId}
        contributionId={item.id}
        viewId={view.id}
        revision={item.revision}
        title={"title" in item ? item.title : item.id}
        {...context}
      />
    ),
  }));
}
