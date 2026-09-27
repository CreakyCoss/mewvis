import type { ApplicationUiApplication } from "@/api/applications";

export const usesApplicationWorkspace = (application: ApplicationUiApplication | undefined): boolean =>
  Boolean(
    application &&
    !application.error &&
    !application.uiError &&
    application.ui?.kind === "sandbox" &&
    (application.source === "bundled" || application.ui.layout === "full" || application.ui.layout === "fullscreen"),
  );
