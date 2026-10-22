// Parsing and checking scripts: JSON scenarios that create users and act as them (docs/scripts.md).
//
//   {
//     "name": "Lead asks two members",
//     "profile": "team",            // optional: preset name or profile object
//     "reset": true,                // optional: remove all users first (profile and settings stay)
//     "delay": 300,                 // optional: ms between steps (to watch it happen)
//     "timeout": 5000,              // optional: how long "tap" waits for its button
//     "users": [
//       { "ref": "lead", "name": "Lead", "role": "lead" },
//       { "ref": "m", "name": "Member", "role": "member", "linkFrom": "lead", "count": 3 }   // m1, m2, m3
//     ],
//     "steps": [
//       { "as": "lead", "say": "hello", "to": ["m1", "m3"] },
//       { "as": "m1", "tap": "OK" },
//       { "expect": { "user": "lead", "text": "answered" } }
//     ]
//   }
//
// A bare array is a list of steps.
import type { FieldValue, Profile } from '../types';
import { fieldValues, normalizeProfile, slug } from '../core';
import { arr, errorText, isObj, parseJson, str } from '../core/util';

export interface ScriptUser {
  ref: string;
  name: string;
  role: string;
  type: string;
  address: string;
  fields: Record<string, FieldValue> | null;
  /** a user ref, or { user: ref, rel?: relation } */
  linkFrom: string | { user: string; rel?: string } | null;
  count: number;
}

export type SharedContact = string | { name: string; address: string };

export type Step =
  | { kind: 'say'; as: string; text: string; to?: string[] }
  | { kind: 'tap'; as: string; tap: string; timeout?: number }
  | { kind: 'share'; as: string; share: SharedContact[] }
  | { kind: 'add'; user: ScriptUser }
  | { kind: 'link'; from: string; to: string; rel: string }
  | { kind: 'action'; action: string; adapter: string }
  | { kind: 'wait'; ms: number }
  | { kind: 'expect'; user: string; text: string | null; match?: RegExp; none: boolean; last: boolean; within: number | null }
  | { kind: 'clear' };

type StepKind = Step['kind'];

export interface ParsedScript {
  name: string;
  /** a preset name, or the script's own profile (normalized) */
  profile: string | Profile | null;
  reset: boolean;
  delay: number;
  timeout: number;
  users: ScriptUser[];
  steps: Step[];
}

const STEP_KEYS: Record<StepKind, readonly string[]> = {
  say: ['as', 'say', 'to'],
  tap: ['as', 'tap', 'timeout'],
  share: ['as', 'share'],
  add: ['add'],
  link: ['link'],
  action: ['action', 'adapter'],
  wait: ['wait'],
  expect: ['expect'],
  clear: ['clear'],
};
const STEP_KINDS: readonly StepKind[] = ['say', 'tap', 'share', 'add', 'link', 'action', 'wait', 'expect', 'clear'];
const USER_KEYS = ['ref', 'name', 'role', 'type', 'address', 'fields', 'linkFrom', 'count'];
const EXPECT_KEYS = ['user', 'text', 'match', 'none', 'last', 'within'];

/** parseScript results, so runScript doesn't parse them again. */
const parsedScripts = new WeakMap<object, ParsedScript>();

/** `v` when it is a parseScript() result. */
export const alreadyParsed = (v: unknown): ParsedScript | undefined => (isObj(v) ? parsedScripts.get(v) : undefined);

function fail(where: string, msg: string): never {
  throw new Error((where ? where + ': ' : '') + msg);
}

function onlyKeys(obj: object, allowed: readonly string[], where: string) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) fail(where, 'unknown key "' + k + '" (allowed: ' + allowed.join(', ') + ')');
}

/** Before 0.5 users were "cards": accept the old key names in saved scripts. */
function renamed(obj: Record<string, unknown>, from: string, to: string): Record<string, unknown> {
  if (!(from in obj) || to in obj) return obj;
  const { [from]: value, ...rest } = obj;
  return { ...rest, [to]: value };
}

