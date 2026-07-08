export const limitPromptText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

export const escapePromptXmlText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const escapePromptXmlAttribute = (text: string) => escapePromptXmlText(text).replace(/"/g, "&quot;");
