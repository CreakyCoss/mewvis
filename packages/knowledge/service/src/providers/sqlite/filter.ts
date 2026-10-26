import type { SQLInputValue } from "node:sqlite";
import type { KnowledgeFilter, KnowledgeScalar } from "@mewvis/knowledge-sdk";
import { fail } from "../../util.js";

/** Top-level metadata keys are literal bound values, never SQL or JSON-path expressions. */
export function metadataWhere(filter?: KnowledgeFilter): {
  sql: string;
  params: SQLInputValue[];
} {
  const params: SQLInputValue[] = [];
  let nodes = 0;
  const scalar = (value: KnowledgeScalar, comparison = "=") => {
    if (value === null) return "j.type='null'";
    if (typeof value === "boolean")
      return `j.type='${value ? "true" : "false"}'`;
    params.push(value);
    return typeof value === "number"
      ? `(j.type IN ('integer','real') AND j.value ${comparison} ?)`
      : `(j.type='text' AND j.value ${comparison} ? COLLATE BINARY)`;
  };
  const walk = (node: KnowledgeFilter, depth: number): string => {
    if (++nodes > 128 || depth > 16)
      fail("INVALID_ARGUMENT", "Metadata filter is too complex");
    if (node.operator === "and" || node.operator === "or")
      return `(${node.conditions.map((child) => walk(child, depth + 1)).join(node.operator === "and" ? " AND " : " OR ")})`;
    if (node.operator === "not")
      return `(NOT ${walk(node.condition, depth + 1)})`;
    if (!("field" in node)) fail("INVALID_ARGUMENT", "Invalid metadata filter");
    params.push(node.field);
    const prefix =
      "EXISTS(SELECT 1 FROM json_each(d.metadata_json) j WHERE j.key=?";
    if (node.operator === "exists")
      return `${node.exists ? "" : "NOT "}${prefix})`;
    if (node.operator === "in" || node.operator === "notIn") {
      const checks = node.values.map((value) => scalar(value));
      return `${prefix} AND ${node.operator === "notIn" ? "NOT " : ""}(${checks.join(" OR ")}))`;
    }
    if (node.operator === "eq" || node.operator === "ne")
      return `${prefix} AND ${node.operator === "ne" ? "NOT " : ""}(${scalar(node.value)}))`;
    if (!("value" in node))
      fail("INVALID_ARGUMENT", "Invalid metadata comparison");
    const comparison = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[
      node.operator
    ];
    return `${prefix} AND ${scalar(node.value, comparison)})`;
  };
  const sql = filter ? walk(filter, 0) : "1";
  if (params.length > 512)
    fail("INVALID_ARGUMENT", "Metadata filter contains too many values");
  return { sql, params };
}
