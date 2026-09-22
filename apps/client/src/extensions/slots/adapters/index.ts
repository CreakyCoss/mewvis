import { createUIAdapters, type UIAdapterRegistration } from "../adapter";

/** Adding an adapter module is sufficient; pages decide where its surfaces mount. */
const modules = import.meta.glob<UIAdapterRegistration>("./*.adapter.tsx", { eager: true, import: "default" });
export const uiAdapters = createUIAdapters(Object.values(modules));