function parseLinkFrom(v: unknown, where: string): ScriptUser['linkFrom'] {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v;
  if (isObj(v)) {
    const l = renamed(v, 'card', 'user');
    if (l.user) return l.rel ? { user: str(l.user), rel: str(l.rel) } : { user: str(l.user) };
  }
  return fail(where, '"linkFrom" is a user ref or { "user": ref, "rel": relation }');
}

function parseUser(input: unknown, where: string): ScriptUser {
  if (!isObj(input)) fail(where, 'a user must be an object');
  onlyKeys(input, USER_KEYS, where);
  const count = input.count == null ? 1 : Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 500) fail(where, '"count" must be a whole number from 1 to 500');
  if (input.fields != null && !isObj(input.fields)) fail(where, '"fields" must be an object');
  if (count > 1 && input.address) fail(where, '"address" can only be set when "count" is 1');
  return {
    ref: str(input.ref) || slug(input.name),
    name: str(input.name),
    role: slug(input.role),
    type: str(input.type),
    address: str(input.address),
    fields: input.fields == null ? null : fieldValues(input.fields),
    linkFrom: parseLinkFrom(input.linkFrom, where),
    count,
  };
}

function parseContact(x: unknown): SharedContact | null {
  if (typeof x === 'string') return x || null;
  if (isObj(x) && x.address) return { name: str(x.name), address: str(x.address) };
  return null;
}

function parseExpect(input: unknown, where: string): Step {
  const e = isObj(input) ? renamed(input, 'card', 'user') : null;
  if (!e?.user) return fail(where, '"expect" needs { "user", and "text", "match" or "none" }');
  onlyKeys(e, EXPECT_KEYS, where);
  if (e.text == null && e.match == null && !e.none) fail(where, '"expect" needs "text", "match" or "none": true');
  let match: RegExp | undefined;
  if (e.match != null) {
    try {
      match = new RegExp(str(e.match), 'i');
    } catch {
      fail(where, '"match" is not a valid regular expression');
    }
  }
  return {
    kind: 'expect',
    user: str(e.user),
    text: e.text != null ? str(e.text) : null,
    ...(match ? { match } : {}),
    none: !!e.none,
    last: !!e.last,
    within: e.within != null ? Number(e.within) : null,
  };
}

function parseStep(s: unknown, where: string): Step {
  if (!isObj(s)) return fail(where, 'a step must be an object');
  const kind = STEP_KINDS.find((k) => k in s);
  if (!kind) return fail(where, 'unknown step; use one of: ' + STEP_KINDS.join(', '));
  onlyKeys(s, STEP_KEYS[kind], where);
  const as = () => (s.as ? str(s.as) : fail(where, '"as" (the user that acts) is required'));
  switch (kind) {
    case 'say': {
      if (typeof s.say !== 'string' || !s.say) fail(where, '"say" must be some text');
      const text = s.say;
      if (s.to == null) return { kind, as: as(), text };
      const to = (Array.isArray(s.to) ? s.to : [s.to]).map((t) => str(t));
      if (!to.length || to.some((t) => !t)) fail(where, '"to" is a user ref or a list of them');
      return { kind, as: as(), text, to };
    }
    case 'tap': {
      if (!str(s.tap)) fail(where, '"tap" is a button or list row (its title or id)');
      return { kind, as: as(), tap: str(s.tap), ...(s.timeout != null ? { timeout: Number(s.timeout) } : {}) };
    }
    case 'share': {
      const list = Array.isArray(s.share) ? s.share : [s.share];
      const share = list.map(parseContact).filter((c) => c !== null);
      if (!list.length || share.length < list.length) fail(where, '"share" is user refs or { "name", "address" } objects');
      return { kind, as: as(), share };
    }
    case 'add':
      return { kind, user: parseUser(s.add, where + ' add') };
    case 'link': {
      const l = s.link;
      if (!isObj(l) || !l.from || !l.to) return fail(where, '"link" needs { "from", "to", "rel"? }');
      return { kind, from: str(l.from), to: str(l.to), rel: str(l.rel) };
    }
    case 'action': {
      if (!str(s.action)) fail(where, '"action" is an action id or label');
      return { kind, action: str(s.action), adapter: str(s.adapter) };
    }
    case 'wait': {
      const ms = Number(s.wait);
      if (!(ms >= 0 && ms <= 600000)) fail(where, '"wait" is milliseconds (0 to 600000)');
      return { kind, ms };
    }
    case 'expect':
      return parseExpect(s.expect, where);
    case 'clear':
      if (s.clear !== true) fail(where, 'use "clear": true');
      return { kind };
  }
}

