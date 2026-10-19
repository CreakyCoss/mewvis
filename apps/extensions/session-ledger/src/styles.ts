/** Plugin-owned presentation; colors follow the host's semantic theme tokens. */
export const styles = `
:root {
  color-scheme: light dark;
}
* {
  box-sizing: border-box;
}
body {
  font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}
button,
select,
summary {
  -webkit-tap-highlight-color: transparent;
}
button,
select {
  font: inherit;
}
button {
  cursor: pointer;
  transition:
    background 0.16s,
    border-color 0.16s,
    color 0.16s;
}
button:disabled {
  cursor: default;
  opacity: 0.5;
}
button:focus-visible,
summary:focus-visible,
select:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}
svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
h2,
p {
  margin: 0;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    12px/1.8 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  margin: 0;
}
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-thumb {
  border-radius: 6px;
  background: color-mix(in srgb, var(--muted-foreground) 25%, transparent);
}
.ledger {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--background);
  color: var(--foreground);
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.toolbar-copy {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.toolbar-copy strong {
  font-size: 13px;
  font-weight: 600;
}
.toolbar-copy p {
  color: var(--muted-foreground);
  font-size: 12px;
  margin-top: 5px;
  font-variant-numeric: tabular-nums;
}
.ledger-symbol {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--primary);
  background: var(--surface-raised);
}
.ledger-symbol svg {
  width: 18px;
  height: 18px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-raised);
  color: var(--foreground);
  font-size: 12px;
  line-height: 1.4;
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
  filter: brightness(0.95);
}
.refresh-button {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted-foreground);
}
.refresh-button:hover:not(:disabled) {
  background: var(--muted);
  color: var(--foreground);
}
.refresh-button:active:not(:disabled) {
  background: color-mix(in srgb, var(--primary) 10%, var(--muted));
  color: var(--primary);
}
.ledger-layout {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}
.run-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 55%, var(--background));
}
.list-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 18px 16px 12px;
  flex-shrink: 0;
}
.list-heading h2 {
  font-size: 12px;
  font-weight: 600;
}
.list-heading .muted {
  margin-left: auto;
  font-size: 11px;
}
.badge {
  font-size: 11px;
  color: var(--muted-foreground);
  background: var(--muted);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.run-list {
  overflow: auto;
  min-height: 0;
  flex: 1;
  padding: 0 8px 16px;
}
.run-row {
  display: flex;
  flex-direction: column;
  gap: 9px;
  width: 100%;
  padding: 12px;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  content-visibility: auto;
  contain-intrinsic-size: auto 126px;
}
.run-row:hover {
  background: var(--muted);
}
.run-row[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
  background: var(--background);
  box-shadow: inset 3px 0 var(--primary);
}
.run-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.run-number {
  font:
    11px ui-monospace,
    monospace;
  color: var(--muted-foreground);
}
.run-row strong {
  width: 100%;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.65;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reply {
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}
.run-row-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  color: var(--muted-foreground);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.run-row-meta svg {
  width: 12px;
  height: 12px;
  margin-left: auto;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.status.running {
  color: var(--primary);
}
.status.error {
  color: var(--destructive);
}
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
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
.run-detail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.detail-heading {
  padding: 20px 24px 16px;
  flex-shrink: 0;
}
.detail-eyebrow {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted-foreground);
  font-size: 12px;
  margin-bottom: 12px;
}
.detail-eyebrow .status {
  border-radius: 5px;
  background: var(--muted);
  padding: 3px 6px;
}
.detail-heading h2 {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  max-height: 80px;
  overflow: auto;
}
.detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
}
.detail-meta > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.detail-meta svg {
  width: 13px;
  height: 13px;
}
.categories {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.categories button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 10px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  white-space: nowrap;
}
.categories button:hover {
  color: var(--foreground);
  background: var(--muted);
}
.categories button[aria-pressed="true"] {
  color: var(--foreground);
  border-bottom-color: var(--primary);
  font-weight: 600;
}
.categories button > span {
  font:
    10px ui-monospace,
    monospace;
  opacity: 0.8;
}
.detail-scroll {
  overflow: auto;
  min-height: 0;
  flex: 1;
  padding: 20px 24px 32px;
}
.section {
  border-top: 1px solid var(--border);
  margin-top: 8px;
}
.section > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  list-style: none;
  min-height: 44px;
  padding: 0;
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
  color: var(--primary);
}
.section-content {
  padding: 8px 0 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.record {
  padding: 16px 0;
  min-width: 0;
}
.record + .record {
  border-top: 1px solid var(--border);
}
.record > .meta {
  margin-bottom: 10px;
}
.record pre,
.section-content pre {
  padding: 12px 14px;
  border-radius: 6px;
  background: var(--muted);
}
.records-heading {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}
.message {
  padding: 20px 0;
}
.message:first-child {
  padding-top: 0;
}
.message + .message {
  border-top: 1px solid var(--border);
}
.message-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 12px;
  color: var(--muted-foreground);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.message-role {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 500;
}
.message-role svg {
  width: 14px;
  height: 14px;
  color: var(--muted-foreground);
}
.message-meta .identifier {
  margin-left: auto;
}
.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  color: var(--muted-foreground);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.identifier {
  font-family: ui-monospace, monospace;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.message-text {
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
.ledger-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  text-align: center;
}
.ledger-empty > svg {
  width: 32px;
  height: 32px;
  color: var(--muted-foreground);
  margin-bottom: 4px;
}
.ledger-empty h2 {
  font-size: 15px;
  font-weight: 500;
}
.ledger-empty p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted-foreground);
}
.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 20px;
  border: 1px solid color-mix(in srgb, var(--destructive) 25%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--destructive) 8%, var(--background));
  color: var(--destructive);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  flex-shrink: 0;
}
.error-banner > span {
  min-width: 0;
}
.notice,
.loading-status {
  font-size: 12px;
  line-height: 1.6;
  padding: 10px 20px;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.loading-status {
  display: flex;
  align-items: center;
  gap: 8px;
}
.muted {
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted-foreground);
}
.summary-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  min-height: 0;
  flex: 1;
}
.summary-view .error-banner {
  margin: 0;
}
.summary-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.9;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-raised);
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
}
.detail-scroll > .summary-view {
  padding: 0;
  min-height: 100%;
}
.mobile-picker {
  display: none;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 820px) and (min-width: 681px) {
  .ledger-layout {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .detail-heading,
  .detail-scroll {
    padding-left: 16px;
    padding-right: 16px;
  }
  .categories {
    padding: 0 8px;
  }
  .categories button {
    padding-left: 6px;
    padding-right: 6px;
  }
}
@media (max-width: 680px) {
  .toolbar {
    padding: 12px 16px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .toolbar-copy {
    flex: 1;
  }
  .toolbar-copy strong {
    font-size: 12px;
  }
  .ledger-symbol {
    display: none;
  }
  .refresh-button {
    width: 44px;
    height: 44px;
  }
  .ledger-layout {
    display: flex;
    flex-direction: column;
  }
  .run-sidebar {
    display: none;
  }
  .mobile-picker {
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    padding: 10px 16px;
    flex-shrink: 0;
  }
  .mobile-picker label {
    font-size: 12px;
    white-space: nowrap;
    color: var(--muted-foreground);
  }
  .mobile-picker select {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 13px;
  }
  .run-detail {
    flex: 1;
  }
  .detail-heading {
    padding: 16px;
  }
  .detail-heading h2 {
    font-size: 15px;
    max-height: 64px;
  }
  .detail-meta {
    gap: 8px 12px;
  }
  .categories {
    padding: 0 8px;
  }
  .categories button {
    padding-left: 8px;
    padding-right: 8px;
  }
  .detail-scroll {
    padding: 16px;
  }
  .summary-view {
    padding: 16px;
  }
  .message-meta .identifier {
    display: none;
  }
  .button {
    min-height: 44px;
  }
  .message-text {
    font-size: 14px;
  }
}
@media (max-height: 420px) {
  .ledger {
    overflow: auto;
  }
  .ledger-layout {
    flex: none;
    min-height: 360px;
  }
  .detail-scroll {
    overflow: visible;
    flex: none;
  }
  .run-sidebar {
    max-height: 520px;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
`;
