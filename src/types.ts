// Public types: the session model, the adapter contract (docs/adapters.md), the mount/component
// options and the controller (docs/api.md).

/** Plain JSON data. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A custom field's value: text and select fields hold strings, number fields numbers ('' when empty), checkboxes booleans. */
export type FieldValue = string | number | boolean;

/** What an adapter setting holds (see SettingsField). */
export type SettingValue = string | number | boolean;

export interface Role {
  id: string;
  label: string;
  color: string;
  icon: string;
  idPattern: string;
}
export interface Relation {
  id: string;
  label: string;
  from: string;
  to: string;
}
export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  default: FieldValue;
  roles: string[];
  showAsChip: boolean;
}

export interface Appearance {
  theme: 'auto' | 'light' | 'dark';
  direction: 'ltr' | 'rtl';
  density: 'comfortable' | 'compact';
  layout: 'rows' | 'grid';
  bubbles: 'rounded' | 'square';
  accent: string;
  /** relation id, "role", or "" (one group) */
  groupBy: string;
  chatWidth: number;
  chatHeight: number;
  fontSize: number;
  showId: boolean;
  showTimestamps: boolean;
  showFields: boolean;
  showLinks: boolean;
}

export interface Profile {
  name: string;
  identity: { label: string; pattern: string };
  roles: Role[];
  relations: Relation[];
  fields: FieldDef[];
  appearance: Appearance;
  labels: { user: string; send: string; placeholder: string; me: string; bot: string };
}

export interface Contact {
  name: string;
  address: string;
}

export interface Message {
  id: string;
  from: 'me' | 'bot' | 'system';
  at: string;
  text?: string;
  buttons?: { id: string; title: string }[];
  list?: { button: string; rows: { id: string; title: string; description: string }[] };
  image?: { url: string; alt: string };
  contacts?: Contact[];
  /** for a bot message relaying what another user said: that user's address (shown as a small name on top) */
  author?: string;
  /** a relayed message the user answered (a quick reply or their own): its reply controls are gone */
  answered?: boolean;
  /** addresses a "me" message was aimed at (the To picker) */
  targets?: string[];
  /** addresses of the other users the bot's replies to this "me" message reached (set by the simulator) */
  deliveredTo?: string[];
  meta?: Json;
  reply?: { id: string; kind: string };
  error?: boolean;
}

export interface User {
  id: string;
  type: string;
  name: string;
  address: string;
  role: string;
  fields: Record<string, FieldValue>;
  messages: Message[];
}

export interface Link {
  rel: string;
  from: string;
  to: string;
}

export interface Session {
  version: number;
  profile: Profile;
  users: User[];
  links: Link[];
  settings: Record<string, AdapterSettings>;
  options: { autoCreate: boolean };
}

/** What adapters return: a message for the sender, or for someone else with `to`. */
export interface Reply extends Partial<Omit<Message, 'id' | 'from' | 'at' | 'buttons' | 'image'>> {
  /** button objects, or plain strings (the title is the id) */
  buttons?: (string | { id?: string; title: string })[];
  /** an object, or just the URL */
  image?: string | { url: string; alt?: string };
  to?: string;
  toName?: string;
  toRole?: string;
  link?: boolean;
  /** another name for `text` */
  body?: string;
}

/** What the user did, as the adapter receives it. */
export interface OutgoingMessage {
  id: string;
  kind: 'text' | 'button' | 'list' | 'contacts';
  targets: string[];
  text?: string;
  buttonId?: string;
  title?: string;
  contacts?: Contact[];
}

export interface Links {
  out: Record<string, User[]>;
  in: Record<string, User[]>;
}

/** An adapter's settings by key, as edited under Settings. */
export type AdapterSettings = Record<string, SettingValue>;

export interface SendContext {
  user: User;
  message: OutgoingMessage;
  session: Session;
  profile: Profile;
  parent: User | null;
  root: User | null;
  links: Links;
  settings: AdapterSettings;
}

export interface SettingsField {
  key: string;
  label: string;
  /** 'secret' values are kept in the tab and never exported; default 'text' */
  type?: 'text' | 'url' | 'number' | 'secret' | 'json';
  default?: SettingValue;
  hint?: string;
}

