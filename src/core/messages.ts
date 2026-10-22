// Chat messages: normalizing what adapters send, and routing replies to the right users.
import type { Message, Replies, Reply, Session, User } from '../types';
import { createUser } from './session';
import { link, relationFor, rootOf } from './links';
import { findByAddress } from './session';
import { arr, asJson, isObj, objects, prop, slug, str, uid } from './util';

/** A message without its envelope (id, sender, time). */
export type MessageBody = Omit<Message, 'id' | 'from' | 'at'>;

/** Image URLs that are safe to show: http(s) and inline images. Rendered only as <img src>, where SVG scripts never run. */
function safeUrl(u: unknown): string {
  const s = str(u).trim();
  return /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,])/i.test(s) ? s : '';
}

/** A button or list row: `{ id, title }` (either one is enough), or just a string. */
function choiceFrom(c: unknown): { id: string; title: string } | null {
  if (typeof c === 'string') return c ? { id: c, title: c } : null;
  if (!isObj(c)) return null;
  const title = str(c.title ?? c.id);
  return title ? { id: str(c.id ?? c.title), title } : null;
}

const present = <T>(v: T | null): v is T => v !== null;

/** Accepts the standard reply shape (see docs/adapters.md) and a few lenient aliases; null when empty. */
export function normalizeMessage(raw: unknown): MessageBody | null {
  if (typeof raw === 'string') return raw ? { text: raw } : null;
  if (!isObj(raw)) return null;
  const msg: MessageBody = {};
  const text = raw.text ?? raw.body;
  if (text != null && text !== '') msg.text = str(text);
  const buttons = arr(raw.buttons).map(choiceFrom).filter(present);
  if (buttons.length) msg.buttons = buttons;
  const rows = objects(prop(raw.list, 'rows'))
    .map((r) => {
      const c = choiceFrom(r);
      return c && { ...c, description: str(r.description) };
    })
    .filter(present);
  if (rows.length) msg.list = { button: str(prop(raw.list, 'button')) || 'Choose', rows };
  const url = safeUrl(typeof raw.image === 'string' ? raw.image : prop(raw.image, 'url'));
  if (url) msg.image = { url, alt: str(prop(raw.image, 'alt') || prop(raw.image, 'caption')) };
  const contacts = objects(raw.contacts)
    .map((c) => ({ name: str(c.name, 200), address: str(c.address ?? c.phone, 200) }))
    .filter((c) => c.address);
  if (contacts.length) msg.contacts = contacts;
  const author = str(raw.author, 200);
  if (author) msg.author = author;
  const targets = arr(raw.targets)
    .map((t) => str(t, 200))
    .filter(Boolean);
  if (targets.length) msg.targets = targets;
  const meta = asJson(raw.meta);
  if (meta !== undefined) msg.meta = meta;
  if (!msg.text && !msg.buttons && !msg.list && !msg.image && !msg.contacts && msg.meta === undefined) return null;
  return msg;
}

/** A reply split into its message and where it goes. */
interface Addressed {
  msg: MessageBody;
  to: string;
  toName: string;
  toRole: string;
  /** false: don't link a new user into the sender's group */
  link: boolean;
}

function readReply(raw: unknown): Addressed | null {
  const msg = normalizeMessage(raw);
  if (!msg) return null;
  const field = (k: string) => str(prop(raw, k));
  return { msg, to: field('to'), toName: field('toName'), toRole: field('toRole'), link: prop(raw, 'link') !== false };
}

/** A reply from untrusted input (a server's JSON): the message plus where it goes; null when empty. */
export function normalizeReply(raw: unknown): Reply | null {
  const r = readReply(raw);
  if (!r) return null;
  const reply: Reply = { ...r.msg };
  if (r.to) reply.to = r.to;
  if (r.toName) reply.toName = r.toName;
  if (r.toRole) reply.toRole = r.toRole;
  if (!r.link) reply.link = false;
  return reply;
}

export function addMessage(user: User, from: Message['from'], msg: MessageBody, at?: string): Message {
  const m: Message = { id: uid('m'), from, at: at || new Date().toISOString(), ...msg };
  user.messages.push(m);
  return m;
}

/** What an adapter returned, as a list: an array, or { replies: [...] }, or nothing. */
export function replyList(replies: Replies): Reply[] {
  return Array.isArray(replies) ? replies : replies?.replies || [];
}

export interface Routed {
  delivered: { user: User; message: Message }[];
  /** replies for an unknown address (when users aren't created automatically) */
  unrouted: (MessageBody & { to: string })[];
  created: User[];
}

/**
 * Deliver adapter replies as bot messages:
 * - no `to`: the sender
 * - a known `to`: that user (addresses match loosely, see addrKey)
 * - an unknown `to`, when autoCreate is on: a new user linked under the sender's group root.
 *   Its role is `toRole`, or the role the linking relation points to.
 * Polled replies have no sender: pass opts.type so new users get an adapter type.
 */
export function routeReplies(
  session: Session,
  sender: User | null,
  replies: Replies,
  opts?: { type?: string; autoCreate?: boolean },
): Routed {
  const autoCreate = opts?.autoCreate ?? session.options.autoCreate;
  const out: Routed = { delivered: [], unrouted: [], created: [] };
  for (const raw of replyList(replies)) {
    // adapters written in plain JS can send anything: read each reply as untrusted
    const reply = readReply(raw);
    if (!reply) continue;
    const { msg, to, toName, toRole } = reply;
    let target = to ? findByAddress(session, to) : sender;
    const type = sender ? sender.type : opts?.type;
    if (!target && autoCreate && to && type) {
      let role = slug(toRole);
      const rootUser = sender && reply.link ? rootOf(session, sender) : null;
      const rel = rootUser ? relationFor(session, rootUser, role) : null;
      if (!role && rel && rel.to !== '*') role = rel.to;
      target = createUser(session, { type, name: toName || to, address: to, role });
      if (rel && rootUser) link(session, rel.id, rootUser.id, target.id);
      out.created.push(target);
    }
    if (!target) {
      out.unrouted.push({ to, ...msg });
      continue;
    }
    out.delivered.push({ user: target, message: addMessage(target, 'bot', msg) });
  }
  return out;
}
