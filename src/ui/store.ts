// Runtime state of one simulator: the session, what is in flight, polling, autosave, theme,
// and the public controller. No React here; components subscribe and re-render on change.
import * as core from '../core';
import * as script from '../script';
import type {
  Adapter,
  AdapterSettings,
  AddUserInput,
  Contact,
  Controller,
  FieldValue,
  Message,
  OutgoingMessage,
  Profile,
  ProfileInput,
  Replies,
  ScriptResult,
  SendInput,
  Session,
  SimulatorOptions,
  ThemeName,
  User,
} from '../types';
import { errorText, isObj, objects, parseJson, str } from '../core/util';

export type Person = Contact;
/** Prefills the Add dialog. */
export interface AddPreset {
  type?: string;
  role?: string;
  linkFrom?: { rel: string; userId: string };
  /** opened from a user's link button: the dialog says "Link" instead of "Add" */
  asLink?: boolean;
}
export interface Notice {
  id?: string;
  title?: string;
  message: string;
  color?: 'red' | 'green' | 'blue' | 'gray';
  loading?: boolean;
  autoClose?: number | false;
}

type SendRequest =
  | { text: string; targets?: string[] }
  | { buttonId: string; title?: string; kind?: 'button' | 'list'; targets?: string[] }
  | { contacts: Contact[]; targets?: string[] };