function readInput(input: unknown): Record<string, unknown> {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = parseJson(input);
    } catch (e) {
      throw new Error('not valid JSON: ' + errorText(e), { cause: e });
    }
  }
  if (Array.isArray(data)) return { steps: data };
  if (!isObj(data)) throw new Error('a script is an object with "steps" (or just an array of steps)');
  return renamed(data, 'cards', 'users');
}

/**
 * Parse and check a script (JSON text, an object, or an array of steps).
 * Throws an Error naming the bad user or step, e.g. "step 3: "say" must be some text".
 */
export function parseScript(input: unknown): ParsedScript {
  const data = readInput(input);
  onlyKeys(data, ['name', 'profile', 'reset', 'delay', 'timeout', 'users', 'steps'], 'script');
  if (data.users != null && !Array.isArray(data.users)) throw new Error('"users" must be a list');
  if (!Array.isArray(data.steps)) throw new Error('"steps" must be a list');
  const users = arr(data.users).map((c, i) => parseUser(c, 'user ' + (i + 1)));
  // with "reset", an empty script would only remove everyone and still "pass"
  if (!users.length && !data.steps.length) throw new Error('the script has no users and no steps, so it would do nothing');
  const refs = new Set<string>();
  users.forEach((c, i) => {
    if (!c.ref) fail('user ' + (i + 1), 'needs a "ref" or a "name"');
    if (refs.has(c.ref)) fail('user ' + (i + 1), 'ref "' + c.ref + '" is used twice');
    refs.add(c.ref);
  });
  const profile = typeof data.profile === 'string' ? data.profile : isObj(data.profile) ? normalizeProfile(data.profile) : null;
  const parsed: ParsedScript = {
    name: str(data.name) || 'Untitled script',
    profile: profile || null,
    reset: !!data.reset,
    delay: Math.max(0, Number(data.delay) || 0),
    timeout: Number(data.timeout) > 0 ? Number(data.timeout) : 5000,
    users,
    steps: data.steps.map((s, i) => parseStep(s, 'step ' + (i + 1))),
  };
  parsedScripts.set(parsed, parsed);
  return parsed;
}

/** One-line description of a parsed step, for logs. */
export function describe(step: Step): string {
  switch (step.kind) {
    case 'say':
      return step.as + ' says "' + step.text + '"' + (step.to ? ' → ' + step.to.join(', ') : '');
    case 'tap':
      return step.as + ' taps "' + step.tap + '"';
    case 'share':
      return step.as + ' shares ' + step.share.map((x) => (typeof x === 'string' ? x : x.name || x.address)).join(', ');
    case 'add':
      return 'add ' + (step.user.count > 1 ? step.user.count + '× ' : '') + (step.user.name || step.user.ref);
    case 'link':
      return 'link ' + step.from + ' → ' + step.to + (step.rel ? ' (' + step.rel + ')' : '');
    case 'action':
      return 'action "' + step.action + '"';
    case 'wait':
      return 'wait ' + step.ms + ' ms';
    case 'expect':
      return (
        'expect ' +
        step.user +
        (step.none ? ' to get nothing' : ' to get ' + (step.text != null ? '"' + step.text + '"' : String(step.match)))
      );
    case 'clear':
      return 'clear all users';
  }
}
