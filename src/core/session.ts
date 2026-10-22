// The session: a profile, the users with their chats, the links between them, adapter settings.
import type { FieldValue, Message, ProfileInput, Session, User } from '../types';
import { defaultFields, normalizeProfile, PRESETS, roleDef } from './profile';
import { uid } from './util';

/** The export format's version (see io.ts). */
export const VERSION = 3;

export function emptySession(profile?: ProfileInput): Session {
  return {
    version: VERSION,
    profile: normalizeProfile(profile || PRESETS.generic),
    users: [],
    links: [],
    settings: {},
    options: { autoCreate: true },
  };
}

/** Addresses match loosely: "+1 (555) 01-02" and "15550102" are the same. */
export function addrKey(address: string): string {
  return address.replace(/[\s\-()+.]/g, '').toLowerCase();
}

export const findUser = (session: Session, id: string): User | null => session.users.find((c) => c.id === id) || null;

export function findByAddress(session: Session, address: string): User | null {
  const key = addrKey(address);
  if (!key) return null;
  return session.users.find((c) => addrKey(c.address) === key) || null;
}

/** "{n}" → the number, "{n:4}" → zero-padded to 4 digits; no "{n}" → the number appended. */
export function formatPattern(pattern: string, n: number): string {
  const out = String(pattern).replace(/\{n(?::(\d{1,2}))?\}/g, (_, w) => String(n).padStart(Number(w) || 0, '0'));
  return out.includes(String(n)) ? out : out + n;
}

/** The first free address from the role's (or the profile's) pattern. */
export function nextAddress(session: Session, role: string): string {
  const pattern = roleDef(session.profile, role)?.idPattern || session.profile.identity.pattern;
  const used = new Set(session.users.map((c) => addrKey(c.address)));
  for (let n = 1; ; n++) {
    const a = formatPattern(pattern, n);
    if (!used.has(addrKey(a))) return a;
  }
}

export interface NewUser {
  type: string;
  name?: string;
  address?: string;
  role?: string;
  fields?: Record<string, FieldValue>;
}

/** Add a user; a missing name and address come from the profile. Throws on a used address. */
export function createUser(session: Session, { type, name, address, role, fields }: NewUser): User {
  if (!type) throw new Error('user type is required');
  if (address && findByAddress(session, address)) throw new Error('already used: ' + address);
  const r = roleDef(session.profile, role || '');
  const user: User = {
    id: uid('c'),
    type,
    name: name || (r ? r.label : session.profile.labels.user) + ' ' + (session.users.length + 1),
    address: address || nextAddress(session, role || ''),
    role: role || '',
    fields: { ...defaultFields(session.profile, role || ''), ...fields },
    messages: [],
  };
  session.users.push(user);
  return user;
}

/** All messages of all users, oldest first. */
export function timeline(session: Session): { user: User; message: Message }[] {
  const all = session.users.flatMap((user) => user.messages.map((message) => ({ user, message })));
  return all.sort((a, b) => (a.message.at < b.message.at ? -1 : a.message.at > b.message.at ? 1 : 0));
}

export type UserInfo = { id: string; name: string; address: string; role: string; fields: Record<string, FieldValue> };

/** A plain, JSON-safe view of a user for adapters and templates. */
export function userInfo(user: User | null | undefined): UserInfo | null {
  return user ? { id: user.id, name: user.name, address: user.address, role: user.role, fields: user.fields } : null;
}
