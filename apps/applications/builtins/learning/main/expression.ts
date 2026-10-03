/** A deliberately small scalar language. Expressions never become JavaScript. */
type Node =
  | { kind: "number"; value: number }
  | { kind: "symbol"; name: string }
  | { kind: "unary"; sign: string; child: Node }
  | { kind: "binary"; op: string; left: Node; right: Node }
  | { kind: "call"; name: string; args: Node[] };
type Operation = {
  min: number;
  max: number;
  run: (...args: number[]) => number;
};
const operations = new Map<string, Operation>([
  ...Object.entries({
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    sqrt: Math.sqrt,
    abs: Math.abs,
    exp: Math.exp,
    log: Math.log,
    ln: Math.log,
    log10: Math.log10,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
  }).map(([name, run]): [string, Operation] => [name, { min: 1, max: 1, run }]),
  ["min", { min: 2, max: 6, run: Math.min }],
  ["max", { min: 2, max: 6, run: Math.max }],
  ["pow", { min: 2, max: 2, run: Math.pow }],
]);
const constants = new Map([
  ["pi", Math.PI],
  ["e", Math.E],
]);
const reserved = new Set([
  "constructor",
  "prototype",
  "__proto__",
  "window",
  "document",
  "globalThis",
  "eval",
  "Function",
  "import",
  "fetch",
  "NaN",
  "Infinity",
]);
export function validSymbol(name: string) {
  return (
    /^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(name) &&
    !operations.has(name) &&
    !constants.has(name) &&
    !reserved.has(name)
  );
}
export const symbolLatex = (name: string) =>
  name.length === 1 ? name : `\\mathrm{${name.replaceAll("_", "\\_")}}`;
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "未定义";
  return Number(value.toPrecision(7)).toString();
}
function finite(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > 1e15)
    throw new Error("当前参数下结果未定义或超出计算范围");
  return value;
}
export type ParsedExpression = {
  symbols: string[];
  latex: string;
  evaluate: (values: Record<string, number>) => number;
};
const cache = new Map<string, ParsedExpression>();
export function parseExpression(source: string): ParsedExpression {
  if (typeof source !== "string" || !source.trim() || source.length > 500)
    throw new Error("表达式需为 1–500 个字符");
  const cached = cache.get(source);
  if (cached) return cached;
  const tokens: string[] = [];
  const pattern =
    /\s*(?:(\d*\.\d+|\d+\.?\d*)(?:([eE][+-]?\d+))?|([A-Za-z][A-Za-z0-9_]*)|([+\-*/^(),]))/y;
  let offset = 0;
  while (offset < source.length) {
    if (!source.slice(offset).trim()) break;
    pattern.lastIndex = offset;
    const token = pattern.exec(source);
    if (!token) throw new Error(`表达式第 ${offset + 1} 位含不支持的字符`);
    tokens.push(
      token[1] ? token[1] + (token[2] ?? "") : (token[3] ?? token[4]),
    );
    if (tokens.length > 160) throw new Error("表达式过长，请拆成多个计算结果");
    offset = pattern.lastIndex;
  }
  let cursor = 0,
    nodes = 0;
  const symbols = new Set<string>();
  const node = <T extends Node>(value: T): T => {
    if (++nodes > 100) throw new Error("表达式过于复杂");
    return value;
  };
  const take = (expected: string) => {
    if (tokens[cursor++] !== expected)
      throw new Error(`表达式缺少 ${expected}`);
  };
  const parse = (minimum = 0, depth = 0): Node => {
    if (depth > 24) throw new Error("表达式嵌套过深");
    const token = tokens[cursor++];
    let left: Node;
    if (token === "+" || token === "-")
      left = node({ kind: "unary", sign: token, child: parse(3, depth + 1) });
    else if (token === "(") {
      left = parse(0, depth + 1);
      take(")");
    } else if (token && /^(?:\d|\.\d)/.test(token))
      left = node({ kind: "number", value: finite(Number(token)) });
    else if (token && /^[A-Za-z]/.test(token)) {
      if (tokens[cursor] === "(") {
        const operation = operations.get(token);
        if (!operation) throw new Error(`不支持函数 ${token}`);
        cursor++;
        const args: Node[] = [];
        if (tokens[cursor] !== ")") {
          do {
            args.push(parse(0, depth + 1));
            if (tokens[cursor] !== ",") break;
            cursor++;
          } while (true);
        }
        take(")");
        if (args.length < operation.min || args.length > operation.max)
          throw new Error(`${token} 的参数数量不正确`);
        left = node({ kind: "call", name: token, args });
      } else {
        if (!constants.has(token) && !validSymbol(token))
          throw new Error(`变量名称 ${token} 不可用`);
        if (!constants.has(token)) symbols.add(token);
        left = node({ kind: "symbol", name: token });
      }
    } else throw new Error("表达式不完整，请检查运算符和括号");
    while (cursor < tokens.length) {
      const op = tokens[cursor];
      const priority =
        op === "+" || op === "-"
          ? 1
          : op === "*" || op === "/"
            ? 2
            : op === "^"
              ? 4
              : -1;
      if (priority < minimum) break;
      cursor++;
      left = node({
        kind: "binary",
        op,
        left,
        right: parse(op === "^" ? priority : priority + 1, depth + 1),
      });
    }
    return left;
  };
  const ast = parse();
  if (cursor !== tokens.length)
    throw new Error("表达式格式无效；乘法请使用 *，如 2*x");
  const evaluate = (n: Node, values: Record<string, number>): number => {
    switch (n.kind) {
      case "number":
        return n.value;
      case "symbol": {
        if (constants.has(n.name)) return constants.get(n.name)!;
        if (!Object.hasOwn(values, n.name))
          throw new Error(`缺少变量 ${n.name}`);
        return finite(values[n.name]);
      }
      case "unary":
        return finite((n.sign === "-" ? -1 : 1) * evaluate(n.child, values));
      case "call":
        return finite(
          operations
            .get(n.name)!
            .run(...n.args.map((arg) => evaluate(arg, values))),
        );
      case "binary": {
        const a = evaluate(n.left, values),
          b = evaluate(n.right, values);
        if (n.op === "/" && b === 0) throw new Error("除数为 0，请调整参数");
        return finite(
          n.op === "+"
            ? a + b
            : n.op === "-"
              ? a - b
              : n.op === "*"
                ? a * b
                : n.op === "/"
                  ? a / b
                  : a ** b,
        );
      }
    }
  };
  const priority = (n: Node): number =>
    n.kind === "binary"
      ? n.op === "+" || n.op === "-"
        ? 1
        : n.op === "*" || n.op === "/"
          ? 2
          : 4
      : n.kind === "unary"
        ? 3
        : 5;
  const latex = (n: Node, parent = 0): string => {
    let result: string;
    switch (n.kind) {
      case "number":
        result = String(n.value).replace(/e([+-]?\d+)/, "\\times 10^{$1}");
        break;
      case "symbol":
        result = n.name === "pi" ? "\\pi" : symbolLatex(n.name);
        break;
      case "unary":
        result = n.sign + latex(n.child, 3);
        break;
      case "call": {
        const args = n.args.map((arg) => latex(arg));
        result =
          n.name === "sqrt"
            ? `\\sqrt{${args[0]}}`
            : n.name === "abs"
              ? `\\left|${args[0]}\\right|`
              : `\\operatorname{${n.name}}\\left(${args.join(", ")}\\right)`;
        break;
      }
      case "binary":
        result =
          n.op === "/"
            ? `\\frac{${latex(n.left)}}{${latex(n.right)}}`
            : n.op === "^"
              ? `{${latex(n.left, 5)}}^{${latex(n.right)}}`
              : `${latex(n.left, priority(n))} ${n.op === "*" ? "\\cdot" : n.op} ${latex(n.right, priority(n) + (n.op === "-" ? 1 : 0))}`;
        break;
    }
    return priority(n) < parent ? `\\left(${result}\\right)` : result;
  };
  const parsed = {
    symbols: [...symbols],
    latex: latex(ast),
    evaluate: (values: Record<string, number>) => evaluate(ast, values),
  };
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(source, parsed);
  return parsed;
}
