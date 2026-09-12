import { migrateApplicationLayout } from "./layout-migration.js";

// Invoked by the native startup gate, before any application can open its files.
const [root, ...applicationIds] = process.argv.slice(2);
if (!root) throw new Error("Usage: migrate-layout.mjs <applications-root> [application-id ...]");
await migrateApplicationLayout(root, applicationIds);
