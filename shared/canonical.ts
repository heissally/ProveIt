/**
 * Canonical JSON: exactly one string for a given value.
 *
 * A signature covers bytes, not meaning. `{"a":1,"b":2}` and `{"b":2,"a":1}` mean
 * the same thing but are different bytes, so the signer and every verifier must
 * agree on one spelling. These rules follow Lit's "Signed Data in Untrusted
 * Storage" guide:
 *
 *   - object keys sorted by code point, at every level
 *   - numbers must be safe integers (no floats, NaN, Infinity or -0)
 *   - only null, booleans, strings, numbers, arrays and plain objects
 *   - anything else (undefined, Date, BigInt, class instances) is an error
 *
 * The Lit Actions carry an identical copy of this function, because actions are
 * single self-contained files. A test will check that the copies match.
 */
export function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value);
    throw new Error(`canonical: only safe integers are allowed, got ${value}`);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonical).join(",") + "]";
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  }
  throw new Error(`canonical: unsupported value of type ${typeof value}`);
}
