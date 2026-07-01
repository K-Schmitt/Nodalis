/**
 * Helpers to mutate a `record` node's instance data (columns / attributes /
 * methods) immutably, ready to POST as an `update_node` change set.
 */

/** Rewrite the display text (and type) of one row, preserving string/object shape. */
export function setRow(row: unknown, text: string, type?: string): unknown {
  if (row && typeof row === 'object') {
    const o = { ...(row as Record<string, unknown>) };
    if ('name' in o) o.name = text; else if ('field' in o) o.field = text; else o.name = text;
    if (type !== undefined) o.type = type;
    return o;
  }
  return type ? `${text} : ${type}` : text;
}

/** A fresh row appropriate for the compartment (typed for ERD/attrs, plain otherwise). */
export function newRow(compartmentFrom: string): unknown {
  if (/column|attribute|field/i.test(compartmentFrom)) return 'new_field : string';
  if (/method|operation/i.test(compartmentFrom)) return '+ newOperation()';
  return 'new_value';
}

/** Return a deep-ish clone of the node data with `key`'s array replaced. */
export function withArray(
  data: Record<string, unknown> | undefined,
  key: string,
  next: unknown[],
): Record<string, unknown> {
  return { ...(data ?? {}), [key]: next };
}