export interface AdapterAction {
  id: string;
  label: string;
  description?: string;
}

export type Replies = Reply[] | { replies: Reply[] } | null | undefined | void;

export interface Adapter {
  /** unique; stored on each user */
  type: string;
  /** shown in dialogs and on users when there are several adapters */
  label: string;
  settingsFields?: SettingsField[];
  send(ctx: SendContext): Promise<Replies> | Replies;
  pollInterval?(settings: AdapterSettings): number;
  poll?(ctx: { settings: AdapterSettings; session: Session; profile: Profile }): Promise<Reply[]>;
  actions?(settings: AdapterSettings): AdapterAction[];
  runAction?(id: string, ctx: { settings: AdapterSettings; session: Session; profile: Profile }): Promise<Replies> | Replies;
}

export type ThemeName = 'light' | 'dark';

type DeepPartial<T> = T extends (infer U)[] ? DeepPartial<U>[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
/** A profile as you write it: every key optional; missing or bad values get defaults. */
export type ProfileInput = DeepPartial<Profile>;

export interface SimulatorOptions {
  /** at least one */
  adapters: Adapter[];
  /** preset name or profile object (docs/profiles.md); default "generic" */
  profile?: string | ProfileInput;
  /** extra presets for the profile editor */
  presets?: Record<string, ProfileInput>;
  /** always use `profile` and hide the profile editor */
  lockProfile?: boolean;
  /** localStorage key for autosave; null keeps nothing; default "chatbot-sim" */
  storageKey?: string | null;
  title?: string;
  /** the default before the viewer toggles; default "auto" (follow the system) */
  theme?: 'auto' | ThemeName;
  onThemeChange?: (theme: ThemeName) => void;
  /**
   * How pages (board, timeline, settings) map to URLs when the simulator has its own router:
   * "hash" (default) uses #/settings… so links and reloads work on any static host; "browser" uses
   * clean paths (/settings/adapters) and needs a server that answers every path with the page;
   * "memory" keeps the URL untouched. Inside an app that already has React Router, the app's router
   * is used instead.
   */
  routing?: 'hash' | 'browser' | 'memory';
}

export interface ScriptResult {
  ok: boolean;
  steps: number;
  error?: string;
  failedAt?: number;
  log: { index: number; text: string; status: 'ok' | 'fail'; error?: string }[];
}

export interface ScriptStep {
  index: number;
  total: number;
  text: string;
  status: 'run' | 'ok' | 'fail';
}

export interface AddUserInput {
  type?: string;
  name?: string;
  role?: string;
  address?: string;
  fields?: Record<string, FieldValue>;
  linkFrom?: { rel: string; userId: string };
}

export type SendInput =
  | string
  | { text: string; targets?: string[] }
  | { buttonId: string; title?: string; kind?: 'button' | 'list' }
  | { contacts: Contact[] };

/** Returned by mount() and passed to the component's onReady. */
export interface Controller {
  readonly session: Session;
  readonly profile: Profile;
  readonly adapters: Record<string, Adapter>;
  /** the adapter type new users get when none is given (the first registered) */
  readonly defaultType: string;
  readonly theme: ThemeName;
  addUser(input?: AddUserInput): User;
  link(rel: string, fromId: string, toId: string): Link | null;
  /** Send as a user (id or address). Resolves after the replies were delivered. */
  send(userIdOrAddress: string, message: SendInput): Promise<void>;
  /** Deliver server messages from outside (your own websocket, SSE…); each needs `to`. */
  receive(replies: Reply[], type?: string): void;
  actions(): (AdapterAction & { type: string })[];
  runAction(type: string, id: string): Promise<void>;
  run(script: unknown, opts?: { onStep?: (e: ScriptStep) => void; signal?: AbortSignal; delay?: number }): Promise<ScriptResult>;
  /** Remove every user without asking; the profile and settings stay. */
  clear(): void;
  setProfile(profile: string | ProfileInput): void;
  /** 'light' | 'dark' sets the viewer's choice; 'auto' goes back to the default */
  setTheme(theme: 'auto' | ThemeName): void;
  exportJSON(): string;
  importJSON(text: string): void;
  /** Save, stop polling, unmount. */
  destroy(): void;
}
