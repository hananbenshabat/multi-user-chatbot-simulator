/* HTTP JSON adapter: POSTs each message to your server as JSON and reads the
 * replies from the response. Everything is configured under Settings:
 *   - Send URL, auth header (the value is a secret: kept in the tab, never exported)
 *   - Body template with {{placeholders}} (see BODY_HELP)
 *   - where the replies are in the response
 *   - optional polling for messages the server sends on its own (each must have "to")
 *   - optional actions: commands that call other endpoints (reset test data, run a job…)
 *
 * Several servers? Register it once per server with different types:
 *   httpJson({ type: 'local', label: 'Local bot' })
 *   httpJson({ type: 'staging', label: 'Staging bot', defaults: { url: '…' } })
 * `defaults` can preset any setting key below (url, body, repliesPath, pollUrl, actions…). */
import type { Adapter, AdapterSettings, Json, Reply, SendContext, SettingValue } from '../types';
import { fillTemplate, getPath, normalizeReply, userInfo } from '../core';
import { asJson, errorText, isObj, objects, parseJson, str } from '../core/util';

/** The settings, read and checked (see readSettings). */
interface HttpSettings {
  url: string;
  headers: string;
  authHeader: string;
  authValue: string;
  body: string;
  repliesPath: string;
  pollUrl: string;
  pollSeconds: number;
  timeoutMs: number;
  actions: string;
}

export interface HttpJsonOptions {
  /** unique adapter type; register once per server ('local', 'staging'…) */
  type?: string;
  label?: string;
  /** presets for any setting (url, authHeader, body, repliesPath, pollUrl, pollSeconds, actions, timeoutMs) */
  defaults?: Partial<HttpSettings>;
}

/** The HTTP adapter has every optional part: polling and actions. */
export type HttpJsonAdapter = Adapter & Required<Pick<Adapter, 'pollInterval' | 'poll' | 'actions' | 'runAction'>>;

interface HttpAction {
  id: string;
  label: string;
  url: string;
  method: string;
  body: Json;
  description: string;
}

const DEFAULT_BODY = JSON.stringify(
  {
    id: '{{message.id}}',
    kind: '{{message.kind}}',
    from: '{{user.address}}',
    name: '{{user.name}}',
    role: '{{user.role}}',
    fields: '{{user.fields}}',
    parent: '{{parent.address}}',
    text: '{{message.text}}',
    button: '{{message.buttonId}}',
    title: '{{message.title}}',
    contacts: '{{message.contacts}}',
    targets: '{{message.targets}}',
  },
  null,
  2,
);

const BODY_HELP =
  'Placeholders: {{user.address|name|role|fields|fields.<key>}}, {{message.id|kind|text|buttonId|title|contacts|targets}}, ' +
  '{{parent.*}}, {{root.*}}, {{links.<relation>}} (IDs linked out), {{links.<relation>_in}} (IDs linked in), {{now}}. ' +
  'A value that is exactly "{{x}}" keeps its type (null when missing).';

const ACTIONS_HELP =
  'JSON list: [{"id": "reset", "label": "Reset test data", "url": "http://…/reset", "method": "POST", "body": {}, "description": "…"}]. ' +
  'The response is read like a send (replies need "to").';

/** A number setting ('' or junk → fallback). */
const num = (v: SettingValue | undefined, fallback: number) => (str(v).trim() && Number.isFinite(Number(v)) ? Number(v) : fallback);

function readSettings(s: AdapterSettings): HttpSettings {
  return {
    url: str(s.url),
    headers: str(s.headers),
    authHeader: str(s.authHeader),
    authValue: str(s.authValue),
    body: str(s.body) || DEFAULT_BODY,
    repliesPath: str(s.repliesPath),
    pollUrl: str(s.pollUrl),
    pollSeconds: num(s.pollSeconds, 0),
    timeoutMs: num(s.timeoutMs, 15000) || 15000,
    actions: str(s.actions),
  };
}

function parseJsonSetting(text: string, what: string): unknown {
  try {
    return parseJson(text);
  } catch (e) {
    throw new Error(what + ' is not valid JSON', { cause: e });
  }
}

function headers(s: HttpSettings, json: boolean): Record<string, string> {
  const h: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  if (s.headers.trim()) {
    const extra = parseJsonSetting(s.headers, 'Headers setting');
    if (!isObj(extra)) throw new Error('Headers setting must be a JSON object');
    for (const [k, v] of Object.entries(extra)) h[k] = str(v);
  }
  if (s.authHeader && s.authValue) h[s.authHeader] = s.authValue;
  return h;
}

/** Call the server; its answer as JSON, as text when it isn't JSON, or null when empty. */
async function call(url: string, init: RequestInit, timeoutMs: number): Promise<Json | string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, ...init });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    throw new Error(timedOut ? 'timed out' : 'network error (server down or CORS?): ' + errorText(e), { cause: e });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 300));
  if (!text.trim()) return null;
  try {
    return asJson(parseJson(text)) ?? null;
  } catch {
    return text;
  }
}

