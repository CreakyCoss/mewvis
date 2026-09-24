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
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  display: grid;
  gap: 12px;
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

.section {
  display: grid;
  gap: 12px;
}
.items {
  display: grid;
  gap: 8px;
}
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px;
  text-align: left;
  border-color: var(--border);
  border-radius: 10px;
}
.item-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}
.item-title {
  font-weight: 600;
  font-size: 14px;
}
.item-description {
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
}
.meta {
  font-size: 12px;
  color: var(--muted-foreground);
}
.chevron {
  color: var(--muted-foreground);
  font-size: 20px;
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
.list-row {
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.list-row .item {
  flex: 1;
  min-width: 0;
  border: 0;
  border-radius: 0;
}
.delete {
  border: 0;
  background: transparent;
  color: var(--muted-foreground);
  margin: 0 10px;
  padding: 6px 8px;
}
.delete:hover {
  color: var(--destructive);
}
.items .notice {
  margin-top: 6px;
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
`;
