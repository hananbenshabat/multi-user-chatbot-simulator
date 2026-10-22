// Running a script against the simulator's controller (or anything with the same methods).
import type { Controller, Message, ScriptResult, ScriptStep, User } from '../types';
import { findByAddress, findUser, relationFor, roleDef } from '../core';
import { errorText, str } from '../core/util';
import { alreadyParsed, describe, parseScript, type ParsedScript, type ScriptUser, type Step } from './parse';

/** What a script needs: the controller (app), or a headless stand-in with the same methods. */
export type Engine = Pick<
  Controller,
  'session' | 'defaultType' | 'setProfile' | 'clear' | 'addUser' | 'link' | 'send' | 'actions' | 'runAction'
>;

export interface RunOptions {
  /** called before ('run') and after ('ok' / 'fail') every step */
  onStep?: (e: ScriptStep & { step: Step | null; error?: string }) => void;
  /** aborting stops the run between steps (and cuts "wait" short) */
  signal?: AbortSignal;
  /** ms between steps; overrides the script's own */
  delay?: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (!ms) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

/** The newest bot button or list row titled (or with the id) `label`. */
function findChoice(c: User, label: string): { buttonId: string; title: string; kind: 'button' | 'list' } | null {
  const want = label.toLowerCase();
  for (let i = c.messages.length - 1; i >= 0; i--) {
    const m = c.messages[i];
    if (m.from !== 'bot') continue;
    const b = (m.buttons || []).find((x) => x.id === label || x.title.toLowerCase() === want);
    if (b) return { buttonId: b.id, title: b.title, kind: 'button' };
    const r = (m.list?.rows || []).find((x) => x.id === label || x.title.toLowerCase() === want);
    if (r) return { buttonId: r.id, title: r.title, kind: 'list' };
  }
  return null;
}

/**
 * Run a script (JSON text, object, array of steps, or a parseScript() result). Never rejects: a bad
 * script or a failed step comes back as ok: false with the reason and where it happened.
 */
export async function runScript(engine: Engine, script: unknown, opts: RunOptions = {}): Promise<ScriptResult> {
  const log: ScriptResult['log'] = [];
  let s: ParsedScript;
  try {
    s = alreadyParsed(script) ?? parseScript(script);
  } catch (e) {
    return { ok: false, steps: 0, failedAt: 0, error: errorText(e), log };
  }
  const delay = opts.delay ?? s.delay;
  const { signal } = opts;
  const refs = new Map<string, string>(); // script ref -> user id
  const startedAt = new Date().toISOString();
  const total = s.steps.length;
  const emit = (entry: ScriptStep & { step: Step | null; error?: string }) => {
    if (entry.status !== 'run')
      log.push({ index: entry.index, text: entry.text, status: entry.status, ...(entry.error ? { error: entry.error } : {}) });
    try {
      opts.onStep?.(entry);
    } catch {
      /* a bad listener must not stop the run */
    }
  };

  const session = () => engine.session;
  function user(ref: string, where = ''): User {
    const r = str(ref);
    const id = refs.get(r);
    const found =
      (id && findUser(session(), id)) ||
      session().users.find((c) => c.name.toLowerCase() === r.toLowerCase()) ||
      findByAddress(session(), r) ||
      findUser(session(), r);
    if (!found) throw new Error(where + 'no user "' + r + '" (use a ref, a name or an ID)');
    return found;
  }

  function addUsers(spec: ScriptUser) {
    let parent: User | null = null;
    let rel = '';
    if (spec.linkFrom) {
      parent = user(typeof spec.linkFrom === 'string' ? spec.linkFrom : spec.linkFrom.user, 'linkFrom: ');
      rel = (typeof spec.linkFrom === 'object' && spec.linkFrom.rel) || '';
      if (!rel) {
        const r = relationFor(session(), parent, spec.role);
        if (!r)
          throw new Error(
            'no relation in the profile links a "' + (parent.role || 'no role') + '" user to a "' + (spec.role || 'no role') + '" user',
          );
        rel = r.id;
      }
    }
    const role = roleDef(session().profile, spec.role);
    const base = spec.name || (role ? role.label : spec.ref);
    for (let k = 1; k <= spec.count; k++) {
      const ref = spec.count > 1 ? spec.ref + k : spec.ref;
      const existing = spec.address ? findByAddress(session(), spec.address) : null;
      const c =
        existing ||
        engine.addUser({
          type: spec.type || engine.defaultType,
          role: spec.role,
          address: spec.address || undefined,
          name: spec.count > 1 ? base + ' ' + k : base,
          fields: spec.fields || undefined,
          linkFrom: parent ? { rel, userId: parent.id } : undefined,
        });
      if (existing && parent) engine.link(rel, parent.id, existing.id);
      refs.set(ref, c.id);
    }
  }

  /** Wait until fn() returns something truthy, or time runs out. */
  async function until<T>(fn: () => T, ms: number): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v || Date.now() >= end || signal?.aborted) return v;
      await sleep(50, signal);
    }
  }

  const botMessages = (c: User): Message[] => c.messages.filter((m) => m.from === 'bot' && m.at >= startedAt);

  async function runStep(step: Step): Promise<void> {
    switch (step.kind) {
      case 'say': {
        const c = user(step.as);
        // without "to", the message goes where the user's typed messages go (their default recipients)
        if (!step.to) return engine.send(c.id, { text: step.text });
        const targets = step.to.map((t) => {
          try {
            return user(t).address;
          } catch {
            return t;
          }
        });
        return engine.send(c.id, { text: step.text, targets });
      }
      case 'tap': {
        const c = user(step.as);
        const choice = await until(() => findChoice(c, step.tap), step.timeout || s.timeout);
        if (!choice) throw new Error(c.name + ' has no button or list row "' + step.tap + '"');
        return engine.send(c.id, choice);
      }
      case 'share': {
        const c = user(step.as);
        const contacts = step.share.map((x) => {
          if (typeof x !== 'string') return { name: str(x.name), address: str(x.address) };
          const t = user(x);
          return { name: t.name, address: t.address };
        });
        return engine.send(c.id, { contacts });
      }
      case 'add':
        return addUsers(step.user);
      case 'link': {
        const from = user(step.from);
        const to = user(step.to);
        const rel = step.rel || relationFor(session(), from, to.role)?.id;
        if (!rel) throw new Error('no relation links ' + from.name + ' to ' + to.name + '; set "rel"');
        engine.link(rel, from.id, to.id);
        return;
      }
      case 'action': {
        const want = step.action.toLowerCase();
        const a = engine
          .actions()
          .find((x) => (!step.adapter || x.type === step.adapter) && (x.id === step.action || x.label.toLowerCase() === want));
        if (!a) throw new Error('no action "' + step.action + '"');
        return engine.runAction(a.type, a.id);
      }
      case 'wait':
        return sleep(step.ms, signal);
      case 'expect': {
        const c = user(step.user);
        const want = step.text?.toLowerCase();
        const test = (m: Message) =>
          (want == null || str(m.text).toLowerCase().includes(want)) && (!step.match || step.match.test(str(m.text)));
        if (step.none) {
          await sleep(step.within ?? 300, signal);
          const got = botMessages(c);
          if (got.length) throw new Error(c.name + ' should have got nothing, but got: "' + str(got.at(-1)?.text) + '"');
          return;
        }
        const ok = await until(() => {
          const got = botMessages(c);
          return step.last ? got.length > 0 && test(got[got.length - 1]) : got.some(test);
        }, step.within ?? 1000);
        if (!ok) {
          const got = botMessages(c);
          throw new Error(
            c.name +
              ' did not get ' +
              (step.text != null ? '"' + step.text + '"' : String(step.match)) +
              (got.length ? '; last message: "' + str(got.at(-1)?.text) + '"' : '; no messages since the script started'),
          );
        }
        return;
      }
      case 'clear':
        return engine.clear();
    }
  }

  let index = 0;
  try {
    if (s.profile) engine.setProfile(s.profile);
    if (s.reset) engine.clear();
    s.users.forEach((c, i) => {
      index = -(i + 1);
      addUsers(c);
    });
    for (index = 0; index < total; index++) {
      if (signal?.aborted) throw new Error('stopped');
      const step = s.steps[index];
      const text = describe(step);
      emit({ index, total, step, text, status: 'run' });
      await runStep(step);
      emit({ index, total, step, text, status: 'ok' });
      if (delay && index < total - 1) await sleep(delay, signal);
    }
    return { ok: true, steps: total, log };
  } catch (e) {
    const where = index < 0 ? 'user ' + -index : 'step ' + (index + 1);
    const step = index >= 0 ? s.steps[index] : null;
    const message = errorText(e);
    emit({ index, total, step, text: step ? describe(step) : where, status: 'fail', error: message });
    return { ok: false, steps: total, failedAt: index, error: where + ': ' + message, log };
  }
}
