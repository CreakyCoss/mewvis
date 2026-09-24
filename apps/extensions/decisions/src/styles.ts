export const styles = `
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  color: var(--foreground);
  background: var(--background);
  font: 13px/1.6 system-ui;
}
button,
input,
textarea,
select {
  font: inherit;
  color: inherit;
}
button {
  cursor: pointer;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
}
button:hover {
  background: var(--accent);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
input:not([type="checkbox"]),
textarea,
select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
}
/* Normalize native controls across Chromium and the desktop WebKit view. */
input:not([type="checkbox"]),
select {
  min-height: 38px;
}
select {
  -webkit-appearance: none;
  appearance: none;
  padding-right: 32px;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--muted-foreground) 50%),
    linear-gradient(135deg, var(--muted-foreground) 50%, transparent 50%);
  background-position: calc(100% - 15px) 50%, calc(100% - 10px) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
}
textarea {
  resize: vertical;
  min-height: 85px;
}
button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
main {
  max-width: 800px;
  margin: auto;
  padding: 20px;
  display: grid;
  gap: 18px;
}
.dialog-editor {
  max-width: none;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px 0;
}
h2,
h3,
p {
  margin: 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.row h2,
.row h3 {
  flex: 1;
}
.muted,
small {
  color: var(--muted-foreground);
}
fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  display: grid;
  gap: 16px;
}

label {
  display: grid;
  gap: 5px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
.primary:hover {
  background: var(--primary);
  filter: brightness(0.96);
}
.error {
  color: var(--destructive);
}
@media (max-width: 520px) {
  .grid {
    grid-template-columns: 1fr;
  }
  main {
    padding: 12px;
  }
  .dialog-editor {
    padding: 16px 16px 0;
  }
}

.section[hidden] {
  display: none;
}
.section {
  display: grid;
  gap: 12px;
}
.meta {
  font-size: 12px;
  color: var(--muted-foreground);
}
.toolbar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: auto;
  padding: 14px 0;
  border-top: 1px solid var(--border);
  background: var(--background);
}
.toolbar .spacer {
  flex: 1;
}
.danger {
  color: var(--destructive);
}
.notice {
  padding: 12px;
  border-radius: 8px;
  background: var(--muted);
}
h2 {
  font-size: 16px;
}
h3 {
  font-size: 14px;
}
.delete {
  border: 0;
  background: transparent;
  color: var(--muted-foreground);
  margin: 0;
  padding: 0 4px;
  flex-shrink: 0;
}
.delete:hover {
  color: var(--destructive);
}
.meta {
  overflow-wrap: anywhere;
}
.delete.error {
  color: var(--destructive);
  background: color-mix(in srgb, var(--destructive) 10%, var(--background));
  border: 1px solid color-mix(in srgb, var(--destructive) 45%, var(--border));
}
.delete.error:hover {
  background: color-mix(in srgb, var(--destructive) 18%, var(--background));
}
.library-heading {
  display: grid;
  gap: 6px;
}
.tabs {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--muted-foreground);
}
.tabs button[aria-selected="true"] {
  color: var(--foreground);
  border-bottom-color: var(--primary);
  font-weight: 600;
}
.count {
  border-radius: 6px;
  background: var(--muted);
  color: var(--muted-foreground);
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 400;
}
.library-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.library-tools button {
  flex-shrink: 0;
}
.empty-state {
  display: grid;
  gap: 8px;
  padding: 24px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  text-align: center;
}
.rule-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.rule-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.rule-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.rule-heading h3 {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.rule-title {
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  text-align: left;
  font-weight: inherit;
  overflow-wrap: anywhere;
}
.rule-title:hover {
  color: var(--primary);
  background: transparent;
}
.rule-details {
  display: grid;
  gap: 10px;
  margin: 0;
}
.rule-details > div {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 12px;
}
.rule-details dt {
  color: var(--muted-foreground);
}
.rule-details dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (max-width: 520px) {
  .rule-details > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
`;
