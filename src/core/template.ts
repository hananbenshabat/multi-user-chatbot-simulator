// Template filling for the HTTP adapter's body and actions.
import type { Json } from '../types';
import { asJson, isObj } from './util';

/** "a.b[0].c" → the value inside `obj`; an empty path → `obj` itself. */
export function getPath(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const part of path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)) {
    if (Array.isArray(cur)) cur = cur[Number(part)];
    else if (isObj(cur)) cur = cur[part];
    else return undefined;
  }
  return cur;
}

/**
 * Fill "{{x}}" placeholders from `vars`. A string that is exactly "{{x}}" keeps x's type (null when
 * missing); inside a longer string it is interpolated (objects as JSON, missing as "").
 */
export function fillTemplate(value: Json, vars: Json): Json {
  if (typeof value === 'string') {
    const whole = /^\{\{\s*([\w.-]+)\s*\}\}$/.exec(value);
    if (whole) return asJson(getPath(vars, whole[1])) ?? null;
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k: string) => {
      const v = asJson(getPath(vars, k));
      return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => fillTemplate(v, vars));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillTemplate(v, vars)]));
  }
  return value;
}
