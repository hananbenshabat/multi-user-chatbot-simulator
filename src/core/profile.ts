// Profiles: everything domain-specific (IDs, roles, relations, custom fields, wording, looks).
// Sessions carry their profile; normalizeProfile turns any object into a valid one.
import type { Appearance, FieldDef, FieldType, FieldValue, Profile, ProfileInput, Relation, Role } from '../types';
import { arr, isObj, objects, oneOf, prop, slug, str } from './util';

const FIELD_TYPES: readonly FieldType[] = ['text', 'textarea', 'number', 'select', 'checkbox'];
const COLOR = /^#[0-9a-f]{3,8}$/i;

export const isFieldType = (v: unknown): v is FieldType => oneOf(FIELD_TYPES, v);

/** `v` when it's one of `values`, else the first value. */
const choice = <T extends string>(values: readonly [T, ...T[]], v: unknown): T => (oneOf(values, v) ? v : values[0]);

/** A whole number within [min, max], or `fallback` when `v` isn't a number. */
function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

const DEFAULT_ACCENT = '#1f7a5a';

/** Appearance with every value valid: unknown choices fall back, numbers are clamped. */
export function normalizeAppearance(input: unknown): Appearance {
  const a = isObj(input) ? input : {};
  const accent = str(a.accent);
  return {
    theme: choice(['auto', 'light', 'dark'], a.theme),
    direction: choice(['ltr', 'rtl'], a.direction),
    density: choice(['comfortable', 'compact'], a.density),
    layout: choice(['rows', 'grid'], a.layout),
    bubbles: choice(['rounded', 'square'], a.bubbles),
    accent: COLOR.test(accent) ? accent : DEFAULT_ACCENT,
    groupBy: str(a.groupBy), // relation id, "role", or "" (one group)
    chatWidth: clamp(a.chatWidth ?? a.cardWidth, 220, 800, 320), // cardWidth/cardHeight: before 0.5
    chatHeight: clamp(a.chatHeight ?? a.cardHeight, 240, 1200, 480),
    fontSize: clamp(a.fontSize, 11, 20, 14),
    showId: bool(a.showId, true),
    showTimestamps: bool(a.showTimestamps, true),
    showFields: bool(a.showFields, true),
    showLinks: bool(a.showLinks, true),
  };
}

/** A field value with the field's type: number ('' when empty), boolean or string. */
export function coerceField(f: Pick<FieldDef, 'type' | 'options'>, v: unknown): FieldValue {
  if (f.type === 'checkbox') return v === true || v === 'true';
  if (f.type === 'number') {
    const n = Number(v);
    return v === '' || v == null || !Number.isFinite(n) ? '' : n;
  }
  if (f.type === 'select') return f.options.includes(str(v)) ? str(v) : f.options[0] || '';
  return str(v);
}

/** Field values from untrusted input: strings, finite numbers and booleans are kept. */
export function fieldValues(input: unknown): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  if (!isObj(input)) return out;
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
  }
  return out;
}

const DEFAULT_LABELS: Profile['labels'] = { user: 'User', send: 'Send', placeholder: 'Type a message', me: 'me', bot: 'bot' };
/** The placeholder before 0.5, which every saved profile stored: it becomes the new default. */
const OLD_PLACEHOLDER = 'Message as {name}';

function normalizeLabels(input: unknown): Profile['labels'] {
  const given = isObj(input) ? input : {};
  const label = (key: keyof Profile['labels']) => (given[key] == null ? DEFAULT_LABELS[key] : str(given[key], 80));
  // Before 0.5 this was labels.card, and every saved profile stored its default "Card".
  const card = str(given.card, 80);
  return {
    user: given.user == null && card && card !== 'Card' ? card : label('user'),
    send: label('send'),
    placeholder: given.placeholder === OLD_PLACEHOLDER ? DEFAULT_LABELS.placeholder : label('placeholder'),
    me: label('me'),
    bot: label('bot'),
  };
}

/**
 * Make any object a valid profile: bad ids are slugged or dropped, unknown roles in relations
 * become "*", field defaults get the field's type, appearance values are clamped. Never throws,
 * so a hand-written profile can't break the page.
 */
export function normalizeProfile(input: unknown): Profile {
  const p = isObj(input) ? input : {};
  const roleIds = new Set<string>();
  const roles: Role[] = [];
  for (const r of objects(p.roles)) {
    const id = slug(r.id);
    if (!id || roleIds.has(id)) continue;
    roleIds.add(id);
    roles.push({
      id,
      label: str(r.label) || id,
      color: COLOR.test(str(r.color)) ? str(r.color) : '',
      icon: str(r.icon, 4),
      idPattern: str(r.idPattern),
    });
  }
  const relIds = new Set<string>();
  const relations: Relation[] = [];
  const end = (x: string) => (x === '*' || roleIds.has(x) ? x : '*');
  for (const r of objects(p.relations)) {
    const id = slug(r.id);
    if (!id || relIds.has(id) || id === 'role') continue;
    relIds.add(id);
    relations.push({ id, label: str(r.label) || id, from: end(slug(r.from) || '*'), to: end(slug(r.to) || '*') });
  }
  const keys = new Set<string>();
  const fields: FieldDef[] = [];
  for (const f of objects(p.fields)) {
    const key = str(f.key)
      .trim()
      .replace(/[^\w-]/g, '');
    if (!key || keys.has(key)) continue;
    keys.add(key);
    const type: FieldType = isFieldType(f.type) ? f.type : 'text';
    const options =
      type === 'select'
        ? arr(f.options)
            .map((o) => str(o).trim())
            .filter(Boolean)
        : [];
    fields.push({
      key,
      label: str(f.label) || key,
      type,
      options,
      default: coerceField({ type, options }, f.default),
      roles: arr(f.roles)
        .map(slug)
        .filter((r) => roleIds.has(r)),
      showAsChip: (f.showAsChip ?? f.showOnCard) !== false, // showOnCard: before 0.5
    });
  }
  const appearance = normalizeAppearance(p.appearance);
  if (appearance.groupBy && appearance.groupBy !== 'role' && !relIds.has(appearance.groupBy)) {
    appearance.groupBy = relations[0] ? relations[0].id : '';
  }
  return {
    name: str(p.name, 80) || 'Untitled profile',
    identity: { label: str(prop(p.identity, 'label'), 40) || 'ID', pattern: str(prop(p.identity, 'pattern')) || 'user-{n}' },
    roles,
    relations,
    fields,
    appearance,
    labels: normalizeLabels(p.labels),
  };
}

