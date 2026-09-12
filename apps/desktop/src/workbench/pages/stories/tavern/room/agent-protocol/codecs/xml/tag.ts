type XmlAttributeValue = string | number | boolean | null | undefined;

export type XmlAttributes = Record<string, XmlAttributeValue>;

export const escapeProtocolXmlText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeProtocolXmlAttribute = (text: string) => escapeProtocolXmlText(text).replace(/"/g, "&quot;");

const renderProtocolXmlAttributes = (attributes?: XmlAttributes) => {
  const rendered = Object.entries(attributes ?? {})
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}="${escapeProtocolXmlAttribute(String(value))}"`);

  return rendered.length > 0 ? ` ${rendered.join(" ")}` : "";
};

export const wrapProtocolXmlTag = (tag: string, content: string, attributes?: XmlAttributes) => {
  const attributeText = renderProtocolXmlAttributes(attributes);
  const body = escapeProtocolXmlText(content);

  return body.includes("\n")
    ? `<${tag}${attributeText}>\n${body}\n</${tag}>`
    : `<${tag}${attributeText}>${body}</${tag}>`;
};

export const wrapProtocolXmlRawTag = (tag: string, content: string, attributes?: XmlAttributes) => {
  const attributeText = renderProtocolXmlAttributes(attributes);

  return content.includes("\n")
    ? `<${tag}${attributeText}>\n${content}\n</${tag}>`
    : `<${tag}${attributeText}>${content}</${tag}>`;
};
