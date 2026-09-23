/** Plugin-owned presentation; colors follow the host's semantic theme tokens. */
export const styles = `
:root {
  color-scheme: light dark;
}
body {
  font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}
button,
summary {
  -webkit-tap-highlight-color: transparent;
}
button {
  font: inherit;
}
svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
button:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
button:disabled {
  cursor: default;
  opacity: 0.5;
}
button {
  transition:
    background 0.15s,
    border-color 0.15s;
}
h2,
p {
  margin: 0;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    12px/1.75 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  margin: 0;
  max-height: 384px;
  overflow: auto;
}
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-thumb {
  border-radius: 6px;
  background: color-mix(in srgb, var(--muted-foreground) 25%, transparent);
}
.ledger,
.dialog-body {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.header {
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}
.header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
}
.badge {
  font-size: 11px;
  color: var(--muted-foreground);
  background: var(--muted);
  padding: 3px 7px;
  border-radius: 5px;
  white-space: nowrap;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.icon-button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted-foreground);
}
.icon-button:hover:not(:disabled) {
  background: var(--muted);
  color: var(--foreground);
}
.run-list {
  overflow: auto;
  min-height: 0;
  flex: 1;
  padding: 0 8px 12px;
}
.run-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 80px;
  padding: 10px;
  margin: 0 0 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  color: var(--foreground);
}
.run-row:hover:not(:disabled) {
  border-color: var(--border);
  background: color-mix(in srgb, var(--muted) 65%, transparent);
}
.run-row:disabled {
  opacity: 1;
}
.run-row > svg {
  width: 14px;
  color: var(--muted-foreground);
}
.dot {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--muted-foreground);
}
.dot.done {
  background: var(--success);
}
.dot.running {
  background: var(--primary);
}
.dot.error {
  background: var(--destructive);
}
.run-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.run-copy strong {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reply {
  font-size: 12px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--muted-foreground);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.identifier {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: ui-monospace, monospace;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  color: var(--muted-foreground);
  padding: 32px 16px;
  font-size: 12px;
}
.empty > svg {
  width: 26px;
  height: 26px;
  opacity: 0.55;
}
.error {
  margin: 0 12px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--destructive) 10%, transparent);
  color: var(--destructive);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.notice {
  font-size: 12px;
  line-height: 1.6;
  margin: 0 12px 8px;
  color: var(--muted-foreground);
}
.detail-scroll {
  overflow: auto;
  min-height: 0;
  flex: 1;
  padding: 16px 20px 36px;
  background: color-mix(in srgb, var(--surface) 35%, var(--background));
}
.run-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.run-heading p {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}
.metric {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-raised);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.metric span {
  color: var(--muted-foreground);
}
.metric strong {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.section {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface-raised);
  margin: 0 0 14px;
}
.section > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  list-style: none;
  min-height: 44px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 500;
}
.section > summary::-webkit-details-marker {
  display: none;
}
.section > summary > span:first-child {
  flex: 1;
}
.section > summary > svg {
  width: 14px;
  height: 14px;
  color: var(--muted-foreground);
  transition: transform 0.15s;
}
.section[open] > summary > svg {
  transform: rotate(90deg);
}
.section > summary:hover {
  background: var(--muted);
}
.section-content {
  padding: 12px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-content > .empty {
  padding: 16px 12px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-raised);
  padding: 12px;
  min-width: 0;
}
.card > .meta {
  margin-bottom: 8px;
}
.card pre {
  padding: 10px 12px;
  border-radius: 7px;
  background: var(--background);
  border: 1px solid var(--border);
}
.message-text {
  font-size: 12px;
  line-height: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 288px;
  overflow: auto;
}
.summary-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  min-height: 0;
  flex: 1;
}
.muted {
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted-foreground);
}
.summary-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 2;
  border-radius: 10px;
  background: var(--muted);
  padding: 16px;
  overflow: auto;
  min-height: 140px;
  flex: 1;
}
.summary-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.summary-footer .actions {
  margin-left: auto;
  gap: 8px;
}
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 12px;
  background: var(--surface-raised);
  font-size: 12px;
  white-space: nowrap;
}
.button:hover:not(:disabled) {
  background: var(--muted);
}
.button.primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
.button.primary:hover:not(:disabled) {
  background: var(--primary);
  filter: brightness(0.95);
}
.retry {
  align-self: center;
}
.section-content .summary-view {
  padding: 0;
}
.section-content .summary-text {
  max-height: 360px;
  flex: auto;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 720px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 420px) {
  .detail-scroll {
    padding: 12px;
  }
  .metrics {
    grid-template-columns: 1fr 1fr;
  }
  .metric {
    padding: 9px;
  }
  .summary-view {
    padding: 14px;
  }
  .summary-footer .actions {
    flex-wrap: wrap;
  }
  .meta {
    gap: 6px;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
`;
