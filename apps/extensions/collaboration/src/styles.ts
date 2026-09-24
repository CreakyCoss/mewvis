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
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 12px;
  background: var(--background);
}
button:hover {
  background: var(--accent);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
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
input[type="checkbox"] {
  -webkit-appearance: none;
  appearance: none;
  display: inline-grid;
  place-content: center;
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
  border: 1px solid var(--muted-foreground);
  border-radius: 4px;
  background: var(--background);
  cursor: pointer;
}
input[type="checkbox"]:checked {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}
input[type="checkbox"]:checked::after {
  content: "";
  width: 4px;
  height: 8px;
  border: solid currentColor;
  border-width: 0 2px 2px 0;
  transform: translateY(-1px) rotate(45deg);
}
input[type="checkbox"]:disabled {
  opacity: 0.45;
  cursor: default;
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
  min-height: 64px;
}
h2,
h3,
p {
  margin: 0;
}
h2 {
  font-size: 19px;
  letter-spacing: -0.3px;
}
h3 {
  font-size: 14px;
}
label,
.field-title {
  display: block;
  font-weight: 500;
}
label > input:not([type="checkbox"]),
label > textarea,
label > select {
  display: block;
  margin-top: 6px;
}
label > small {
  display: block;
  margin-top: 6px;
  font-weight: 400;
}
.meta,
small {
  color: var(--muted-foreground);
  font-size: 12px;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.row input[type="checkbox"] {
  margin: 0;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
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
.error,
.danger {
  color: var(--destructive);
}
.editor {
  max-width: 1040px;
  margin: auto;
  padding: 24px;
}
.library-editor {
  display: grid;
  gap: 20px;
}
.library-heading p {
  margin-top: 4px;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  border-radius: 6px;
  background: var(--muted);
  color: var(--muted-foreground);
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
}
.library-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.library-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}
.library-tools input {
  max-width: 360px;
}
.library-tools button {
  white-space: nowrap;
}
.library-caption {
  margin-top: -4px;
}
.flow-list,
.role-list {
  display: grid;
  gap: 12px;
}
.flow-card,
.role-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--background);
}
.flow-overview,
.role-overview {
  display: flex;
  width: 100%;
  min-width: 0;
  border: 0;
  border-radius: 0;
  text-align: left;
  padding: 18px 20px;
}
.flow-overview {
  flex-direction: column;
  gap: 8px;
}
.flow-overview:hover,
.role-overview:hover {
  background: color-mix(in srgb, var(--accent) 40%, var(--background));
}
.flow-overview:focus-visible,
.role-overview:focus-visible {
  outline-offset: -3px;
}
.flow-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.flow-title strong,
.role-copy strong {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 400;
  overflow-wrap: anywhere;
}
.step-preview {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  column-gap: 24px;
  row-gap: 10px;
  padding-top: 10px;
}
.preview-step {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 90px;
  max-width: 200px;
}
.step-number {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 50%;
  font-size: 11px;
  color: var(--muted-foreground);
  background: var(--background);
}
.preview-name {
  display: block;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.preview-role {
  display: flex;
  gap: 5px;
  align-items: center;
  color: var(--muted-foreground);
  font-size: 11px;
  margin-top: 3px;
}
.more-steps {
  align-self: center;
  font-size: 11px;
  color: var(--muted-foreground);
}
.entry-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--border);
  padding: 7px 14px 7px 20px;
}
.delete {
  padding: 4px 8px;
  border: 1px solid transparent;
  color: var(--muted-foreground);
  background: transparent;
  flex-shrink: 0;
  font-size: 12px;
}
.delete:hover {
  color: var(--destructive);
}
.delete.error {
  color: var(--destructive);
  background: color-mix(in srgb, var(--destructive) 10%, var(--background));
  border-color: color-mix(in srgb, var(--destructive) 45%, var(--border));
}
.delete.error:hover {
  background: color-mix(in srgb, var(--destructive) 18%, var(--background));
}
.role-overview {
  align-items: flex-start;
  gap: 14px;
}
.role-avatar {
  flex-shrink: 0;
  border-radius: 10px;
}
.role-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.usage {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
}
.text-link {
  font-size: 11px;
  padding: 2px 6px;
  border: 0;
  background: var(--muted);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-state {
  display: flex;
  min-height: 200px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  text-align: center;
  padding: 28px 16px;
  background: color-mix(in srgb, var(--muted) 40%, var(--background));
  border-radius: 10px;
}
.empty-state button {
  margin-top: 4px;
}
.dialog-editor {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 100vh;
  padding: 20px 24px 0;
}
.form {
  display: grid;
  gap: 20px;
  min-width: 0;
  border: 0;
  padding: 0;
  margin: 0;
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
.spacer {
  flex: 1;
}
.flow-basics {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 20px;
}
.flow-basics textarea {
  min-height: 64px;
}
.workflow-builder {
  min-width: 0;
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  border: 1px solid var(--border);
  border-radius: 10px;
  align-items: start;
}
.step-navigation {
  min-width: 0;
  padding: 16px 12px;
  position: sticky;
  top: 0;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 4px 12px;
}
.step-navigation ol {
  max-height: 360px;
  overflow-y: auto;
  padding: 0;
  margin: 0 0 12px;
  list-style: none;
  display: grid;
  gap: 6px;
}
.step-nav-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 10px 8px;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
}
.step-nav-item[aria-current="step"] {
  background: color-mix(in srgb, var(--primary) 7%, var(--background));
  border-color: color-mix(in srgb, var(--primary) 20%, var(--border));
}
.step-nav-item[aria-current="step"] .step-number {
  color: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
}
.step-nav-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.step-nav-copy strong {
  font-size: 12px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.step-nav-copy .meta {
  display: flex;
  gap: 5px;
  align-items: center;
  font-size: 11px;
}
.incomplete {
  font-size: 10px;
  color: var(--destructive);
}
.add-step {
  width: 100%;
  background: transparent;
  border-style: dashed;
}
.step-navigation > p {
  font-size: 10px;
  margin-top: 10px;
  text-align: center;
}
.step-detail {
  min-width: 0;
  padding: 18px 20px;
  border-left: 1px solid var(--border);
  min-height: 340px;
}
.step-detail-heading {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}
.eyebrow {
  display: block;
  font-size: 10px;
  color: var(--muted-foreground);
}
.step-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.step-actions button {
  padding: 3px 6px;
  border: 0;
  font-size: 11px;
  background: transparent;
}
.step-actions button:hover {
  background: var(--accent);
}
.step-fields {
  display: grid;
  gap: 16px;
}
.step-fields textarea {
  min-height: 106px;
}
.advanced {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.advanced summary {
  cursor: pointer;
  font-size: 12px;
}
.advanced summary .meta {
  margin-left: 8px;
  font-size: 10px;
}
.advanced-body {
  display: grid;
  gap: 14px;
  margin-top: 14px;
}
.step {
  padding: 12px;
  border-radius: 8px;
  background: var(--muted);
  display: grid;
  gap: 12px;
}
.role-identity {
  display: flex;
  align-items: center;
  gap: 16px;
}
.role-identity > img {
  flex-shrink: 0;
  border-radius: 12px;
}
.role-identity label {
  flex: 1;
  min-width: 0;
}
.avatar-field {
  display: flex;
  align-items: center;
  gap: 16px;
}
.avatar-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.avatar-option {
  padding: 3px;
  border: 1px solid transparent;
  background: transparent;
}
.avatar-option img {
  display: block;
  border-radius: 6px;
}
.avatar-option[aria-pressed="true"] {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, var(--background));
}
@media (max-width: 620px) {
  .editor {
    padding: 16px;
  }
  .dialog-editor {
    padding-bottom: 0;
  }
  .grid,
  .flow-basics {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .workflow-builder {
  min-width: 0;
    grid-template-columns: minmax(0, 1fr);
  }
  .step-navigation {
  min-width: 0;
    position: static;
  }
  .step-navigation ol {
    display: flex;
    overflow-x: auto;
    padding: 3px;
  }
  .step-navigation li {
    min-width: 150px;
    max-width: 180px;
  }
  .step-navigation > p {
    display: none;
  }
  .step-detail {
    border-left: 0;
    border-top: 1px solid var(--border);
    padding: 16px;
  }
  .flow-overview,
  .role-overview {
    padding: 16px;
  }
  .entry-actions {
    padding-left: 16px;
  }
  .step-preview {
    column-gap: 16px;
  }
  .step-detail-heading {
    flex-wrap: wrap;
  }
}
`;