export const PRESETS: Record<string, ProfileInput> = {
  generic: {
    name: 'Generic',
    identity: { label: 'ID', pattern: 'user-{n}' },
    roles: [],
    relations: [{ id: 'linked', label: 'Linked', from: '*', to: '*' }],
    appearance: { groupBy: 'linked' },
  },
  team: {
    name: 'Team',
    identity: { label: 'ID', pattern: 'user-{n}' },
    roles: [
      { id: 'lead', label: 'Lead', color: '#3b6fd8', icon: '★' },
      { id: 'member', label: 'Member', color: '#8a4fd8' },
    ],
    relations: [
      { id: 'leads', label: 'Leads', from: 'lead', to: 'member' },
      // members can link each other too; groups still follow "leads"
      { id: 'works-with', label: 'Works with', from: 'member', to: 'member' },
    ],
    appearance: { groupBy: 'leads' },
  },
  support: {
    name: 'Support desk',
    identity: { label: 'Email', pattern: 'user{n}@example.test' },
    roles: [
      { id: 'customer', label: 'Customer', color: '#d8833b' },
      { id: 'agent', label: 'Agent', color: '#2a9d8f', icon: '🎧', idPattern: 'agent{n}@example.test' },
    ],
    relations: [{ id: 'assigned', label: 'Handles', from: 'agent', to: 'customer' }],
    fields: [
      { key: 'language', label: 'Language', type: 'select', options: ['en', 'he', 'ar', 'es'], default: 'en' },
      { key: 'plan', label: 'Plan', type: 'select', options: ['free', 'pro', 'enterprise'], default: 'free', roles: ['customer'] },
    ],
    appearance: { groupBy: 'assigned' },
  },
  classroom: {
    name: 'Classroom',
    identity: { label: 'Student no.', pattern: 's{n:4}' },
    roles: [
      { id: 'teacher', label: 'Teacher', color: '#c0392b', icon: '🍎', idPattern: 't{n:3}' },
      { id: 'student', label: 'Student', color: '#2980b9' },
      { id: 'parent', label: 'Parent', color: '#7f8c8d' },
    ],
    relations: [
      { id: 'teaches', label: 'Teaches', from: 'teacher', to: 'student' },
      { id: 'parent-of', label: 'Parent of', from: 'parent', to: 'student' },
    ],
    fields: [{ key: 'grade', label: 'Grade', type: 'number', default: 1, roles: ['student'] }],
    appearance: { groupBy: 'teaches' },
  },
  phones: {
    name: 'Phone numbers',
    identity: { label: 'Phone', pattern: '+1555{n:7}' },
    roles: [],
    relations: [{ id: 'linked', label: 'Linked', from: '*', to: '*' }],
    appearance: { groupBy: 'linked' },
  },
};

const OLD_TEAM_RELATIONS = JSON.stringify([{ id: 'leads', label: 'Leads', from: 'lead', to: 'member' }]);

/**
 * Profiles saved from an older preset that hasn't been edited since: bring them up to date. Today
 * only the Team preset changed (0.5 added "Works with" between members). Edited profiles are left alone.
 */
export function upgradePreset(profile: Profile): Profile {
  if (profile.name !== 'Team' || JSON.stringify(profile.relations) !== OLD_TEAM_RELATIONS) return profile;
  return { ...profile, relations: preset('team').relations };
}

/** A preset by name (the generic one when unknown), as a fresh normalized profile. */
export function preset(name: string): Profile {
  return normalizeProfile(structuredClone(PRESETS[name] || PRESETS.generic));
}

export const roleDef = (profile: Profile, id: string): Role | null => profile.roles.find((r) => r.id === id) || null;
export const relationDef = (profile: Profile, id: string | null): Relation | null => profile.relations.find((r) => r.id === id) || null;

/** Does a relation end ("*" or a role id) accept a user of `role`? */
export const roleFits = (end: string, role: string): boolean => end === '*' || end === role;

/** Relations a user of `role` can start (as "from"). */
export const relationsFrom = (profile: Profile, role: string): Relation[] => profile.relations.filter((r) => roleFits(r.from, role));
/** Relations a user of `role` can be the target of. */
export const relationsTo = (profile: Profile, role: string): Relation[] => profile.relations.filter((r) => roleFits(r.to, role));

/** The custom fields a user of `role` has. */
export const fieldsFor = (profile: Profile, role: string): FieldDef[] =>
  profile.fields.filter((f) => !f.roles.length || f.roles.includes(role));

export function defaultFields(profile: Profile, role: string): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const f of fieldsFor(profile, role)) out[f.key] = f.default;
  return out;
}
