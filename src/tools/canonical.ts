import type { ToolCall, ToolSpec } from "../llm.ts";
import { cleanUserText } from "../modelText.ts";

/**
 * Tool calls from the model reduced to what the tools declare (round 4, A3): a call to an undeclared
 * tool is dropped, an id outside the id pattern is replaced, and the arguments are parsed into the
 * declared fields. Undeclared keys and nested values are discarded, numbers are kept only where a
 * number is declared, and every string left is cleaned of contact details. Only this form is
 * recorded, replayed to the model or run.
 */

/** Ids the marketplace's models write: letters, digits, underscores and hyphens. */
const CALL_ID = /^[A-Za-z0-9_-]+$/;
/** A TikTok handle in a declared `handle` field is an identifier the tools validate, not free text. */
const HANDLE_FIELD = /^@?[A-Za-z0-9._]{2,24}$/;
const NUMERIC = /^\s*\d+(?:\.\d+)?\s*$/;

type Schema = Record<string, unknown>;

export interface Canonical {
  calls: ToolCall[];
  /** How many contact details were removed from each kept call's arguments, by call id. */
  removedIn: Map<string, number>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function types(schema: Schema): string[] {
  const t = schema.type;
  return Array.isArray(t) ? t.map(String) : typeof t === "string" ? [t] : [];
}

/** One value parsed against its declared schema; undefined when it has no place there. */
function parse(schema: Schema, value: unknown, key: string, removed: { n: number }, handles: ReadonlySet<string>): unknown {
  const allowed = types(schema);
  if (allowed.includes("object") && isPlainObject(value)) {
    const props = isPlainObject(schema.properties) ? schema.properties : {};
    const out: Record<string, unknown> = {};
    for (const [k, sub] of Object.entries(props)) {
      const v = isPlainObject(sub) && k in value ? parse(sub, value[k], k, removed, handles) : undefined;
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (allowed.includes("array") && Array.isArray(value)) {
    const items = isPlainObject(schema.items) ? schema.items : {};
    return value.map((v) => parse(items, v, key, removed, handles)).filter((v) => v !== undefined);
  }
  const numeric = allowed.includes("number") || allowed.includes("integer");
  if (numeric && typeof value === "number" && Number.isFinite(value)) return value;
  if (allowed.includes("string") && typeof value === "string") {
    if (key === "handle" && HANDLE_FIELD.test(value.trim())) return value.trim();
    const cleaned = cleanUserText(value, handles);
    removed.n += cleaned.removed;
    return cleaned.value;
  }
  if (numeric && typeof value === "string" && NUMERIC.test(value)) return Number(value);
  return undefined;
}

/** The declared tools' calls only, each with a safe id and its arguments in declared form; mentions of the run's `handles` stay. */
export function canonicalCalls(calls: ToolCall[], tools: ToolSpec[], handles: ReadonlySet<string> = new Set()): Canonical {
  const declared = new Map(tools.map((t) => [t.function.name, t.function.parameters]));
  const removedIn = new Map<string, number>();
  const kept: ToolCall[] = [];
  const ids = new Set<string>();
  calls.forEach((call, i) => {
    const schema = declared.get(call.function.name);
    if (!schema) return;
    const id = CALL_ID.test(call.id) && !ids.has(call.id) ? call.id : `call_${i}`;
    ids.add(id);
    let raw: unknown;
    try {
      raw = JSON.parse(call.function.arguments || "{}");
    } catch {
      raw = {};
    }
    const removed = { n: 0 };
    const args = parse({ ...schema, type: "object" }, isPlainObject(raw) ? raw : {}, "", removed, handles);
    removedIn.set(id, removed.n);
    kept.push({ id, type: "function", function: { name: call.function.name, arguments: JSON.stringify(args) } });
  });
  return { calls: kept, removedIn };
}