// Storage can be missing or throw (private mode, blocked site data): never let it break the page.
function store(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}
export function readStore(kind: 'local' | 'session', key: string): string | null {
  try {
    return store(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
export function writeStore(kind: 'local' | 'session', key: string, value: string | null) {
  try {
    const s = store(kind);
    if (!s) return;
    if (value == null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* full or blocked */
  }
}

/** Do two lists have the same people (by address, in any order)? */
function sameAddresses(a: Person[], b: Person[]): boolean {
  const key = (list: Person[]) =>
    list
      .map((t) => core.addrKey(t.address))
      .sort()
      .join(' ');
  return key(a) === key(b);
}

/** People saved earlier (untrusted): entries without an address are dropped. */
const peopleFrom = (list: unknown[]): Person[] =>
  objects(list)
    .map((p) => ({ name: str(p.name), address: str(p.address) }))
    .filter((p) => p.address);

/** The { name, address } of a user, as the To picker and shared contacts use. */
export const personOf = (u: User): Person => ({ name: u.name, address: u.address });

export class SimStore {
  readonly opts: {
    storageKey: string | null;
    title: string;
    profile: string | ProfileInput;
    lockProfile: boolean;
    theme: 'auto' | ThemeName;
    routing: 'hash' | 'browser' | 'memory';
    onThemeChange?: (theme: ThemeName) => void;
  };
  readonly presets: Record<string, ProfileInput>;
  readonly adapters: Record<string, Adapter> = {};
  readonly types: string[];
  readonly keyBase: string;
  private readonly secretKeys: Record<string, string[]> = {};

  session: Session;
  private secrets: Record<string, AdapterSettings> = {};
  /**
   * user id -> recipients chosen in the To picker (an empty list is a real choice: nobody).
   * Users without an entry use their default: everyone they link to (see recipientsOf).
   */
  targets: Record<string, Person[]> = {};
  /** user id -> requests in flight */
  pending: Record<string, number> = {};
  private queues: Record<string, Promise<void>> = {};
  collapsed = new Set<string>();
  filter = '';
  scriptRun: { abort: AbortController } | null = null;
  scriptStatus = '';
  lastRun: ScriptResult | null = null;
  themePref: ThemeName | null = null;
  private systemDark = false;
  private shownTheme: ThemeName | null = null;

  // Change tracking: `version` changes on every change; `rev(id)` only when that user (or everything) changed.
  version = 0;
  private globalRev = 0;
  private userRevs = new Map<string, number>();
  private listeners = new Set<() => void>();
  private flashListeners = new Set<(id: string) => void>();
  private revealListeners = new Set<(id: string) => void>();

  /** Set by the UI: show a notification. */
  notify: (n: Notice) => void = (n) => {
    if (n.color === 'red') console.warn('chatbot-sim:', n.message);
  };
  hideNotice: (id: string) => void = () => {};

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private timers: Record<string, ReturnType<typeof setInterval>> = {};
  private media: MediaQueryList | null = null;
  private started = false;
  readonly controller: Controller;

  constructor(options: SimulatorOptions) {
    this.opts = {
      storageKey: options.storageKey === undefined ? 'chatbot-sim' : options.storageKey,
      title: options.title ?? 'Multi-User Chatbot Simulator',
      profile: options.profile ?? 'generic',
      lockProfile: options.lockProfile ?? false,
      theme: options.theme ?? 'auto',
      routing: options.routing ?? 'hash',
      onThemeChange: options.onThemeChange,
    };
    this.presets = { ...core.PRESETS, ...options.presets };
    for (const a of options.adapters || []) {
      if (!a || !a.type || typeof a.send !== 'function') throw new Error('adapter needs "type" and "send"');
      if (this.adapters[a.type]) throw new Error('two adapters with type "' + a.type + '"');
      this.adapters[a.type] = a;
      this.secretKeys[a.type] = (a.settingsFields || []).filter((f) => f.type === 'secret').map((f) => f.key);
    }
    this.types = Object.keys(this.adapters);
    if (!this.types.length) throw new Error('register at least one adapter');
    this.keyBase = this.opts.storageKey || 'chatbot-sim';
    this.session = core.emptySession(this.resolveProfile(this.opts.profile));
    const pref = readStore('local', this.keyBase + ':theme');
    this.themePref = pref === 'light' || pref === 'dark' ? pref : null;
    this.media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    this.systemDark = !!this.media?.matches;
    this.load();
    this.controller = this.makeController();
  }

  // ---- subscriptions ---------------------------------------------------------------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getVersion = () => this.version;
  /** Per-user revision: changes when that user's chat must re-render. */
  rev(id: string) {
    return this.globalRev + ':' + (this.userRevs.get(id) || 0);
  }
  onFlash(fn: (id: string) => void) {
    this.flashListeners.add(fn);
    return () => {
      this.flashListeners.delete(fn);
    };
  }
  onReveal(fn: (id: string) => void) {
    this.revealListeners.add(fn);
    return () => {
      this.revealListeners.delete(fn);
    };
  }

  /** Something changed: with ids, only those users' chats re-render; without, everything does. */
  changed(ids?: string[]) {
    if (ids) for (const id of ids) this.userRevs.set(id, (this.userRevs.get(id) || 0) + 1);
    else this.globalRev++;
    this.version++;
    this.checkTheme();
    for (const fn of this.listeners) fn();
  }

  get profile(): Profile {
    return this.session.profile;
  }

  // ---- lifecycle ---------------------------------------------------------------------------
  private resolveProfile(p: string | ProfileInput | undefined): Profile {
    if (typeof p === 'string') return core.normalizeProfile(this.presets[p] || core.PRESETS.generic);
    return core.normalizeProfile(p || core.PRESETS.generic);
  }

  private load() {
    const key = this.opts.storageKey;
    if (key) {
      try {
        const saved = readStore('local', key);
        if (saved) {
          this.session = core.importSession(saved);
          this.session.profile = core.upgradePreset(this.session.profile);
        }
        this.secrets = core.settingsFrom(parseJson(readStore('session', key + ':secrets') || '{}'));
        // recipients chosen in the To picker, for users that still exist
        const targets = parseJson(readStore('local', key + ':targets') || '{}');
        if (isObj(targets)) {
          for (const [id, people] of Object.entries(targets)) {
            if (core.findUser(this.session, id) && Array.isArray(people)) this.targets[id] = peopleFrom(people);
          }
        }
      } catch (e) {
        console.warn('chatbot-sim: could not restore the saved session', e);
      }
    }
    if (this.opts.lockProfile) this.session.profile = this.resolveProfile(this.opts.profile);
  }

  private onSystemTheme = (e: MediaQueryListEvent) => {
    this.systemDark = e.matches;
    this.changed();
  };

  /** Start polling and listeners. Safe to call twice (React StrictMode). */
  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('pagehide', this.persistNow);
    this.media?.addEventListener?.('change', this.onSystemTheme);
    this.startPolling();
    this.checkTheme();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.persistNow();
    this.stopPolling();
    window.removeEventListener('pagehide', this.persistNow);
    this.media?.removeEventListener?.('change', this.onSystemTheme);
  }

  // Saving serializes the whole session, so bursts of messages are batched.
  persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(this.persistNow, 250);
  }

  persistNow = () => {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const key = this.opts.storageKey;
    if (!key) return;
    writeStore('local', key, this.exportJSON());
    writeStore('session', key + ':secrets', JSON.stringify(this.secrets));
    writeStore('local', key + ':targets', Object.keys(this.targets).length ? JSON.stringify(this.targets) : null);
  };

  /** Persist and re-render after a change. */
  private afterChange(ids?: string[]) {
    this.persist();
    this.changed(ids);
  }

  // ---- theme: viewer choice > host option > profile > system ---------------------------------
  defaultTheme(): ThemeName {
    const t = this.opts.theme !== 'auto' ? this.opts.theme : this.profile.appearance.theme;
    if (t === 'light' || t === 'dark') return t;
    return this.systemDark ? 'dark' : 'light';
  }

  get theme(): ThemeName {
    return this.themePref || this.defaultTheme();
  }

  // A choice equal to the default is forgotten, so the page keeps following the system.
  setThemePref(t: 'auto' | ThemeName) {
    this.themePref = t === 'light' || t === 'dark' ? (t === this.defaultTheme() ? null : t) : null;
    writeStore('local', this.keyBase + ':theme', this.themePref);
    this.changed();
  }

  private checkTheme() {
    const t = this.theme;
    if (t !== this.shownTheme) {
      this.shownTheme = t;
      this.opts.onThemeChange?.(t);
    }
  }

  // ---- adapters ------------------------------------------------------------------------------
  settingsFor(type: string): AdapterSettings {
    const out: AdapterSettings = {};
    for (const f of this.adapters[type]?.settingsFields || []) out[f.key] = f.default ?? '';
    return { ...out, ...this.session.settings[type], ...this.secrets[type] };
  }

  private ctxFor(user: User, message: OutgoingMessage) {
    const s = this.session;
    return {
      user,
      message,
      session: s,
      profile: s.profile,
      parent: core.parentOf(s, user),
      root: core.rootOf(s, user),
      links: core.linksOf(s, user.id),
      settings: this.settingsFor(user.type),
    };
  }

  /** Route replies into chats. `sender` is null for polled and action replies. */
  deliver(sender: User | null, replies: Replies, type: string, sent?: Message) {
    const r = core.routeReplies(this.session, sender, replies, { type });
    // Who the reply to `sent` reached besides the sender: shown under that bubble ("Sent to Lead").
    if (sent) {
      const reached = new Set<string>();
      for (const d of r.delivered) if (d.user !== sender) reached.add(d.user.address);
      sent.deliveredTo = [...reached];
    }
    for (const u of r.unrouted) {
      const note = 'Message for ' + (u.to || '?') + ' (no user with that ' + this.profile.identity.label + '): ' + (u.text || '[no text]');
      if (sender) core.addMessage(sender, 'system', { text: note });
      else this.notify({ message: note, color: 'red' });
    }
    for (const d of r.delivered) {
      if (sender && d.user !== sender && !this.areLinked(d.user, sender) && this.linkBetween(d.user, sender)) {
        const ids = this.suggestions.get(d.user.id) ?? new Set<string>();
        ids.add(sender.id);
        this.suggestions.set(d.user.id, ids);
      }
    }
    const touched = new Set<string>(r.delivered.map((d) => d.user.id));
    if (sender) touched.add(sender.id);
    this.afterChange(r.created.length ? undefined : [...touched]);
    for (const d of r.delivered) for (const fn of this.flashListeners) fn(d.user.id);
  }

  /**
   * Send as `user`. Typed text goes to the user's To picker unless `targets` is given. The adapter
   * gets { id, kind, targets, text?, buttonId?, title?, contacts? }; `id` is the bubble's id, stable
   * and unique, so servers can drop duplicates. Each user's messages go out one at a time, in order.
   */
  send(user: User, input: SendRequest): Promise<void> {
    let kind: OutgoingMessage['kind'];
    let mine: core.MessageBody;
    if ('contacts' in input) {
      kind = 'contacts';
      mine = { contacts: input.contacts };
    } else if ('buttonId' in input) {
      kind = input.kind === 'list' ? 'list' : 'button';
      mine = { text: input.title || input.buttonId, reply: { id: input.buttonId, kind } };
    } else {
      kind = 'text';
      mine = { text: input.text };
    }
    const aimed = input.targets || (kind === 'text' ? this.recipientsOf(user).map((t) => t.address) : []);
    if (aimed.length) mine.targets = aimed.slice();
    const bubble = core.addMessage(user, 'me', mine);
    const message: OutgoingMessage = { id: bubble.id, kind, targets: aimed.slice() };
    if ('text' in input && kind === 'text') message.text = input.text;
    if ('buttonId' in input) {
      message.buttonId = input.buttonId;
      message.title = input.title || input.buttonId;
    }
    if ('contacts' in input) message.contacts = input.contacts.map((c) => ({ name: c.name, address: c.address }));
    this.pending[user.id] = (this.pending[user.id] || 0) + 1;
    this.afterChange([user.id]);
    const run = async () => {
      try {
        const adapter = this.adapters[user.type];
        if (!adapter) throw new Error('no adapter for user type "' + user.type + '"');
        const res = await adapter.send(this.ctxFor(user, message));
        if (!core.findUser(this.session, user.id)) return; // removed, or the session was replaced meanwhile
        this.deliver(user, res, user.type, bubble);
      } catch (e) {
        if (!core.findUser(this.session, user.id)) return;
        core.addMessage(user, 'system', { text: '⚠ ' + errorText(e), error: true });
        this.afterChange([user.id]);
      } finally {
        // the session may have been replaced meanwhile (pending was reset): never go below zero
        this.pending[user.id] = Math.max(0, (this.pending[user.id] || 0) - 1);
        this.changed([user.id]);
      }
    };
    this.queues[user.id] = (this.queues[user.id] || Promise.resolve()).then(run);
    return this.queues[user.id];
  }

  adapterActions() {
    const out: { adapter: Adapter; action: { id: string; label: string; description?: string } }[] = [];
    for (const a of Object.values(this.adapters)) {
      if (typeof a.actions !== 'function' || typeof a.runAction !== 'function') continue;
      let list: ReturnType<NonNullable<Adapter['actions']>> = [];
      try {
        list = a.actions(this.settingsFor(a.type)) || [];
      } catch {
        /* bad settings: no actions */
      }
      for (const act of list) if (act && act.id) out.push({ adapter: a, action: act });
    }
    return out;
  }

  async runAction(adapter: Adapter, action: { id: string; label: string }) {
    const id = 'action-' + adapter.type + '-' + action.id;
    this.notify({ id, message: action.label + '…', loading: true, autoClose: false });
    try {
      if (!adapter.runAction) throw new Error(adapter.label + ' has no actions');
      const res = await adapter.runAction(action.id, {
        settings: this.settingsFor(adapter.type),
        session: this.session,
        profile: this.profile,
      });
      this.deliver(null, res, adapter.type);
      this.notify({ id, message: action.label + ': done', color: 'green', loading: false, autoClose: 3000 });
    } catch (e) {
      this.notify({ id, title: action.label, message: errorText(e), color: 'red', loading: false, autoClose: false });
    }
  }

  private stopPolling() {
    for (const t of Object.keys(this.timers)) {
      clearInterval(this.timers[t]);
      delete this.timers[t];
    }
  }

  startPolling() {
    this.stopPolling();
    for (const a of Object.values(this.adapters)) {
      if (typeof a.poll !== 'function' || typeof a.pollInterval !== 'function') continue;
      const ms = a.pollInterval(this.settingsFor(a.type));
      if (!ms) continue;
      let busy = false;
      let failing = false;
      const id = 'poll-' + a.type;
      this.timers[a.type] = setInterval(
        async () => {
          if (busy) return;
          busy = true;
          try {
            const replies = await a.poll?.({ settings: this.settingsFor(a.type), session: this.session, profile: this.profile });
            if (failing) {
              failing = false;
              this.hideNotice(id);
            }
            if (replies && replies.length) this.deliver(null, replies, a.type);
          } catch (e) {
            failing = true;
            this.notify({ id, title: a.label + ': Polling Failed', message: errorText(e), color: 'red', autoClose: false });
          } finally {
            busy = false;
          }
        },
        Math.max(500, ms),
      );
    }
  }

  // ---- editing -------------------------------------------------------------------------------
  setFilter(q: string) {
    this.filter = q;
    this.changed();
  }
  toggleGroup(key: string) {
    if (this.collapsed.has(key)) this.collapsed.delete(key);
    else this.collapsed.add(key);
    this.changed();
  }

  matches(user: User) {
    const q = this.filter.trim().toLowerCase();
    if (!q) return true;
    const vals = [user.name, user.address, user.role, user.type, ...Object.values(user.fields || {})];
    return vals.some((v) => String(v).toLowerCase().includes(q));
  }

  /** Create users from the Add dialog; returns them. */
  addUsers(spec: {
    type: string;
    role: string;
    count: number;
    name: string;
    address: string;
    fields: Record<string, FieldValue>;
    link: string;
  }) {
    const p = this.profile;
    const n = Math.min(200, Math.max(1, Math.floor(spec.count || 1)));
    const r = core.roleDef(p, spec.role);
    const base = spec.name.trim() || (r ? r.label : p.labels.user);
    const already = this.session.users.filter((c) => c.role === spec.role).length;
    const [rel, fromId] = spec.link ? spec.link.split('|') : [];
    const made: User[] = [];
    for (let i = 0; i < n; i++) {
      const c = core.createUser(this.session, {
        type: spec.type,
        role: spec.role,
        fields: { ...spec.fields },
        name: n === 1 && spec.name.trim() ? base : base + ' ' + (already + i + 1),
        address: n === 1 ? spec.address.trim() : '',
      });
      if (rel) this.linkPair(rel, fromId, c.id);
      made.push(c);
    }
    this.afterChange();
    this.reveal(made[made.length - 1].id);
    return made;
  }

  /** Save the Edit dialog. `links` are every link the dialog showed, with whether it is checked. */
  saveUser(
    user: User,
    next: { name: string; address: string; role: string; fields: Record<string, FieldValue> },
    links: { rel: string; from: string; to: string; on: boolean }[],
  ) {
    const p = this.profile;
    const label = p.identity.label;
    if (!next.address.trim()) throw new Error(label + ' is required');
    const other = core.findByAddress(this.session, next.address);
    if (other && other.id !== user.id) throw new Error(label + ' already used by ' + other.name);
    user.name = next.name.trim() || user.name;
    user.address = next.address.trim();
    user.role = next.role;
    user.fields = { ...user.fields, ...next.fields };
    // The dialog shows every possible link per relation and direction, so those are
    // replaced by the checkboxes; links that no longer fit the role are dropped.
    const shownOut = new Set(links.filter((l) => l.from === user.id).map((l) => l.rel));
    const shownIn = new Set(links.filter((l) => l.to === user.id).map((l) => l.rel));
    this.session.links = this.session.links.filter((x) => {
      if (x.from !== user.id && x.to !== user.id) return true;
      const r = core.relationDef(p, x.rel);
      if (!r) return true;
      const out = x.from === user.id;
      const fits = core.roleFits(out ? r.from : r.to, user.role);
      return fits && !(out ? shownOut : shownIn).has(x.rel);
    });
    for (const l of links) if (l.on) core.link(this.session, l.rel, l.from, l.to);
    this.afterChange();
  }

  /** Link an existing user under `fromId` (the Link dialog's autocomplete) and show them. */
  linkExisting(rel: string, fromId: string, userId: string) {
    this.linkPair(rel, fromId, userId);
    this.afterChange();
    this.reveal(userId);
  }

  /** Are `a` and `b` linked, either way? */
  private areLinked(a: User, b: User): boolean {
    return this.session.links.some((l) => (l.from === a.id && l.to === b.id) || (l.from === b.id && l.to === a.id));
  }

  /** A link the profile allows between `a` and `b`: `a` leading `b` when possible, else `b` leading `a`. */
  linkBetween(a: User, b: User): { rel: string; from: User; to: User } | null {
    const ab = core.relationFor(this.session, a, b.role);
    if (ab && core.roleFits(ab.to, b.role)) return { rel: ab.id, from: a, to: b };
    const ba = core.relationFor(this.session, b, a.role);
    if (ba && core.roleFits(ba.to, a.role)) return { rel: ba.id, from: b, to: a };
    return null;
  }

  /** Link `fromId` → `toId`; a leader with hand-picked recipients gets the new user added to them. */
  private linkPair(rel: string, fromId: string, toId: string) {
    core.link(this.session, rel, fromId, toId);
    const chosen = this.targets[fromId];
    const to = core.findUser(this.session, toId);
    if (chosen && to && !chosen.some((t) => core.addrKey(t.address) === core.addrKey(to.address))) {
      this.targets[fromId] = [...chosen, personOf(to)];
    }
  }

  // ---- link suggestions: a message between users who aren't linked offers to link them ------
  /** receiver id -> ids of users who messaged them without being linked */
  private suggestions = new Map<string, Set<string>>();

  /** Users who messaged `user` without being linked (and still could be). */
  linkSuggestionsFor(user: User): User[] {
    const ids = this.suggestions.get(user.id);
    if (!ids) return [];
    return [...ids]
      .map((id) => core.findUser(this.session, id))
      .filter((c): c is User => c !== null && !this.areLinked(user, c) && this.linkBetween(user, c) !== null);
  }

  acceptLinkSuggestion(user: User, other: User) {
    const l = this.linkBetween(user, other);
    if (l) this.linkPair(l.rel, l.from.id, l.to.id);
    this.dismissLinkSuggestion(user, other);
    this.afterChange();
  }

  dismissLinkSuggestion(user: User, other: User) {
    this.suggestions.get(user.id)?.delete(other.id);
    this.afterChange([user.id]);
  }

  unlink(rel: string, fromId: string, toId: string) {
    core.unlink(this.session, rel, fromId, toId);
    this.afterChange();
  }

  /**
   * By default a user's typed messages go to everyone they're linked with, in either direction:
   * a lead → their members, a member → their lead (a link is one connection, seen from both sides).
   */
  defaultRecipients(user: User): Person[] {
    return core.linkedUsers(this.session, user.id).map(personOf);
  }

  /** A user's name from their address, or the address when nobody has it. */
  nameOf(address: string): string {
    return core.findByAddress(this.session, address)?.name ?? address;
  }

  /** The users above `user` (who link to it, like a member's lead): always among its recipients. */
  leadersOf(user: User): Person[] {
    const seen = new Set<string>();
    return Object.values(core.linksOf(this.session, user.id).in)
      .flat()
      .filter((c) => !seen.has(c.id) && !!seen.add(c.id))
      .map(personOf);
  }

  /** Is `address` one of `user`'s leaders? */
  isLeaderOf(user: User, address: string): boolean {
    const k = core.addrKey(address);
    return this.leadersOf(user).some((t) => core.addrKey(t.address) === k);
  }

  /** `people` plus any of `user`'s leaders missing from it. */
  private withLeaders(user: User, people: Person[]): Person[] {
    const have = new Set(people.map((t) => core.addrKey(t.address)));
    return [...this.leadersOf(user).filter((t) => !have.has(core.addrKey(t.address))), ...people];
  }

  /** Who `user`'s typed messages go to now: their own choice (always with their leaders), else the default. */
  recipientsOf(user: User): Person[] {
    const chosen = this.targets[user.id];
    return chosen ? this.withLeaders(user, chosen) : this.defaultRecipients(user);
  }

  /**
   * True while `user` follows the default (so the list changes when their links change). A saved
   * choice that equals the default counts as the default.
   */
  usesDefaultRecipients(user: User) {
    const chosen = this.targets[user.id];
    return !chosen || sameAddresses(this.withLeaders(user, chosen), this.defaultRecipients(user));
  }

  setTargets(user: User, chosen: Person[]) {
    // Choosing someone you aren't linked to links you, when a relation fits (Avi picks Lead → Lead
    // leads Avi), so they appear in each other's To rows and groups.
    let linked = false;
    for (const t of chosen) {
      const other = core.findByAddress(this.session, t.address);
      if (!other || other === user || this.areLinked(user, other)) continue;
      const l = this.linkBetween(user, other);
      if (!l) continue;
      this.linkPair(l.rel, l.from.id, l.to.id);
      linked = true;
    }
    // A user's leaders can't be taken off; choosing exactly the default goes back to following the
    // links, and anything else (even nobody else) is kept.
    const people = this.withLeaders(user, chosen);
    if (sameAddresses(people, this.defaultRecipients(user))) delete this.targets[user.id];
    else this.targets[user.id] = people;
    this.afterChange(linked ? undefined : [user.id]);
  }

  /** Answer a relayed message from its author: send just to them and put its reply controls away. */
  answer(user: User, m: Message, input: SendRequest) {
    m.answered = true;
    return this.send(user, input);
  }

  clearChat(user: User) {
    user.messages = [];
    this.afterChange([user.id]);
  }

  /** IDs of the users linked only under `user` along the grouping relation (removed with it on request). */
  exclusiveUnder(user: User): string[] {
    const rel = core.groupRelation(this.session);
    return rel ? core.exclusiveDescendants(this.session, user.id, rel) : [];
  }

  removeUser(user: User, cascade: boolean) {
    const rel = core.groupRelation(this.session);
    core.removeUser(this.session, user.id, cascade && rel ? { cascade: rel } : null);
    delete this.targets[user.id];
    this.afterChange();
  }

  saveSettings(values: Record<string, AdapterSettings>, autoCreate: boolean) {
    for (const a of Object.values(this.adapters)) {
      for (const f of a.settingsFields || []) {
        if (!(a.type in values) || !(f.key in values[a.type])) continue;
        const bucket = f.type === 'secret' ? this.secrets : this.session.settings;
        (bucket[a.type] = bucket[a.type] || {})[f.key] = values[a.type][f.key];
      }
    }
    this.session.options.autoCreate = autoCreate;
    this.persistNow();
    this.startPolling();
    this.changed();
  }

  setProfile(next: Profile) {
    this.session.profile = core.normalizeProfile(next);
    this.profileDraft = null;
    this.afterChange();
  }

  replaceSession(next: Session) {
    this.session = next;
    this.pending = {};
    this.queues = {};
    this.targets = {};
    this.profileDraft = null; // edits of the old profile must not be saved over the new one
    this.persistNow();
    this.startPolling();
    this.changed();
  }

  /** Parse an export file without applying it (the UI confirms first). */
  parseImport(text: string) {
    const next = core.importSession(text);
    next.profile = core.upgradePreset(next.profile);
    if (this.opts.lockProfile) next.profile = this.resolveProfile(this.opts.profile);
    const unknown = [...new Set(next.users.map((c) => c.type).filter((t) => !this.adapters[t]))];
    return { next, unknown };
  }

  clearAll() {
    const next = core.emptySession(this.profile);
    next.settings = this.session.settings;
    next.options = this.session.options;
    this.replaceSession(next);
  }

  exportJSON(): string {
    return core.exportSession(this.session, this.secretKeys);
  }

  /** Show `user` on the board: go to the board page, clear the filter, scroll to them and flash. */
  reveal(id: string) {
    this.showBoard();
    if (this.filter) {
      this.filter = '';
      this.changed();
    }
    // The board may only mount after the navigation: keep the request until it listens.
    this.pendingReveal = id;
    setTimeout(() => this.flushReveal(), 60);
  }

  private pendingReveal: string | null = null;

  /** Called by the board once it listens (and after a reveal): scroll to and flash the waiting user. */
  flushReveal() {
    const id = this.pendingReveal;
    if (!id || !this.revealListeners.size) return;
    this.pendingReveal = null;
    for (const fn of this.revealListeners) fn(id);
    for (const fn of this.flashListeners) fn(id);
  }

  // ---- scripts -------------------------------------------------------------------------------
  async runScriptInUi(text: string) {
    if (this.scriptRun) throw new Error('A script is already running; stop it first.');
    const parsed = script.parseScript(text); // throws: the dialog shows the error
    writeStore('local', this.keyBase + ':script', text);
    this.scriptRun = { abort: new AbortController() };
    this.scriptStatus = 'Starting…';
    this.changed();
    try {
      this.lastRun = await this.controller.run(parsed, {
        signal: this.scriptRun.abort.signal,
        onStep: (e) => {
          if (e.status === 'run') {
            this.scriptStatus = 'Step ' + (e.index + 1) + '/' + e.total + ': ' + e.text;
            this.changed();
          }
        },
      });
      const r = this.lastRun;
      this.notify(
        r.ok
          ? { id: 'script', title: 'Script Passed', message: r.steps + ' steps', color: 'green', autoClose: 4000 }
          : { id: 'script', title: 'Script Failed', message: r.error || '', color: 'red', autoClose: false },
      );
    } finally {
      this.scriptRun = null;
      this.scriptStatus = '';
      this.changed();
    }
  }

  stopScript() {
    this.scriptRun?.abort.abort();
  }

  // ---- controller ----------------------------------------------------------------------------
  private makeController(): Controller {
    // oxlint-disable-next-line typescript/no-this-alias -- the controller's getters have their own `this`
    const s = this;
    const findRef = (ref: string) => core.findUser(s.session, ref) || core.findByAddress(s.session, ref);
    return {
      get session() {
        return s.session;
      },
      get profile() {
        return s.session.profile;
      },
      get defaultType() {
        return s.types[0];
      },
      get theme() {
        return s.theme;
      },
      adapters: s.adapters,
      addUser(f: AddUserInput = {}) {
        const c = core.createUser(s.session, { type: s.types[0], ...f });
        if (f.linkFrom) core.link(s.session, f.linkFrom.rel, f.linkFrom.userId, c.id);
        s.afterChange();
        return c;
      },
      link(rel, fromId, toId) {
        const l = core.link(s.session, rel, fromId, toId);
        s.afterChange();
        return l;
      },
      send(ref, message: SendInput) {
        const user = findRef(ref);
        if (!user) throw new Error('no user ' + ref);
        const input: SendRequest = typeof message === 'string' ? { text: message } : { ...message };
        // `targets` accepts user ids or addresses
        if (input.targets) input.targets = input.targets.map((t) => findRef(t)?.address ?? t);
        return s.send(user, input);
      },
      receive(replies, type) {
        s.deliver(null, replies, type || s.types[0]);
      },
      actions() {
        return s.adapterActions().map(({ adapter, action }) => ({ type: adapter.type, ...action }));
      },
      runAction(type, id) {
        const found = s.adapterActions().find((x) => x.adapter.type === type && x.action.id === id);
        if (!found) throw new Error('no action ' + type + '/' + id);
        return s.runAction(found.adapter, found.action);
      },
      run(scr, opts) {
        return script.runScript(s.controller, scr, opts);
      },
      clear() {
        s.clearAll();
      },
      setProfile(p) {
        s.setProfile(s.resolveProfile(p));
      },
      setTheme(t) {
        s.setThemePref(t);
      },
      exportJSON() {
        return s.exportJSON();
      },
      importJSON(text) {
        s.replaceSession(s.parseImport(text).next);
      },
      destroy() {
        s.stop();
        s.onDestroy?.();
      },
    };
  }

  /** Set by mount(): unmounts the React root. */
  onDestroy?: () => void;

  /** Set by the UI (it owns the router): go to the users board. */
  showBoard: () => void = () => {};

  /** The router tells the store how to go to the board (for reveal from other pages). */
  setShowBoard(fn: () => void) {
    this.showBoard = fn;
    return () => {
      if (this.showBoard === fn) this.showBoard = () => {};
    };
  }

  /** Profile edits made on the Settings page and not saved yet (kept while you move between pages). */
  profileDraft: Profile | null = null;
  setProfileDraft(d: Profile | null) {
    this.profileDraft = d;
    this.changed();
  }
}
