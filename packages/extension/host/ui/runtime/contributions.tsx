import type { ExtensionUIContribution } from "../protocol/transport";
import type { UIHostContribution } from "../slots/index";
import { ExtensionView } from "../views/frame-view";

/** Bind the source once. Placement and presentation belong entirely to the page. */
export function bindUIContributions(
  contributions: readonly ExtensionUIContribution[],
): UIHostContribution[] {
  return contributions.map((item) => {
    const key = `plugin:${item.extensionId}/${item.id}`;
    const title = "title" in item ? item.title : item.id;
    if (!("view" in item)) return { key, contribution: item };
    return {
      key,
      contribution: item,
      renderView: (view, context) => (
        <ExtensionView
          extensionId={item.extensionId}
          contributionId={item.id}
          viewId={view.id}
          revision={item.revision}
          title={title}
          {...context}
        />
      ),
    } as UIHostContribution;
  });
}
