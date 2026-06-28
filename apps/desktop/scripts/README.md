# Desktop Scripts

This directory is grouped by ownership and intent:

- `packaging/`: platform packaging and bundled runtime package helpers.
- `agent-runtime/`: agent-runtime single-agent and collaboration tests.
- `../agent-runtime-host/`: desktop-specific runtime host and business extension
  composition for the bundled Node runtime.
- `business/story/`: story-domain smoke and e2e checks.
- `business/tavern/`: tavern-domain smoke, prompt, runtime, and live checks.
- `maintenance/`: project maintenance scripts such as config and model sync.

Prefer adding new scripts to the narrowest matching group, then expose stable
entry points through `apps/desktop/package.json`.
