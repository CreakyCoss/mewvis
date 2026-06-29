type AttributeMap = Record<string, string>;

export type XmlElement = {
  name: string;
  attributes: AttributeMap;
  children: XmlElement[];
  text: string;
};

const decodeXmlText = (value: string) =>
  value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const parseAttributes = (value: string): AttributeMap => {
  const attributes: AttributeMap = {};
  const matcher = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(value))) {
    attributes[match[1]] = decodeXmlText(match[2] ?? match[3] ?? "");
  }

  return attributes;
};

export const parseXmlFragment = (xml: string): XmlElement[] => {
  const root: XmlElement = { name: "#root", attributes: {}, children: [], text: "" };
  const stack = [root];
  const tagMatcher = /<([^>]+)>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagMatcher.exec(xml))) {
    const text = xml.slice(cursor, match.index);
    if (text) {
      stack[stack.length - 1].text += decodeXmlText(text);
    }

    const rawTag = match[1].trim();
    cursor = tagMatcher.lastIndex;
    if (!rawTag || rawTag.startsWith("?") || rawTag.startsWith("!")) {
      continue;
    }

    if (rawTag.startsWith("/")) {
      const name = rawTag.slice(1).trim().toLowerCase();
      while (stack.length > 1) {
        const element = stack.pop();
        if (element?.name.toLowerCase() === name) {
          break;
        }
      }
      continue;
    }

    const selfClosing = rawTag.endsWith("/");
    const body = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const nameEnd = body.search(/\s/);
    const name = nameEnd >= 0 ? body.slice(0, nameEnd) : body;
    const attributeText = nameEnd >= 0 ? body.slice(nameEnd + 1) : "";
    const element: XmlElement = {
      name,
      attributes: parseAttributes(attributeText),
      children: [],
      text: "",
    };

    stack[stack.length - 1].children.push(element);
    if (!selfClosing) {
      stack.push(element);
    }
  }

  const remainingText = xml.slice(cursor);
  if (remainingText) {
    stack[stack.length - 1].text += decodeXmlText(remainingText);
  }

  return root.children;
};

export const findXmlElement = (
  elements: XmlElement[],
  predicate: (element: XmlElement) => boolean,
): XmlElement | undefined => {
  for (const element of elements) {
    if (predicate(element)) {
      return element;
    }

    const child = findXmlElement(element.children, predicate);
    if (child) {
      return child;
    }
  }

  return undefined;
};
