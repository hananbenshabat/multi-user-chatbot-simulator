// Recording: turn what happened in a session into a script that replays it.
import type { Contact, FieldValue, Session } from '../types';
import { findByAddress, slug, timeline } from '../core';

type RecordedUser = {
  ref: string;
  name: string;
  role?: string;
  type: string;
  address: string;
  fields?: Record<string, FieldValue>;
  linkFrom?: { user: string; rel: string };
};
type RecordedStep =
  | { link: { from: string; to: string; rel: string } }
  | { as: string; tap: string }
  | { as: string; share: (string | Contact)[] }
  | { as: string; say: string; to?: string[] };

/**
 * A script that rebuilds the session's users and replays what they did (typed messages with their
 * targets, taps, shared contacts), in time order. Add "expect" steps to make it a test.
 */
export function scriptFromSession(session: Session, name?: string) {
  const refOf = new Map<string, string>();
  const used = new Set<string>();
  for (const c of session.users) {
    const base = slug(c.name) || 'user';
    let ref = base;
    for (let n = 2; used.has(ref); n++) ref = base + '-' + n;
    used.add(ref);
    refOf.set(c.id, ref);
  }
  /** Every user has a ref (set above); the id is only a fallback for a link to a missing user. */
  const refFor = (id: string) => refOf.get(id) ?? id;
  const refOrAddress = (address: string) => {
    const c = findByAddress(session, address);
    return c ? refFor(c.id) : address;
  };

  // Users in an order where each one's linkFrom user comes first; other links become steps.
  const placed = new Set<string>();
  const users: RecordedUser[] = [];
  const linkSteps: RecordedStep[] = [];
  const pending = session.users.slice();
  while (pending.length) {
    const i = pending.findIndex((c) => {
      const inbound = session.links.filter((l) => l.to === c.id);
      return !inbound.length || inbound.some((l) => placed.has(l.from));
    });
    const c = pending.splice(i < 0 ? 0 : i, 1)[0];
    const inbound = session.links.filter((l) => l.to === c.id);
    const first = inbound.find((l) => placed.has(l.from));
    const spec: RecordedUser = { ref: refFor(c.id), name: c.name, type: c.type, address: c.address };
    if (c.role) spec.role = c.role;
    if (c.fields && Object.keys(c.fields).length) spec.fields = c.fields;
    if (first) spec.linkFrom = { user: refFor(first.from), rel: first.rel };
    users.push(spec);
    placed.add(c.id);
    for (const l of inbound) if (l !== first) linkSteps.push({ link: { from: refFor(l.from), to: refFor(c.id), rel: l.rel } });
  }
  // a link can be seen twice when both ends were pending
  const seenLinks = new Set<string>();
  const steps = linkSteps.filter((s) => {
    const k = JSON.stringify(s);
    return !seenLinks.has(k) && !!seenLinks.add(k);
  });

  for (const { user: c, message: m } of timeline(session)) {
    if (m.from !== 'me') continue;
    const as = refFor(c.id);
    if (m.reply) steps.push({ as, tap: m.reply.id });
    else if (m.contacts) {
      steps.push({
        as,
        share: m.contacts.map((x) => {
          const t = findByAddress(session, x.address);
          return t ? refFor(t.id) : { name: x.name, address: x.address };
        }),
      });
    } else if (m.text) steps.push(m.targets?.length ? { as, say: m.text, to: m.targets.map(refOrAddress) } : { as, say: m.text });
  }
  return {
    name: name || 'Recorded ' + new Date().toISOString().slice(0, 16).replace('T', ' '),
    profile: session.profile,
    reset: true,
    delay: 300,
    users,
    steps,
  };
}
