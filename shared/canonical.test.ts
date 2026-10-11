import { describe, expect, it } from "vitest";
import { canonical } from "./canonical.ts";

describe("canonical JSON", () => {
  it("sorts object keys", () => {
    expect(canonical({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("gives the same text no matter what order keys were added in", () => {
    const first = { v: 1, method: "google", claim: { domain: "coinbase.com" } };
    const second = { claim: { domain: "coinbase.com" }, method: "google", v: 1 };
    expect(canonical(first)).toBe(canonical(second));
  });

  it("sorts keys inside nested objects and arrays of objects", () => {
    expect(canonical({ z: { y: 1, x: 2 }, list: [{ b: 1, a: 2 }] })).toBe(
      '{"list":[{"a":2,"b":1}],"z":{"x":2,"y":1}}',
    );
  });

  it("keeps array order as given", () => {
    expect(canonical([3, 1, 2])).toBe("[3,1,2]");
  });

  it("escapes strings exactly like JSON and keeps unicode", () => {
    expect(canonical({ s: 'quote " and \\ backslash', u: "café ✓" })).toBe(
      '{"s":"quote \\" and \\\\ backslash","u":"café ✓"}',
    );
  });

  it("allows null, booleans and safe integers", () => {
    expect(canonical({ n: null, t: true, f: false, i: -42, big: 1791111300 })).toBe(
      '{"big":1791111300,"f":false,"i":-42,"n":null,"t":true}',
    );
  });

  it("rejects floats, NaN, Infinity and -0", () => {
    expect(() => canonical({ x: 1.5 })).toThrow();
    expect(() => canonical({ x: Number.NaN })).toThrow();
    expect(() => canonical({ x: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => canonical({ x: -0 })).toThrow();
  });

  it("rejects integers too large to be exact", () => {
    expect(() => canonical({ x: 2 ** 53 })).toThrow();
  });

  it("rejects undefined, dates, bigints and class instances", () => {
    expect(() => canonical({ x: undefined })).toThrow();
    expect(() => canonical({ x: new Date(0) })).toThrow();
    expect(() => canonical({ x: 10n })).toThrow();
    class Thing {}
    expect(() => canonical({ x: new Thing() })).toThrow();
  });
});