/** The replies at `path` in the server's answer (one reply or a list). */
function extractReplies(data: Json | string, path: string): Reply[] {
  const r = getPath(data, path);
  if (r == null) return [];
  return (Array.isArray(r) ? r : [r]).map(normalizeReply).filter((x) => x !== null);
}

function parseActions(s: HttpSettings): HttpAction[] {
  if (!s.actions.trim()) return [];
  return objects(parseJsonSetting(s.actions, 'Actions setting'))
    .filter((a) => a.id != null && a.id !== '' && a.url)
    .map((a) => ({
      id: str(a.id),
      label: str(a.label) || str(a.id),
      url: str(a.url),
      method: (str(a.method) || 'POST').toUpperCase(),
      body: asJson(a.body) ?? {},
      description: str(a.description),
    }));
}

/** Template variables for one message (all plain JSON). */
function variables(ctx: SendContext): Json {
  const links: Record<string, string[]> = {};
  for (const [rel, users] of Object.entries(ctx.links.out)) links[rel] = users.map((c) => c.address);
  for (const [rel, users] of Object.entries(ctx.links.in)) links[rel + '_in'] = users.map((c) => c.address);
  const m = ctx.message;
  const user = userInfo(ctx.user);
  return {
    user,
    card: user, // "card": the name before 0.5, so saved body templates keep working
    parent: userInfo(ctx.parent),
    root: userInfo(ctx.root || ctx.user),
    message: {
      id: m.id,
      kind: m.kind,
      text: m.text ?? null,
      buttonId: m.buttonId ?? null,
      title: m.title ?? null,
      contacts: m.contacts?.map((c) => ({ name: c.name, address: c.address })) ?? null,
      targets: m.targets,
    },
    links,
    now: new Date().toISOString(),
  };
}

export default function httpJson(opts: HttpJsonOptions = {}): HttpJsonAdapter {
  const d: HttpSettings = {
    url: 'http://localhost:8000/chat',
    headers: '',
    authHeader: 'X-Test-Key',
    authValue: '',
    body: DEFAULT_BODY,
    repliesPath: 'replies',
    pollUrl: '',
    pollSeconds: 0,
    timeoutMs: 15000,
    actions: '',
    ...opts.defaults,
  };

  return {
    type: opts.type || 'http',
    label: opts.label || 'HTTP JSON',
    settingsFields: [
      { key: 'url', label: 'Send URL (POST)', type: 'url', default: d.url },
      { key: 'authHeader', label: 'Auth header name', default: d.authHeader },
      { key: 'authValue', label: 'Auth header value', type: 'secret', default: d.authValue },
      { key: 'headers', label: 'Extra headers (JSON object)', type: 'json', default: d.headers },
      { key: 'body', label: 'Body template (JSON)', type: 'json', default: d.body, hint: BODY_HELP },
      { key: 'repliesPath', label: 'Replies path in the response ("" = the whole response)', default: d.repliesPath },
      { key: 'pollUrl', label: 'Poll URL (GET, optional)', type: 'url', default: d.pollUrl },
      { key: 'pollSeconds', label: 'Poll every N seconds (0 = off)', type: 'number', default: d.pollSeconds },
      { key: 'actions', label: 'Actions (JSON, optional)', type: 'json', default: d.actions, hint: ACTIONS_HELP },
      { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', default: d.timeoutMs },
    ],

    async send(ctx) {
      const s = readSettings(ctx.settings);
      if (!s.url) throw new Error('Set the Send URL in Settings');
      const template = asJson(parseJsonSetting(s.body, 'Body template')) ?? null;
      const body = JSON.stringify(fillTemplate(template, variables(ctx)));
      return extractReplies(await call(s.url, { method: 'POST', headers: headers(s, true), body }, s.timeoutMs), s.repliesPath);
    },

    pollInterval(settings) {
      const s = readSettings(settings);
      return s.pollUrl && s.pollSeconds > 0 ? s.pollSeconds * 1000 : 0;
    },

    async poll({ settings }) {
      const s = readSettings(settings);
      return extractReplies(await call(s.pollUrl, { method: 'GET', headers: headers(s, false) }, s.timeoutMs), s.repliesPath);
    },

    actions(settings) {
      return parseActions(readSettings(settings)).map(({ id, label, description }) => ({ id, label, description }));
    },

    async runAction(id, { settings }) {
      const s = readSettings(settings);
      const a = parseActions(s).find((x) => x.id === id);
      if (!a) throw new Error('unknown action ' + id);
      const init: RequestInit = { method: a.method, headers: headers(s, a.method !== 'GET') };
      if (a.method !== 'GET') init.body = JSON.stringify(fillTemplate(a.body, { now: new Date().toISOString() }));
      return extractReplies(await call(a.url, init, s.timeoutMs), s.repliesPath);
    },
  };
}
