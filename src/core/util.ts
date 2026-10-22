// Small helpers for reading untrusted input (export files, adapter replies, hand-written profiles).
// Input arrives as `unknown` and is narrowed with these guards, never cast.
import type { Json } from '../types';

let seq = 0;

/** A unique id with a prefix ("c…" for users, "m…" for messages). */
export function uid(prefix: string): string {
  seq += 1;
  return prefix + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Any value as a string ("" for null/undefined), optionally cut to `max` characters. */
export function str(v: unknown, max?: number): string {
  if (v == null) return '';
  const s = String(v);
  return max ? s.slice(0, max) : s;
}

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The objects in a list (anything else is skipped). */
export const objects = (v: unknown): Record<string, unknown>[] => arr(v).filter(isObj);

/** obj[key] when obj is an object. */
export const prop = (obj: unknown, key: string): unknown => (isObj(obj) ? obj[key] : undefined);

/** Is `v` one of `values`? */
export const oneOf = <T extends string>(values: readonly T[], v: unknown): v is T => values.some((x) => x === v);

/** Lowercase, dashes for anything else: "Parent of" → "parent-of". */
export function slug(v: unknown): string {
  return str(v)
    .trim()
    .toLowerCase()
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** JSON.parse that admits it doesn't know what it got. */
export function parseJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  return value;
}

/** `v` as JSON data, or undefined when it isn't (functions, undefined, NaN, cycles are dropped). */
export function asJson(v: unknown, seen = new Set<object>()): Json | undefined {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'object' || seen.has(v)) return undefined;
  seen.add(v);
  let out: Json;
  if (Array.isArray(v)) out = v.map((x) => asJson(x, seen) ?? null);
  else {
    const o: { [key: string]: Json } = {};
    for (const [k, x] of Object.entries(v)) {
      const j = asJson(x, seen);
      if (j !== undefined) o[k] = j;
    }
    out = o;
  }
  seen.delete(v); // only cycles are dropped; the same object twice is fine
  return out;
}

/** The message of anything thrown. */
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
