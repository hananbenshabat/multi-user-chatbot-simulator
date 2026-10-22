// Export and import of whole sessions (the JSON file format; see docs/api.md).
import type { AdapterSettings, Message, Session } from '../types';
import { fieldValues, PRESETS } from './profile';
import { emptySession, VERSION } from './session';
import { link } from './links';
import { normalizeMessage } from './messages';
import { arr, isObj, objects, oneOf, parseJson, str, uid } from './util';

function stripSecrets(settings: Session['settings'], secretKeys: Record<string, string[]>): Session['settings'] {
  const out: Session['settings'] = {};
  for (const [type, values] of Object.entries(settings || {})) {
    out[type] = Object.fromEntries(Object.entries(values || {}).filter(([key]) => !(secretKeys[type] || []).includes(key)));
  }
  return out;
}

/** The whole session as pretty JSON. Settings listed in secretKeys[type] are left out. */
export function exportSession(session: Session, secretKeys: Record<string, string[]> = {}): string {
  return JSON.stringify(
    {
      format: 'chatbot-sim',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      profile: session.profile,
      options: session.options,
      settings: stripSecrets(session.settings, secretKeys),
      users: session.users,
      links: session.links,
    },
    null,
    2,
  );
}

/** Adapter settings from untrusted input: per adapter type, keys with string, number or boolean values. */
export function settingsFrom(input: unknown): Session['settings'] {
  const out: Session['settings'] = {};
  if (!isObj(input)) return out;
  for (const [type, values] of Object.entries(input)) {
    if (!isObj(values)) continue;
    const kept: AdapterSettings = {};
    for (const [k, v] of Object.entries(values)) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') kept[k] = v;
    out[type] = kept;
  }
  return out;
}

const SENDERS: readonly Message['from'][] = ['me', 'bot', 'system'];

function importMessage(m: Record<string, unknown>): Message {
  const out: Message = {
    id: str(m.id) || uid('m'),
    from: oneOf(SENDERS, m.from) ? m.from : 'bot',
    at: str(m.at) || new Date().toISOString(),
    ...(normalizeMessage(m) || { text: '' }),
  };
  // older saved messages can have a reply without a kind
  if (isObj(m.reply)) out.reply = { id: str(m.reply.id), kind: str(m.reply.kind) || 'button' };
  if (m.error) out.error = true;
  if (m.answered === true) out.answered = true;
  const deliveredTo = arr(m.deliveredTo)
    .map((a) => str(a, 200))
    .filter(Boolean);
  if (Array.isArray(m.deliveredTo)) out.deliveredTo = deliveredTo;
  return out;
}

/**
 * Parse and validate an exported session (versions 1–3; before version 3 the list was called
 * "cards"). Unknown relations and links to missing users are dropped; messages are normalized.
 * Throws with a readable message when the file can't be used.
 */
export function importSession(input: string | object): Session {
  let data: unknown = input;
  if (typeof input === 'string') {
    try {
      data = parseJson(input);
    } catch {
      throw new Error('not valid JSON');
    }
  }
  if (!isObj(data)) throw new Error('missing "users" array');
  const list = data.users ?? data.cards;
  if (!Array.isArray(list)) throw new Error('missing "users" array');
  if (Number(data.version) > VERSION) throw new Error('file is from a newer version (' + str(data.version) + ')');
  const session = emptySession(data.profile || PRESETS.generic);
  if (isObj(data.options) && typeof data.options.autoCreate === 'boolean') session.options.autoCreate = data.options.autoCreate;
  session.settings = settingsFrom(data.settings);
  const ids = new Set<string>();
  const parents: { child: string; parent: string }[] = [];
  for (const c of list) {
    if (!isObj(c) || !c.type) throw new Error('every user needs a "type"');
    const id = str(c.id) || uid('c');
    if (ids.has(id)) throw new Error('duplicate user id: ' + id);
    ids.add(id);
    session.users.push({
      id,
      type: str(c.type),
      name: str(c.name) || 'User',
      address: str(c.address),
      role: str(c.role),
      fields: fieldValues(c.fields),
      messages: objects(c.messages).map(importMessage),
    });
    if (c.parentId) parents.push({ child: id, parent: str(c.parentId) });
  }
  const rels = new Set(session.profile.relations.map((r) => r.id));
  for (const l of objects(data.links)) {
    if (rels.has(str(l.rel))) link(session, str(l.rel), str(l.from), str(l.to));
  }
  // version 1 files: a parentId tree → links along the first relation
  const legacy = session.profile.relations[0];
  if (legacy) for (const { child, parent } of parents) link(session, legacy.id, parent, child);
  return session;
}
