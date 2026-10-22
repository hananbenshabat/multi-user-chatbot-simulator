// Links between users (many-to-many, per relation) and the groups the board shows.
import type { Link, Links, Relation, Session, User } from '../types';
import { relationDef, roleDef, roleFits } from './profile';
import { findUser } from './session';

/** Link two users along `rel` (no duplicates, no self links). Roles are a UI guide, not enforced. */
export function link(session: Session, rel: string, fromId: string, toId: string): Link | null {
  if (!rel || !fromId || !toId || fromId === toId) return null;
  if (!findUser(session, fromId) || !findUser(session, toId)) return null;
  const existing = session.links.find((l) => l.rel === rel && l.from === fromId && l.to === toId);
  if (existing) return existing;
  const l = { rel, from: fromId, to: toId };
  session.links.push(l);
  return l;
}

/** Remove a link; returns how many were removed (0 or 1). */
export function unlink(session: Session, rel: string, fromId: string, toId: string): number {
  const before = session.links.length;
  session.links = session.links.filter((l) => !(l.rel === rel && l.from === fromId && l.to === toId));
  return before - session.links.length;
}

/** The users linked with `id`, per relation and direction. */
export function linksOf(session: Session, id: string): Links {
  const out: Record<string, User[]> = {};
  const inn: Record<string, User[]> = {};
  for (const l of session.links) {
    if (l.from === id) {
      const c = findUser(session, l.to);
      if (c) (out[l.rel] ||= []).push(c);
    }
    if (l.to === id) {
      const c = findUser(session, l.from);
      if (c) (inn[l.rel] ||= []).push(c);
    }
  }
  return { out, in: inn };
}

/** Everyone linked with `id` in either direction, each once (links out first, then links in). */
export function linkedUsers(session: Session, id: string): User[] {
  const l = linksOf(session, id);
  const seen = new Set<string>();
  return [...Object.values(l.out).flat(), ...Object.values(l.in).flat()].filter((c) => !seen.has(c.id) && !!seen.add(c.id));
}

/** Users only reachable through `rel` from `id` (and not linked in from anywhere else). */
export function exclusiveDescendants(session: Session, id: string, rel: string): string[] {
  const drop = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of session.users) {
      if (drop.has(c.id)) continue;
      const parents = session.links.filter((l) => l.rel === rel && l.to === c.id).map((l) => l.from);
      if (parents.length && parents.every((p) => drop.has(p))) {
        drop.add(c.id);
        grew = true;
      }
    }
  }
  drop.delete(id);
  return [...drop];
}

/** Remove a user and their links; with `cascade: rel`, also the users linked only under them. */
export function removeUser(session: Session, id: string, opts?: { cascade?: string } | null): number {
  const ids = new Set([id, ...(opts?.cascade ? exclusiveDescendants(session, id, opts.cascade) : [])]);
  session.users = session.users.filter((c) => !ids.has(c.id));
  session.links = session.links.filter((l) => !ids.has(l.from) && !ids.has(l.to));
  return ids.size;
}

/** The relation the board groups by, or null (grouped by role, or not at all). */
export function groupRelation(session: Session): string | null {
  const g = session.profile.appearance.groupBy;
  return g && g !== 'role' && relationDef(session.profile, g) ? g : null;
}

/** The user's parent along the grouping relation (or any relation). */
export function parentOf(session: Session, user: User): User | null {
  const rel = groupRelation(session);
  const l = session.links.find((x) => x.to === user.id && (!rel || x.rel === rel));
  return l ? findUser(session, l.from) : null;
}

/** The top ancestor of `user` (themself when they have no parent). Safe with cycles. */
export function rootOf(session: Session, user: User): User {
  let cur = user;
  const seen = new Set<string>();
  for (let p = parentOf(session, cur); p && !seen.has(p.id); p = parentOf(session, cur)) {
    seen.add(cur.id);
    cur = p;
  }
  return cur;
}

export interface Group {
  key: string;
  title: string;
  root: User | null;
  users: User[];
}

/**
 * Groups for display. By relation: each root with everything reachable along that relation
 * (a user linked under two roots shows in both). By role: one group per role. Otherwise: one group.
 */
export function groups(session: Session): Group[] {
  const p = session.profile;
  if (p.appearance.groupBy === 'role') {
    const out: Group[] = p.roles.map((r) => ({
      key: 'role:' + r.id,
      title: r.label,
      root: null,
      users: session.users.filter((c) => c.role === r.id),
    }));
    const other = session.users.filter((c) => !roleDef(p, c.role));
    if (other.length) out.push({ key: 'role:', title: 'Other', root: null, users: other });
    return out.filter((g) => g.users.length);
  }
  const rel = groupRelation(session);
  if (!rel) return session.users.length ? [{ key: 'all', title: '', root: null, users: session.users.slice() }] : [];
  const hasParent = new Set(session.links.filter((l) => l.rel === rel).map((l) => l.to));
  const out: Group[] = [];
  const placed = new Set<string>();
  const build = (r: User) => {
    const members = [r];
    const seen = new Set([r.id]);
    for (let i = 0; i < members.length; i++) {
      for (const l of session.links) {
        if (l.rel !== rel || l.from !== members[i].id || seen.has(l.to)) continue;
        const c = findUser(session, l.to);
        if (c) {
          seen.add(c.id);
          members.push(c);
        }
      }
    }
    for (const m of members) placed.add(m.id);
    out.push({ key: 'root:' + r.id, title: r.name, root: r, users: members });
  };
  for (const c of session.users) if (!hasParent.has(c.id)) build(c);
  for (const c of session.users) if (!placed.has(c.id)) build(c); // cycles
  return out;
}

/**
 * The relation that links a new user (of `role`, or any role when "") under `rootUser`:
 * the grouping relation if it fits, else the first that fits.
 */
export function relationFor(session: Session, rootUser: User, role: string): Relation | null {
  const rels = session.profile.relations.filter((r) => roleFits(r.from, rootUser.role) && (!role || roleFits(r.to, role)));
  return rels.find((r) => r.id === groupRelation(session)) || rels[0] || null;
}
