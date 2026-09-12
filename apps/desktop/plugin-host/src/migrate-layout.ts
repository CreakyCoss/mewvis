import { migratePluginLayout } from "./layout-migration.js";

// Invoked by the native startup gate, before any plugin can open its files.
const [root, ...pluginIds] = process.argv.slice(2);
if (!root) throw new Error("Usage: migrate-layout.mjs <plugins-root> [plugin-id ...]");
await migratePluginLayout(root, pluginIds);
